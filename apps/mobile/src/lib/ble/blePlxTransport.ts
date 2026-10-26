import { EVENTS_CHAR_UUID, SERVICE_UUID, VERSION_CHAR_UUID } from '@linkd/ble-protocol';
import { BleManager, type Device } from 'react-native-ble-plx';

import type { BleTransport, TransportHandlers } from './bangleLink';

const SCAN_TIMEOUT_MS = 15_000;

// The library hands characteristic values over as base64.
function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

/** The real transport. The only file that imports the BLE library. */
export function createBlePlxTransport(): BleTransport {
  // Created on first use: constructing it is what makes iOS show the Bluetooth prompt.
  let manager: BleManager | undefined;
  let device: Device | undefined;

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

  return {
    async connect(handlers: TransportHandlers): Promise<Uint8Array> {
      manager ??= new BleManager();
      const connected = await (await scan(manager)).connect();
      device = connected;
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
    async disconnect(): Promise<void> {
      await device?.cancelConnection();
      device = undefined;
    },
  };
}
