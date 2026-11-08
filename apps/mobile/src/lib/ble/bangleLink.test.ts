import { encodeButtonEvent, PROTOCOL_VERSION, type Frame } from '@linkd/ble-protocol';

import { connectBangle, type BleTransport, type LinkState, type TransportHandlers } from './bangleLink';

const CURRENT = Uint8Array.from([PROTOCOL_VERSION]);

/** A transport that hands back the given version value and lets the test play the bangle. */
function fakeTransport(versionValue: Uint8Array | Error): {
  transport: BleTransport;
  bangle: () => TransportHandlers;
  disconnect: jest.Mock;
} {
  let handlers: TransportHandlers | undefined;
  const disconnect = jest.fn(async () => {});
  return {
    transport: {
      connect: async (given) => {
        handlers = given;
        if (versionValue instanceof Error) {
          throw versionValue;
        }
        return versionValue;
      },
      disconnect,
    },
    bangle: () => {
      if (handlers === undefined) {
        throw new Error('connect was never called');
      }
      return handlers;
    },
    disconnect,
  };
}

function listeners(): { states: LinkState[]; events: Frame[]; on: { state: (s: LinkState) => void; event: (e: Frame) => void } } {
  const states: LinkState[] = [];
  const events: Frame[] = [];
  return { states, events, on: { state: (s) => states.push(s), event: (e) => events.push(e) } };
}

describe('connectBangle', () => {
  it('reports connecting, then connected, for a bangle on the current protocol', async () => {
    const { transport } = fakeTransport(CURRENT);
    const { states, on } = listeners();

    await connectBangle(transport, on);

    expect(states).toEqual(['connecting', 'connected']);
  });

  it('turns button notifications into events', async () => {
    const { transport, bangle } = fakeTransport(CURRENT);
    const { events, on } = listeners();
    await connectBangle(transport, on);

    bangle().onNotification(encodeButtonEvent(true));
    bangle().onNotification(encodeButtonEvent(false));

    expect(events).toEqual([
      { type: 'button', pressed: true },
      { type: 'button', pressed: false },
    ]);
  });

  it('ignores malformed and unknown frames without throwing', async () => {
    const { transport, bangle } = fakeTransport(CURRENT);
    const { events, states, on } = listeners();
    await connectBangle(transport, on);

    bangle().onNotification(Uint8Array.from([]));
    bangle().onNotification(Uint8Array.from([0x01]));
    bangle().onNotification(Uint8Array.from([0x7f, 1]));
    bangle().onNotification(Uint8Array.from([0x01, 9]));

    expect(events).toEqual([]);
    expect(states).toEqual(['connecting', 'connected']);
  });

  it('refuses a bangle on another protocol version, drops the link, and passes on none of its frames', async () => {
    const { transport, bangle, disconnect } = fakeTransport(
      Uint8Array.from([PROTOCOL_VERSION + 1]),
    );
    const { states, events, on } = listeners();

    await connectBangle(transport, on);
    bangle().onDisconnect();
    bangle().onNotification(encodeButtonEvent(true));

    expect(states).toEqual(['connecting', 'unsupported']);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(events).toEqual([]);
  });

  it.each([
    ['empty', Uint8Array.from([])],
    ['too long', Uint8Array.from([PROTOCOL_VERSION, 0])],
  ])('refuses a bangle whose version cannot be read (%s)', async (_name, versionValue) => {
    const { transport, disconnect } = fakeTransport(versionValue);
    const { states, on } = listeners();

    await connectBangle(transport, on);

    expect(states).toEqual(['connecting', 'unsupported']);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('reports failed when the bangle cannot be reached', async () => {
    const { transport } = fakeTransport(new Error('scan timed out'));
    const { states, on } = listeners();

    await connectBangle(transport, on);

    expect(states).toEqual(['connecting', 'failed']);
  });

  it('passes on nothing that arrives before the version is checked', async () => {
    const { states, events, on } = listeners();
    const transport: BleTransport = {
      connect: async (handlers) => {
        handlers.onNotification(encodeButtonEvent(true));
        return CURRENT;
      },
      disconnect: async () => {},
    };

    await connectBangle(transport, on);

    expect(events).toEqual([]);
    expect(states).toEqual(['connecting', 'connected']);
  });

  it('reports disconnected when the link drops, and passes on nothing after that', async () => {
    const { transport, bangle } = fakeTransport(CURRENT);
    const { states, events, on } = listeners();
    await connectBangle(transport, on);

    bangle().onDisconnect();
    bangle().onNotification(encodeButtonEvent(true));

    expect(states).toEqual(['connecting', 'connected', 'disconnected']);
    expect(events).toEqual([]);
  });
});
