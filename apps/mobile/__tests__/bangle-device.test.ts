import { encodeAck, encodeSosTrigger } from '@linkd/ble-protocol';

import type { TransportHandlers } from '../src/lib/ble/bangleLink';

// The real session and module wiring, with the BLE library, permissions, storage, and the SOS
// controller replaced. Each test loads the module fresh, as an app launch does.
const mockDispatch = jest.fn();
const mockWrites: number[][] = [];
const mockStore = new Map<string, string>();
let mockHandlers: TransportHandlers | undefined;
let mockBluetooth: 'granted' | 'off' | 'later' = 'granted';
const mockStartBackground = jest.fn();

jest.mock('../modules/bangle-service', () => ({ startBackgroundLink: () => mockStartBackground() }));
jest.mock('../src/features/sos/sos', () => ({ dispatchSos: (event: unknown) => mockDispatch(event) }));
jest.mock('../src/features/onboarding/permissions', () => ({ requestPermission: async () => mockBluetooth }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
  },
}));
jest.mock('../src/lib/ble/blePlxTransport', () => ({
  createBlePlxTransport: () => ({
    connect: async (handlers: TransportHandlers) => {
      mockHandlers = handlers;
      return Uint8Array.from([jest.requireActual('@linkd/ble-protocol').PROTOCOL_VERSION]);
    },
    disconnect: async () => {},
    write: async (bytes: Uint8Array) => {
      mockWrites.push([...bytes]);
    },
  }),
}));

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function launch(): typeof import('../src/features/device/bangle') {
  let mod: typeof import('../src/features/device/bangle') | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual('../src/features/device/bangle');
  });
  if (mod === undefined) throw new Error('module did not load');
  return mod;
}

beforeEach(() => {
  mockDispatch.mockClear();
  mockWrites.length = 0;
  mockStore.clear();
  mockHandlers = undefined;
  mockBluetooth = 'granted';
  mockStartBackground.mockReset();
  // The session's reconnect timer must not outlive a test; setImmediate stays real for flush().
  jest.useFakeTimers({ doNotFake: ['setImmediate'] });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('the app-wide bangle link', () => {
  it('stays unconnected at launch until a bangle is paired', async () => {
    launch();
    await flush();

    expect(mockHandlers).toBeUndefined();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it('pairing remembers the bangle, connects, and a 3 s hold becomes an acked bangle SOS', async () => {
    const { pairBangle } = launch();

    expect(await pairBangle()).toBe(true);
    await flush();
    expect(mockStore.get('linkd.bangle-paired')).toBe('1');
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'linkUp' });

    mockHandlers?.onNotification(encodeSosTrigger(4));
    await flush();
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'sosHold', source: 'button' });
    expect(mockWrites).toEqual([[...encodeAck(4)]]);
  });

  it('a bangle paired before reconnects at launch, signed in or not, and a drop is a link loss', async () => {
    mockStore.set('linkd.bangle-paired', '1');
    launch();
    await flush();

    expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'linkUp' });
    mockHandlers?.onDisconnect();
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'linkLost' });
  });

  it('refused Bluetooth pairs nothing and remembers nothing', async () => {
    mockBluetooth = 'off';
    const { pairBangle } = launch();

    expect(await pairBangle()).toBe(false);
    await flush();
    expect(mockHandlers).toBeUndefined();
    expect(mockStore.size).toBe(0);
    expect(mockStartBackground).not.toHaveBeenCalled();
  });
});

describe('keeping the link alive in the background', () => {
  it('pairing starts the background service', async () => {
    const { pairBangle } = launch();

    await pairBangle();
    expect(mockStartBackground).toHaveBeenCalledTimes(1);
  });

  it('a bangle paired before starts the background service at launch', async () => {
    mockStore.set('linkd.bangle-paired', '1');
    launch();
    await flush();

    expect(mockStartBackground).toHaveBeenCalledTimes(1);
  });

  it('no paired bangle, no background service', async () => {
    launch();
    await flush();

    expect(mockStartBackground).not.toHaveBeenCalled();
  });

  it('a background service that cannot start never stops the bangle from connecting', async () => {
    mockStartBackground.mockImplementation(() => {
      throw new Error('ForegroundServiceStartNotAllowedException');
    });
    const { pairBangle } = launch();

    expect(await pairBangle()).toBe(true);
    await flush();
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'linkUp' });
  });
});
