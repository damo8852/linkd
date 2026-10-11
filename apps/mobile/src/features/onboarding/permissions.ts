import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

export type PermissionId = 'bluetooth' | 'notifications' | 'location' | 'backgroundLocation';

/** `later`: this OS has no prompt to show yet (see `asksLater`). */
export type PermissionState = 'granted' | 'off' | 'later';

/** In onboarding order. */
export const PERMISSION_IDS: readonly PermissionId[] = ['bluetooth', 'notifications', 'location', 'backgroundLocation'];

/** What each permission enables and what stops working without it. Shown before the OS prompt and in Settings. */
export const PERMISSION_COPY: Record<
  PermissionId,
  { name: string; title: string; withIt: readonly string[]; withoutIt: readonly string[] }
> = {
  bluetooth: {
    name: 'Bluetooth',
    title: 'Allow Bluetooth',
    withIt: ["Your bangle's button sends an SOS.", 'We notice if the bangle is pulled away from your phone.'],
    withoutIt: ['The bangle cannot reach your phone at all.', 'Only the SOS button in the app works.'],
  },
  notifications: {
    name: 'Notifications',
    title: 'Allow notifications',
    withIt: [
      'You are warned before an SOS sends, so you can cancel a false alarm.',
      'We can tell you when your bangle is out of reach or LINKD has stopped running.',
    ],
    withoutIt: [
      'An SOS can send without you seeing a warning first.',
      'You will not be told when your bangle stops being watched.',
    ],
  },
  location: {
    name: 'Location',
    title: 'Allow location',
    withIt: ['Your SOS text tells your contacts where you are.'],
    withoutIt: ['Your contacts get the SOS with no location.'],
  },
  backgroundLocation: {
    name: 'Background location',
    title: 'Allow location in the background',
    withIt: ['Your location is sent even when your phone is locked or LINKD is not on screen.'],
    withoutIt: ['Your location is only sent if LINKD is open on screen when the SOS goes out.'],
  },
};

/**
 * iOS has no way to ask for Bluetooth by itself: the system prompt appears the first time the app
 * starts Bluetooth, which is at bangle pairing. Until then the step explains and cannot ask.
 */
export function asksLater(id: PermissionId): boolean {
  return id === 'bluetooth' && Platform.OS === 'ios';
}

// BLUETOOTH_SCAN / BLUETOOTH_CONNECT are runtime permissions from Android 12 (API 31).
const ANDROID_BLUETOOTH_RUNTIME_API = 31;
const ANDROID_BLUETOOTH = [
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
] as const;

function androidBluetoothIsRuntime(): boolean {
  return typeof Platform.Version === 'number' && Platform.Version >= ANDROID_BLUETOOTH_RUNTIME_API;
}

function toState(granted: boolean): PermissionState {
  return granted ? 'granted' : 'off';
}

async function bluetooth(ask: boolean): Promise<PermissionState> {
  if (asksLater('bluetooth')) {
    return 'later';
  }
  if (!androidBluetoothIsRuntime()) {
    return 'granted';
  }
  if (ask) {
    const result = await PermissionsAndroid.requestMultiple([...ANDROID_BLUETOOTH]);
    return toState(ANDROID_BLUETOOTH.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED));
  }
  const held = await Promise.all(ANDROID_BLUETOOTH.map((permission) => PermissionsAndroid.check(permission)));
  return toState(held.every(Boolean));
}

async function resolve(id: PermissionId, ask: boolean): Promise<PermissionState> {
  try {
    switch (id) {
      case 'bluetooth':
        return await bluetooth(ask);
      case 'notifications':
        return toState((await (ask ? Notifications.requestPermissionsAsync() : Notifications.getPermissionsAsync())).granted);
      case 'location':
        return toState(
          (await (ask ? Location.requestForegroundPermissionsAsync() : Location.getForegroundPermissionsAsync())).granted,
        );
      case 'backgroundLocation':
        return toState(
          (await (ask ? Location.requestBackgroundPermissionsAsync() : Location.getBackgroundPermissionsAsync())).granted,
        );
    }
  } catch {
    // A permission we could not read is shown as off, never as granted.
    return 'off';
  }
}

/** Reads a permission without prompting. Never throws. */
export function checkPermission(id: PermissionId): Promise<PermissionState> {
  return resolve(id, false);
}

/**
 * Shows the OS prompt (if the OS will still show one) and returns the result. Never throws.
 * Once the user has refused, the OS stops prompting and this returns `off` at once; send
 * them to the system settings instead.
 */
export function requestPermission(id: PermissionId): Promise<PermissionState> {
  return resolve(id, true);
}

/** Every permission's current state, re-read whenever the app returns to the foreground (e.g. from system settings). */
export function usePermissionStates(): {
  states: Record<PermissionId, PermissionState> | null;
  reload: () => Promise<void>;
} {
  const [states, setStates] = useState<Record<PermissionId, PermissionState> | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const [bluetoothState, notifications, location, backgroundLocation] = await Promise.all([
      checkPermission('bluetooth'),
      checkPermission('notifications'),
      checkPermission('location'),
      checkPermission('backgroundLocation'),
    ]);
    setStates({ bluetooth: bluetoothState, notifications, location, backgroundLocation });
  }, []);

  useEffect(() => {
    void reload();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void reload();
      }
    });
    return () => subscription.remove();
  }, [reload]);

  return { states, reload };
}
