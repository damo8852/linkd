/**
 * Runs the alert state machine in the app: owns its state, schedules the one timer it
 * needs, performs its commands (send, end), and gates cancel / "I'm safe" on a device unlock.
 * Plain TS with every side effect injected, so it is tested with a fake clock.
 *
 * Failure behavior: a send that fails or throws is shown as failed and retried with the same
 * alert id every RETRY_MS until it delivers or the alert ends. An unlock that fails, throws,
 * or finishes after the window never cancels. Nothing here can drop a pending send.
 */

import {
  INITIAL_STATE,
  nextDeadline,
  transition,
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

export type OutgoingAlert = { id: string; trigger: Trigger; triggeredAt: number };

export type SosDeps = {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Client-generated alert id; the server uses it to make retries idempotent. */
  newId(): string;
  send(alert: OutgoingAlert): Promise<SendResult>;
  unlock(reason: 'cancel' | 'imSafe'): Promise<UnlockResult>;
};

export type SosSnapshot = { state: SosState; noContacts: boolean };

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
  let snapshot: SosSnapshot = { state: INITIAL_STATE, noContacts: false };
  const listeners = new Set<() => void>();
  let deadlineTimer: unknown = null;
  let retryTimer: unknown = null;
  let current: OutgoingAlert | null = null;

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
      stopAlert();
      if (command.type === 'sendAlert') {
        current = { id: deps.newId(), trigger: command.trigger, triggeredAt: now };
        update({ noContacts: false });
        attempt(current);
      } else {
        update({ noContacts: false });
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
