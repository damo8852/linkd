/**
 * Runs the alert state machine in the app: owns its state, schedules the one timer it
 * needs, performs its commands (send, end), and gates cancel / "I'm safe" on a device unlock.
 * Plain TS with every side effect injected, so it is tested with a fake clock.
 *
 * Failure behavior: a send that fails or throws is shown as failed and retried with the same
 * alert id every RETRY_MS until it delivers or the alert ends. Ending an alert ("I'm safe" or
 * the 60 min auto-end) tells the server the same way: a failed end is shown and retried with the
 * same id and reason until the server confirms, even after a new alert starts. Every countdown is
 * also armed on the server under the id its send will use, so a suspended app still sends; a
 * disarm is retried until the server answers, and one that finds the alert already sent either
 * ends it as safe (the user unlocked to cancel) or shows it as active (no unlock). An unlock that
 * fails, throws, or finishes after the window never cancels. Nothing here can drop a pending send.
 */

import {
  INITIAL_STATE,
  nextDeadline,
  transition,
  type DisarmReason,
  type EndReason,
  type HoldSource,
  type SosEvent,
  type SosState,
  type Trigger,
} from './alertMachine';

export const RETRY_MS = 5_000;

/** `noContacts`: the server has nobody to text, so retrying cannot help. */
export type SendResult = 'delivered' | 'failed' | 'noContacts';

/** `noLock`: the phone has no screen lock, so there is nothing to unlock with. */
export type UnlockResult = 'unlocked' | 'failed' | 'noLock';

/** `fired`: the server sent the alert before the disarm reached it. */
export type DisarmResult = 'disarmed' | 'fired';

export type OutgoingAlert = { id: string; trigger: Trigger; triggeredAt: number };

export type SosDeps = {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Client-generated alert id; the server uses it to make retries idempotent. */
  newId(): string;
  send(alert: OutgoingAlert): Promise<SendResult>;
  unlock(reason: 'cancel' | 'imSafe'): Promise<UnlockResult>;
  /** Arms the server to send this alert after `delayMs`. A failure leaves only the phone's countdown. */
  arm(id: string, trigger: Trigger, delayMs: number): Promise<unknown>;
  /** Disarms the server's send. Rejects when the server could not be reached. */
  disarm(id: string): Promise<DisarmResult>;
  /** Tells the server the alert ended. Resolves true only once the server confirmed it. */
  end(id: string, reason: EndReason): Promise<boolean>;
};

/**
 * `endFailed`: an ended alert's end has not reached the server yet; it is being retried.
 * `disarmFailed`: a cancelled countdown's disarm has not reached the server yet, so it may still send.
 * `lateCancel`: the server sent the SOS before the cancel reached it; the alert is being ended as safe.
 */
export type SosSnapshot = {
  state: SosState;
  noContacts: boolean;
  endFailed: boolean;
  disarmFailed: boolean;
  lateCancel: boolean;
};

export type SosController = {
  getSnapshot(): SosSnapshot;
  subscribe(listener: () => void): () => void;
  /** A completed hold on the bangle or the in-app button. */
  hold(source: HoldSource): void;
  /** Asks for a device unlock, then cancels the countdown. Resolves true only if it was cancelled. */
  cancel(): Promise<boolean>;
  /** Asks for a device unlock, then ends the active alert. Resolves true only if it ended. */
  imSafe(): Promise<boolean>;
  /** Feeds any other event (link, battery, Bluetooth) into the machine. */
  dispatch(event: SosEvent): void;
  /** Call when the app returns to the foreground: applies deadlines missed while suspended. */
  resume(): void;
};

export function createSosController(deps: SosDeps): SosController {
  let snapshot: SosSnapshot = {
    state: INITIAL_STATE,
    noContacts: false,
    endFailed: false,
    disarmFailed: false,
    lateCancel: false,
  };
  const listeners = new Set<() => void>();
  let deadlineTimer: unknown = null;
  let retryTimer: unknown = null;
  let current: OutgoingAlert | null = null;
  const failedEnds = new Set<string>();
  /** The running countdown's id, armed on the server; its send uses the same id. */
  let armed: { id: string; trigger: Trigger } | null = null;
  const failedDisarms = new Set<string>();

  function update(next: Partial<SosSnapshot>): void {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  }

  function attempt(alert: OutgoingAlert): void {
    void deps
      .send(alert)
      .catch((): SendResult => 'failed')
      .then((result) => {
        // The alert ended (or a new one started) while this was in flight.
        if (current !== alert) return;
        if (result === 'delivered') {
          dispatch({ type: 'alertDelivered' });
          return;
        }
        if (result === 'noContacts') {
          update({ noContacts: true });
        } else {
          retryTimer = deps.setTimer(() => attempt(alert), RETRY_MS);
        }
        dispatch({ type: 'alertFailed' });
      });
  }

  // Never cancelled: an end must reach the server, whatever the alert state does next.
  function attemptEnd(id: string, reason: EndReason): void {
    void deps
      .end(id, reason)
      .catch(() => false)
      .then((ended) => {
        if (ended) {
          failedEnds.delete(id);
        } else {
          failedEnds.add(id);
          deps.setTimer(() => attemptEnd(id, reason), RETRY_MS);
        }
        update({ endFailed: failedEnds.size > 0 });
      });
  }

  // Never cancelled, like an end: until the server answers, it may still send.
  function attemptDisarm(id: string, trigger: Trigger, reason: DisarmReason): void {
    deps.disarm(id).then(
      (result) => {
        failedDisarms.delete(id);
        update({ disarmFailed: failedDisarms.size > 0 });
        if (result !== 'fired') return;
        if (reason === 'cancel') {
          // The user unlocked to cancel, so "safe" is what they said.
          update({ lateCancel: true });
          attemptEnd(id, 'user');
        } else if (snapshot.state.kind === 'idle' || snapshot.state.kind === 'unprotected') {
          // Nobody unlocked: show the alert as active so it can only end by unlock or timeout.
          armed = { id, trigger };
          dispatch({ type: 'serverSent', trigger });
        }
        // ponytail: a newer countdown is running, so this sent alert has no screen and no end;
        // track several alerts at once if that ever happens outside a test.
      },
      () => {
        failedDisarms.add(id);
        update({ disarmFailed: true });
        deps.setTimer(() => attemptDisarm(id, trigger, reason), RETRY_MS);
      },
    );
  }

  function stopAlert(): void {
    current = null;
    if (retryTimer !== null) deps.clearTimer(retryTimer);
    retryTimer = null;
  }

  function dispatch(event: SosEvent): void {
    const now = deps.now();
    const result = transition(snapshot.state, event, now);
    update({ state: result.state });

    for (const command of result.commands) {
      if (command.type === 'arm') {
        if (armed === null) update({ lateCancel: false });
        armed = { id: armed?.id ?? deps.newId(), trigger: command.trigger };
        deps.arm(armed.id, command.trigger, Math.max(0, command.sendAt - now)).catch(() => undefined);
        continue;
      }
      if (command.type === 'disarm') {
        if (armed !== null) attemptDisarm(armed.id, armed.trigger, command.reason);
        armed = null;
        continue;
      }
      const ending = current;
      stopAlert();
      if (command.type === 'sendAlert') {
        current = { id: armed?.id ?? deps.newId(), trigger: command.trigger, triggeredAt: now };
        armed = null;
        update({ noContacts: false });
        attempt(current);
      } else {
        update({ noContacts: false });
        if (ending !== null) attemptEnd(ending.id, command.reason);
      }
    }

    if (deadlineTimer !== null) deps.clearTimer(deadlineTimer);
    const deadline = nextDeadline(snapshot.state);
    deadlineTimer =
      deadline === null ? null : deps.setTimer(() => dispatch({ type: 'tick' }), Math.max(0, deadline - deps.now()));
  }

  async function confirm(event: 'cancel' | 'imSafe', from: SosState['kind']): Promise<boolean> {
    let result: UnlockResult;
    try {
      result = await deps.unlock(event);
    } catch {
      result = 'failed';
    }
    if (result === 'failed') return false;
    // The machine ignores a cancel that arrives after the window, so check what it did.
    dispatch({ type: 'tick' });
    if (snapshot.state.kind !== from) return false;
    dispatch({ type: event });
    return snapshot.state.kind === 'idle';
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hold: (source) => dispatch({ type: 'sosHold', source }),
    cancel: () => confirm('cancel', 'cancelWindow'),
    imSafe: () => confirm('imSafe', 'active'),
    dispatch,
    resume: () => dispatch({ type: 'tick' }),
  };
}
