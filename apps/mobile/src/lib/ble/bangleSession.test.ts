import {
  encodeAck,
  encodeBatteryCritical,
  encodeButtonEvent,
  encodeSosTrigger,
  PROTOCOL_VERSION,
  TRIGGER_PENDING_MS,
} from '@linkd/ble-protocol';

import type { SosEvent } from '../../features/sos/alertMachine';
import type { BleTransport, TransportHandlers } from './bangleLink';
import { RECONNECT_MS, createBangleSession } from './bangleSession';

const CURRENT = Uint8Array.from([PROTOCOL_VERSION]);
const OLD = Uint8Array.from([PROTOCOL_VERSION - 1]);

/** A fake bangle: each connect uses the next scripted answer (a version value, or an Error for "not found"). */
function harness(answers: (Uint8Array | Error)[]) {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let handlers: TransportHandlers | undefined;
  const writes: number[][] = [];
  const dispatched: SosEvent[] = [];
  let connects = 0;
  let writeFails = false;

  const transport: BleTransport = {
    connect: async (given) => {
      connects++;
      handlers = given;
      const answer = answers.shift() ?? new Error('not found');
      if (answer instanceof Error) throw answer;
      return answer;
    },
    disconnect: jest.fn(async () => {}),
    write: async (bytes) => {
      if (writeFails) throw new Error('write failed');
      writes.push([...bytes]);
    },
  };

  const session = createBangleSession({
    transport,
    now: () => now,
    setTimer: (fn, ms) => {
      const handle = nextHandle++;
      timers.set(handle, { at: now + ms, fn });
      return handle;
    },
    clearTimer: (handle) => {
      timers.delete(handle as number);
    },
    dispatch: (event) => dispatched.push(event),
  });

  const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
  async function advance(ms: number): Promise<void> {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].fn();
      await flush();
    }
    now = end;
    await flush();
  }

  return {
    session,
    transport,
    dispatched,
    writes,
    advance,
    flush,
    bangle: (): TransportHandlers => {
      if (handlers === undefined) throw new Error('never connected');
      return handlers;
    },
    connects: () => connects,
    failWrites: () => {
      writeFails = true;
    },
    types: () => dispatched.map((e) => e.type),
  };
}

describe('bangle session -> SOS controller', () => {
  it('a connect is a link up', async () => {
    const h = harness([CURRENT]);
    h.session.start();
    await h.flush();

    expect(h.dispatched).toEqual([{ type: 'linkUp' }]);
    expect(h.session.getSnapshot().link).toBe('connected');
  });

  it('an SOS trigger is acked and becomes one bangle hold', async () => {
    const h = harness([CURRENT]);
    h.session.start();
    await h.flush();

    h.bangle().onNotification(encodeSosTrigger(7));
    await h.flush();

    expect(h.writes).toEqual([[...encodeAck(7)]]);
    expect(h.dispatched.at(-1)).toEqual({ type: 'sosHold', source: 'button' });
  });

  it('a resent trigger is acked again but never starts a second SOS; the next seq does', async () => {
    const h = harness([CURRENT]);
    h.session.start();
    await h.flush();

    h.bangle().onNotification(encodeSosTrigger(7));
    h.bangle().onNotification(encodeSosTrigger(7));
    h.bangle().onNotification(encodeSosTrigger(8));
    await h.flush();

    expect(h.writes).toEqual([[...encodeAck(7)], [...encodeAck(7)], [...encodeAck(8)]]);
    expect(h.dispatched.filter((e) => e.type === 'sosHold')).toHaveLength(2);
  });

  it('a trigger resent after a reconnect is still the same SOS', async () => {
    const h = harness([CURRENT, CURRENT]);
    h.session.start();
    await h.flush();
    h.bangle().onNotification(encodeSosTrigger(7));
    h.bangle().onDisconnect();
    await h.advance(RECONNECT_MS);

    h.bangle().onNotification(encodeSosTrigger(7));
    await h.flush();

    expect(h.dispatched.filter((e) => e.type === 'sosHold')).toHaveLength(1);
    expect(h.writes).toEqual([[...encodeAck(7)], [...encodeAck(7)]]);
  });

  it('a seq last seen longer ago than the bangle keeps a trigger is a new SOS', async () => {
    const h = harness([CURRENT]);
    h.session.start();
    await h.flush();
    h.bangle().onNotification(encodeSosTrigger(7));
    await h.advance(TRIGGER_PENDING_MS + 1);

    h.bangle().onNotification(encodeSosTrigger(7));
    await h.flush();

    expect(h.dispatched.filter((e) => e.type === 'sosHold')).toHaveLength(2);
  });

  it('an ack that cannot be written still raises the SOS (the bangle will resend)', async () => {
    const h = harness([CURRENT]);
    h.failWrites();
    h.session.start();
    await h.flush();

    h.bangle().onNotification(encodeSosTrigger(3));
    await h.flush();

    expect(h.dispatched.at(-1)).toEqual({ type: 'sosHold', source: 'button' });
  });

  it('battery critical reaches the controller; button edges only reach the diagnostic list', async () => {
    const h = harness([CURRENT]);
    h.session.start();
    await h.flush();

    h.bangle().onNotification(encodeButtonEvent(true));
    h.bangle().onNotification(encodeButtonEvent(false));
    h.bangle().onNotification(encodeBatteryCritical());
    await h.flush();

    expect(h.types()).toEqual(['linkUp', 'batteryCritical']);
    expect(h.session.getSnapshot().frames.map((f) => f.type)).toEqual(['batteryCritical', 'button', 'button']);
  });

  it('an unexpected disconnect is a link loss, then it reconnects and reports link up', async () => {
    const h = harness([CURRENT, CURRENT]);
    h.session.start();
    await h.flush();

    h.bangle().onDisconnect();
    expect(h.types()).toEqual(['linkUp', 'linkLost']);
    expect(h.session.getSnapshot().link).toBe('disconnected');

    await h.advance(RECONNECT_MS);
    expect(h.types()).toEqual(['linkUp', 'linkLost', 'linkUp']);
  });

  it('keeps retrying while the bangle is out of reach, without repeating the link loss', async () => {
    const h = harness([CURRENT, new Error('not found'), new Error('not found'), CURRENT]);
    h.session.start();
    await h.flush();
    h.bangle().onDisconnect();

    await h.advance(3 * RECONNECT_MS);

    expect(h.connects()).toBe(4);
    expect(h.types()).toEqual(['linkUp', 'linkLost', 'linkUp']);
  });

  it('a first connect that cannot find the bangle is not a link loss, and is retried', async () => {
    const h = harness([new Error('not found'), CURRENT]);
    h.session.start();
    await h.flush();
    expect(h.dispatched).toEqual([]);

    await h.advance(RECONNECT_MS);
    expect(h.types()).toEqual(['linkUp']);
  });

  it('a bangle on another protocol version is not a link loss and is not retried', async () => {
    const h = harness([OLD, CURRENT]);
    h.session.start();
    await h.flush();
    await h.advance(10 * RECONNECT_MS);

    expect(h.dispatched).toEqual([]);
    expect(h.connects()).toBe(1);
    expect(h.session.getSnapshot().link).toBe('unsupported');
  });

  it('stopping disconnects without a link loss and stops reconnecting', async () => {
    const h = harness([CURRENT, CURRENT]);
    h.session.start();
    await h.flush();

    await h.session.stop();
    h.bangle().onDisconnect();
    await h.advance(10 * RECONNECT_MS);

    expect(h.transport.disconnect).toHaveBeenCalled();
    expect(h.types()).toEqual(['linkUp']);
    expect(h.connects()).toBe(1);
  });

  it('start while already running does not open a second connection', async () => {
    const h = harness([CURRENT, CURRENT]);
    h.session.start();
    h.session.start();
    await h.flush();

    expect(h.connects()).toBe(1);
  });
});
