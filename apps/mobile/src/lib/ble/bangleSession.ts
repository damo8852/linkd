import { encodeAck, TRIGGER_PENDING_MS, type Frame } from '@linkd/ble-protocol';

import type { SosEvent } from '../../features/sos/alertMachine';
import { connectBangle, type BleTransport, type LinkState } from './bangleLink';

/** Wait between reconnect attempts after the bangle drops or cannot be found. */
export const RECONNECT_MS = 2_000;

const MAX_FRAMES_SHOWN = 20;

/** `idle`: never started, or stopped by the app. */
export type SessionSnapshot = { link: LinkState | 'idle'; frames: readonly Frame[] };

export type BangleSession = {
  /** Connects and keeps reconnecting after every drop until `stop`. Does nothing if already running. */
  start(): void;
  /** Disconnects on purpose: not a link loss, and no reconnect. */
  stop(): Promise<void>;
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
};

export type BangleSessionDeps = {
  transport: BleTransport;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** The SOS controller's dispatch. */
  dispatch(event: SosEvent): void;
};

/**
 * The long-lived link to the bangle, turned into SOS controller events:
 * - connected (right protocol version): `linkUp`
 * - an unexpected disconnect after being connected: `linkLost`, then a reconnect every RECONNECT_MS
 * - `SOS_TRIGGER`: an `ACK` with its seq, and `sosHold('button')` once per seq; the bangle resends
 *   until acked, even across reconnects, so a seq seen within TRIGGER_PENDING_MS is the same SOS
 * - `BATTERY_CRITICAL`: `batteryCritical`
 * Button edges are shown in the diagnostic list only.
 *
 * On failure: an ack that cannot be written is ignored (the bangle resends and the next ack may
 * land; the SOS is raised either way). Not finding the bangle is retried and is never a link loss
 * by itself, and neither is a disconnect the app asked for or a bangle on another protocol version.
 */
export function createBangleSession(deps: BangleSessionDeps): BangleSession {
  let snapshot: SessionSnapshot = { link: 'idle', frames: [] };
  const listeners = new Set<() => void>();
  let running = false;
  let connected = false;
  let retryTimer: unknown = null;
  /** seq -> when its trigger was last received. */
  const seenTriggers = new Map<number, number>();

  function update(next: Partial<SessionSnapshot>): void {
    snapshot = { ...snapshot, ...next };
    listeners.forEach((listener) => listener());
  }

  function retryLater(): void {
    if (!running || retryTimer !== null) return;
    retryTimer = deps.setTimer(() => {
      retryTimer = null;
      void attempt();
    }, RECONNECT_MS);
  }

  function onTrigger(seq: number): void {
    deps.transport.write(encodeAck(seq)).catch(() => undefined);
    const now = deps.now();
    const lastSeen = seenTriggers.get(seq);
    seenTriggers.set(seq, now);
    if (lastSeen === undefined || now - lastSeen > TRIGGER_PENDING_MS) {
      deps.dispatch({ type: 'sosHold', source: 'button' });
    }
  }

  async function attempt(): Promise<void> {
    await connectBangle(deps.transport, {
      state: (link) => {
        if (!running) return;
        update({ link });
        if (link === 'connected') {
          connected = true;
          deps.dispatch({ type: 'linkUp' });
        } else if (link === 'disconnected') {
          if (connected) deps.dispatch({ type: 'linkLost' });
          connected = false;
          retryLater();
        } else if (link === 'failed') {
          retryLater();
        }
        // `unsupported`: this bangle will not change version by itself, so no retry.
      },
      event: (frame) => {
        if (!running) return;
        update({ frames: [frame, ...snapshot.frames].slice(0, MAX_FRAMES_SHOWN) });
        if (frame.type === 'sosTrigger') onTrigger(frame.seq);
        else if (frame.type === 'batteryCritical') deps.dispatch({ type: 'batteryCritical' });
      },
    });
  }

  return {
    start() {
      if (running) return;
      running = true;
      void attempt();
    },
    async stop() {
      running = false;
      connected = false;
      if (retryTimer !== null) deps.clearTimer(retryTimer);
      retryTimer = null;
      update({ link: 'idle' });
      await deps.transport.disconnect().catch(() => undefined);
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
