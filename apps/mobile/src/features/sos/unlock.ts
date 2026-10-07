import * as LocalAuthentication from 'expo-local-authentication';

import type { UnlockResult } from './sosController';

/** Whether the phone has any screen lock (passcode, PIN, pattern, or biometrics). */
export async function hasScreenLock(): Promise<boolean> {
  return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
}

/**
 * Asks the user to unlock the phone (biometrics, falling back to the device passcode).
 * A phone with no screen lock has nothing to unlock with, so it reports `noLock` and the caller
 * lets the action through. Any other failure (cancelled, lockout, timeout) is `failed`.
 */
export async function requestUnlock(reason: 'cancel' | 'imSafe'): Promise<UnlockResult> {
  if (!(await hasScreenLock())) {
    return 'noLock';
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason === 'cancel' ? 'Cancel SOS' : "Confirm you're safe",
  });
  if (result.success) {
    return 'unlocked';
  }
  // The lock was removed between the check and the prompt.
  return result.error === 'not_enrolled' || result.error === 'passcode_not_set' ? 'noLock' : 'failed';
}
