import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { createBangleSession, type SessionSnapshot } from '../../lib/ble/bangleSession';
import { createBlePlxTransport } from '../../lib/ble/blePlxTransport';
import { requestPermission } from '../onboarding/permissions';
import { dispatchSos } from '../sos/sos';

const PAIRED_KEY = 'linkd.bangle-paired';

/** The app's one bangle link, feeding the SOS controller (bangleSession.ts). */
const session = createBangleSession({
  transport: createBlePlxTransport(),
  now: Date.now,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  dispatch: dispatchSos,
});

// A bangle connected before is watched again from launch, signed in or not. An unreadable flag
// leaves it unconnected; the Bangle screen shows that and offers Connect.
void AsyncStorage.getItem(PAIRED_KEY).then(
  (paired) => {
    if (paired === '1') session.start();
  },
  () => undefined,
);

/** The link state and the latest frames, for the Bangle screen. */
export function useBangle(): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

/**
 * Asks for Bluetooth, remembers the bangle so the next launch reconnects by itself, and connects.
 * Resolves false when Bluetooth was refused. A flag that cannot be saved only affects the next launch.
 */
export async function pairBangle(): Promise<boolean> {
  if ((await requestPermission('bluetooth')) === 'off') {
    return false;
  }
  await AsyncStorage.setItem(PAIRED_KEY, '1').catch(() => undefined);
  session.start();
  return true;
}
