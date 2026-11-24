import { PROTOCOL_VERSION } from '@linkd/ble-protocol';
import { Platform } from 'react-native';

import type { TransportHandlers } from './bangleLink';
import { createBlePlxTransport } from './blePlxTransport';

// A fake of the BLE library: one bangle, counting how it was found.
type FakeDevice = { id: string; connect(): Promise<FakeDevice> } & Record<string, unknown>;

const mockLib = {
  options: undefined as Record<string, unknown> | undefined,
  scans: 0,
  connectedById: [] as string[],
  systemConnected: [] as FakeDevice[],
};

function mockDevice(id: string): FakeDevice {
  const device: FakeDevice = {
    id,
    connect: async () => device,
    onDisconnected: () => undefined,
    discoverAllServicesAndCharacteristics: async () => device,
    readCharacteristicForService: async () => ({ value: btoa(String.fromCharCode(PROTOCOL_VERSION)) }),
    monitorCharacteristicForService: () => undefined,
    cancelConnection: async () => device,
  };
  return device;
}

jest.mock('react-native-ble-plx', () => ({
  BleManager: class {
    constructor(options: Record<string, unknown>) {
      mockLib.options = options;
    }
    startDeviceScan(_uuids: unknown, _options: unknown, listener: (error: null, device: FakeDevice) => void): void {
      mockLib.scans += 1;
      listener(null, mockDevice('bangle-1'));
    }
    stopDeviceScan(): void {}
    async connectedDevices(): Promise<FakeDevice[]> {
      return mockLib.systemConnected;
    }
    async connectToDevice(id: string): Promise<FakeDevice> {
      mockLib.connectedById.push(id);
      return mockDevice(id);
    }
  },
}));

const handlers: TransportHandlers = { onNotification: () => undefined, onDisconnect: () => undefined };

beforeEach(() => {
  mockLib.options = undefined;
  mockLib.scans = 0;
  mockLib.connectedById = [];
  mockLib.systemConnected = [];
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the BLE library transport', () => {
  it('creates the manager with a restore identifier so iOS can relaunch the app for the bangle', async () => {
    await createBlePlxTransport().connect(handlers);

    expect(mockLib.options?.restoreStateIdentifier).toBe('linkd-bangle');
    expect(typeof mockLib.options?.restoreStateFunction).toBe('function');
  });

  it('uses a bangle the system already has connected (iOS restored it) without scanning', async () => {
    mockLib.systemConnected = [mockDevice('bangle-restored')];

    const version = await createBlePlxTransport().connect(handlers);

    expect([...version]).toEqual([PROTOCOL_VERSION]);
    expect(mockLib.scans).toBe(0);
  });

  it('on iOS, reconnects to the same bangle by id without scanning (a pending connect has no timeout)', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const transport = createBlePlxTransport();

    await transport.connect(handlers);
    await transport.connect(handlers);

    expect(mockLib.scans).toBe(1);
    expect(mockLib.connectedById).toEqual(['bangle-1']);
  });

  it('on Android, a reconnect scans again', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const transport = createBlePlxTransport();

    await transport.connect(handlers);
    await transport.connect(handlers);

    expect(mockLib.scans).toBe(2);
    expect(mockLib.connectedById).toEqual([]);
  });
});
