/**
 * The SOS alert state machine: decides whether and when an SOS is sent.
 * Spec: docs/design/sos_alert_flow.md. Plain TS, no React Native imports.
 *
 * Time is passed in (`now`, epoch ms) rather than read, so tests never sleep.
 * The caller feeds BLE/UI/OS events in, runs the returned commands, and ticks the
 * machine at `nextDeadline(state)`. A late or missing tick never skips a send:
 * every transition first catches up on overdue deadlines.
 *
 * Guiding rule: a missed alert is worse than a false alert. Only a device unlock
 * cancels; a reconnect or a late event never does.
 */

export const BUTTON_CANCEL_WINDOW_MS = 5_000;
export const GRACE_PERIOD_MS = 20_000;
export const RECONNECT_STABLE_MS = 5_000;
export const LINK_LOSS_CANCEL_WINDOW_MS = 30_000;
export const LIVE_LOCATION_MS = 60 * 60_000;

export type HoldSource = 'button' | 'inApp';
export type Trigger = HoldSource | 'linkLoss';
export type BenignReason = 'batteryCritical' | 'bluetoothOff' | 'phoneDying';

export type SosState =
  /** `batteryCritical`: the bangle warned it is shutting down, so the next link loss is benign. */
  | { kind: 'idle'; batteryCritical: boolean }
  /** Benign link loss: show a persistent warning; never sends. */
  | { kind: 'unprotected'; reason: BenignReason }
  /** Silent wait after link loss. `linkUpSince`: reconnected at, not yet stable. */
  | { kind: 'grace'; endsAt: number; linkUpSince: number | null }
  /** Visible countdown; device unlock cancels. `bangleReconnected` is for the link-loss UI copy. */
  | { kind: 'cancelWindow'; trigger: Trigger; endsAt: number; bangleReconnected: boolean }
  /** Sent. Retries, fallbacks, and the alert id belong to the sender, not this machine. */
  | { kind: 'active'; trigger: Trigger; endsAt: number; delivery: 'pending' | 'delivered' | 'failed' };

export type SosEvent =
  | { type: 'sosHold'; source: HoldSource }
  | { type: 'linkLost' }
  | { type: 'linkUp' }
  | { type: 'batteryCritical' }
  | { type: 'bluetoothOff' }
  | { type: 'phoneDying' }
  /** Device unlock succeeded on the countdown screen. Arriving after the window expired, it does nothing. */
  | { type: 'cancel' }
  /** Device unlock succeeded on the "I'm safe" action of an active alert. */
  | { type: 'imSafe' }
  | { type: 'alertDelivered' }
  | { type: 'alertFailed' }
  | { type: 'tick' };

export type Command = { type: 'sendAlert'; trigger: Trigger } | { type: 'endAlert' };

export type Result = { state: SosState; commands: Command[] };

export const INITIAL_STATE: SosState = { kind: 'idle', batteryCritical: false };

/** When the caller must next deliver a `tick`, or null if no timer is running. */
export function nextDeadline(state: SosState): number | null {
  switch (state.kind) {
    case 'grace':
      return state.linkUpSince === null
        ? state.endsAt
        : Math.min(state.endsAt, state.linkUpSince + RECONNECT_STABLE_MS);
    case 'cancelWindow':
    case 'active':
      return state.endsAt;
    default:
      return null;
  }
}

function send(trigger: Trigger, now: number, commands: Command[]): SosState {
  commands.push({ type: 'sendAlert', trigger });
  return { kind: 'active', trigger, endsAt: now + LIVE_LOCATION_MS, delivery: 'pending' };
}

function holdWindow(source: HoldSource, now: number): SosState {
  return { kind: 'cancelWindow', trigger: source, endsAt: now + BUTTON_CANCEL_WINDOW_MS, bangleReconnected: false };
}

/** Applies every deadline at or before `now`, in the order they fell due. */
function catchUp(state: SosState, now: number, commands: Command[]): SosState {
  for (;;) {
    const due = nextDeadline(state);
    if (due === null || due > now) return state;
    switch (state.kind) {
      case 'grace': {
        const stableAt = state.linkUpSince === null ? Infinity : state.linkUpSince + RECONNECT_STABLE_MS;
        state =
          stableAt <= state.endsAt
            ? INITIAL_STATE
            : {
                kind: 'cancelWindow',
                trigger: 'linkLoss',
                // Anchored to the deadline, not `now`, so a late tick cannot postpone the send.
                endsAt: state.endsAt + LINK_LOSS_CANCEL_WINDOW_MS,
                bangleReconnected: state.linkUpSince !== null,
              };
        break;
      }
      case 'cancelWindow':
        state = send(state.trigger, now, commands);
        break;
      case 'active':
        commands.push({ type: 'endAlert' });
        state = INITIAL_STATE;
        break;
      default:
        return state;
    }
  }
}

/**
 * Advances the machine. Pure: same inputs, same outputs.
 * Never throws; an event that does not apply in the current state leaves it unchanged
 * (failing safe: nothing here can drop a pending send).
 */
export function transition(current: SosState, event: SosEvent, now: number): Result {
  const commands: Command[] = [];
  const state = catchUp(current, now, commands);
  return { state: apply(state, event, now, commands), commands };
}

function apply(state: SosState, event: SosEvent, now: number, commands: Command[]): SosState {
  switch (state.kind) {
    case 'idle':
      switch (event.type) {
        case 'sosHold':
          return holdWindow(event.source, now);
        case 'linkLost':
          return state.batteryCritical
            ? { kind: 'unprotected', reason: 'batteryCritical' }
            : { kind: 'grace', endsAt: now + GRACE_PERIOD_MS, linkUpSince: null };
        case 'linkUp':
          return INITIAL_STATE;
        case 'batteryCritical':
          return { kind: 'idle', batteryCritical: true };
        case 'bluetoothOff':
        case 'phoneDying':
          return { kind: 'unprotected', reason: event.type };
        default:
          return state;
      }

    case 'unprotected':
      switch (event.type) {
        case 'sosHold':
          return holdWindow(event.source, now);
        case 'linkUp':
          return INITIAL_STATE;
        default:
          return state;
      }

    case 'grace':
      switch (event.type) {
        case 'sosHold':
          return holdWindow(event.source, now);
        case 'linkUp':
          return state.linkUpSince === null ? { ...state, linkUpSince: now } : state;
        case 'linkLost':
          return { ...state, linkUpSince: null };
        // The OS may report the disconnect before the Bluetooth-off / shutdown that caused it.
        case 'bluetoothOff':
        case 'phoneDying':
          return { kind: 'unprotected', reason: event.type };
        default:
          // Grace is silent: there is nothing on screen to cancel, so `cancel` is ignored.
          return state;
      }

    case 'cancelWindow':
      switch (event.type) {
        case 'sosHold':
          return send(event.source, now, commands);
        case 'cancel':
          return INITIAL_STATE;
        case 'linkUp':
          return state.trigger === 'linkLoss' ? { ...state, bangleReconnected: true } : state;
        case 'linkLost':
          return state.trigger === 'linkLoss' ? { ...state, bangleReconnected: false } : state;
        default:
          return state;
      }

    case 'active':
      switch (event.type) {
        case 'imSafe':
          commands.push({ type: 'endAlert' });
          return INITIAL_STATE;
        case 'alertDelivered':
          return { ...state, delivery: 'delivered' };
        case 'alertFailed':
          return { ...state, delivery: 'failed' };
        default:
          return state;
      }
  }
}
