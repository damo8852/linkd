import { useEffect, useState, useSyncExternalStore } from 'react';
import * as Notifications from 'expo-notifications';
import * as SMS from 'expo-sms';
import { AppState } from 'react-native';

import { encryptedStorage } from '../../lib/encryptedStorage';
import { readContactsCache } from '../emergency-contacts/contactsCache';
import { createCountdownNotifier } from './countdownNotification';
import { armRequest, disarmRequest, endAlertRequest, newAlertId, sendAlertRequest } from './sendAlertRequest';
import { lastKnownFix } from './location';
import { openSmsFallback } from './smsFallback';
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
  arm: armRequest,
  disarm: disarmRequest,
  end: endAlertRequest,
  fallback: () =>
    openSmsFallback({
      isAvailable: SMS.isAvailableAsync,
      readCache: () => readContactsCache(encryptedStorage),
      lastLocation: lastKnownFix,
      compose: (to, body) => SMS.sendSMSAsync(to, body),
    }),
});

const COUNTDOWN_NOTIFICATION = 'sos-countdown';

const syncCountdownNotification = createCountdownNotifier({
  schedule: (at) =>
    Notifications.scheduleNotificationAsync({
      identifier: COUNTDOWN_NOTIFICATION,
      // Discreet by default: nothing on a lock screen says SOS.
      content: { title: 'LINKD', body: 'Tap to open.' },
      trigger: at > Date.now() ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at } : null,
    }),
  clear: () =>
    Promise.all([
      Notifications.cancelScheduledNotificationAsync(COUNTDOWN_NOTIFICATION),
      Notifications.dismissNotificationAsync(COUNTDOWN_NOTIFICATION),
    ]),
});
controller.subscribe(() => syncCountdownNotification(controller.getSnapshot().state));

// In the foreground the overlay already shows the countdown, so no banner; it still goes to the
// list, so it is there to tap once the phone is locked.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const countdown = notification.request.identifier === COUNTDOWN_NOTIFICATION;
    return { shouldShowBanner: !countdown, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false };
  },
});

// Timers do not run while the OS has the app suspended; catch up the moment it is back.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    controller.resume();
  }
});

/** The feature seam for screens: current SOS state and the user actions. */
export function useSos(): { snapshot: SosSnapshot } & Pick<SosController, 'hold' | 'cancel' | 'imSafe' | 'textContacts'> {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return {
    snapshot,
    hold: controller.hold,
    cancel: controller.cancel,
    imSafe: controller.imSafe,
    textContacts: controller.textContacts,
  };
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
