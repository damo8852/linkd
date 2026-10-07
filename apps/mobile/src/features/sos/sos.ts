import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { sendAlertRequest, newAlertId } from './sendAlertRequest';
import { createSosController, type SosController, type SosSnapshot } from './sosController';
import { hasScreenLock, requestUnlock } from './unlock';

/** The app's one SOS controller, wired to the real clock, server, and device unlock. */
const controller = createSosController({
  now: Date.now,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  newId: newAlertId,
  send: sendAlertRequest,
  unlock: requestUnlock,
});

// Timers do not run while the OS has the app suspended; catch up the moment it is back.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    controller.resume();
  }
});

/** The feature seam for screens: current SOS state and the three user actions. */
export function useSos(): { snapshot: SosSnapshot } & Pick<SosController, 'hold' | 'cancel' | 'imSafe'> {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { snapshot, hold: controller.hold, cancel: controller.cancel, imSafe: controller.imSafe };
}

/** Whether the phone has a screen lock; null until known. Rechecked when the app returns. */
export function useHasScreenLock(): boolean | null {
  const [locked, setLocked] = useState<boolean | null>(null);
  useEffect(() => {
    const check = (): void => {
      hasScreenLock().then(setLocked, () => setLocked(null));
    };
    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        check();
      }
    });
    return () => subscription.remove();
  }, []);
  return locked;
}
