import { ACK_CHAR_UUID, EVENTS_CHAR_UUID, SERVICE_UUID, VERSION_CHAR_UUID } from '@linkd/ble-protocol';
import { Platform } from 'react-native';
import { BleManager, type Device } from 'react-native-ble-plx';

import type { BleTransport, TransportHandlers } from './bangleLink';

const SCAN_TIMEOUT_MS = 15_000;

/** iOS state restoration: lets iOS relaunch the app in the background for the bangle. */
const RESTORE_ID = 'linkd-bangle';

// The library hands characteristic values over as base64.
function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** The real transport. The only file that imports the BLE library. */
export function createBlePlxTransport(): BleTransport {
  // Created on first use: constructing it is what makes iOS show the Bluetooth prompt.
  let manager: BleManager | undefined;
  let device: Device | undefined;
  /** The last bangle connected in this process. */
  let knownId: string | undefined;

  function scan(ble: BleManager): Promise<Device> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        void ble.stopDeviceScan();
        reject(new Error('No bangle found'));
      }, SCAN_TIMEOUT_MS);
      void ble.startDeviceScan([SERVICE_UUID], null, (error, found) => {
        if (error === null && found === null) {
          return;
        }
        clearTimeout(timeout);
        void ble.stopDeviceScan();
        if (found !== null) {
          resolve(found);
        } else {
          reject(error ?? new Error('Scan failed'));
        }
      });
    });
  }

  /**
   * Finds the bangle: one the system already has connected (iOS restored it), else on iOS the last
   * one by id (a pending connect with no timeout, which iOS completes in the background when the
   * bangle is back in range; a suspended app's scan timers never fire), else a scan.
   */
  async function find(ble: BleManager): Promise<Device> {
    const [restored] = await ble.connectedDevices([SERVICE_UUID]);
    if (restored !== undefined) return restored;
    // ponytail: the id lives only in this process; a cold launch scans. Persist it if cold
    // launches out of range turn out to matter on iOS.
    if (Platform.OS === 'ios' && knownId !== undefined) return ble.connectToDevice(knownId);
    return scan(ble);
  }

  return {
    async connect(handlers: TransportHandlers): Promise<Uint8Array> {
      // State restoration is handled by `find` asking for already-connected bangles.
      manager ??= new BleManager({ restoreStateIdentifier: RESTORE_ID, restoreStateFunction: () => undefined });
      const connected = await (await find(manager)).connect();
      device = connected;
      knownId = connected.id;
      connected.onDisconnected(() => handlers.onDisconnect());
      await connected.discoverAllServicesAndCharacteristics();
      const version = await connected.readCharacteristicForService(SERVICE_UUID, VERSION_CHAR_UUID);
      connected.monitorCharacteristicForService(SERVICE_UUID, EVENTS_CHAR_UUID, (_error, characteristic) => {
        if (typeof characteristic?.value === 'string') {
          handlers.onNotification(fromBase64(characteristic.value));
        }
      });
      return fromBase64(version.value ?? '');
    },
    async write(bytes: Uint8Array): Promise<void> {
      if (device === undefined) throw new Error('Not connected');
      await device.writeCharacteristicWithoutResponseForService(SERVICE_UUID, ACK_CHAR_UUID, toBase64(bytes));
    },
    async disconnect(): Promise<void> {
      await device?.cancelConnection();
      device = undefined;
    },
  };
}
