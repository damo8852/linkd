import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { encryptedStorage } from '../../lib/encryptedStorage';
import { supabase } from '../../lib/supabase';
import { signOut } from '../auth/auth';
import { ensureAlertToken, readAlertToken, removeThisDevice, type AlertTokenApi } from '../sos/alertToken';
import { requestUnlock } from '../sos/unlock';

/** A phone armed for the account. `thisPhone` marks the one the app is running on. */
export type Device = { id: string; name: string; thisPhone: boolean };

const api: AlertTokenApi = {
  async issue() {
    // ponytail: generic name; add expo-device for model names if users with two phones cannot tell them apart.
    const { data, error } = await supabase.rpc('issue_alert_token', {
      p_device_name: Platform.OS === 'ios' ? 'iPhone' : 'Android phone',
    });
    const row = data?.[0];
    if (error || !row) {
      throw error ?? new Error('issue_alert_token returned no row');
    }
    return { deviceId: row.device_id, token: row.token };
  },
  async revoke(token) {
    const { error } = await supabase.rpc('revoke_alert_token', { p_token: token });
    if (error) {
      throw error;
    }
  },
};

/**
 * Makes sure this phone holds an alert token for the signed-in user. Does nothing signed out.
 * Never throws: a failure is retried at the next app start, sign-in, or return to the app.
 */
export async function syncAlertToken(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (userId !== undefined) {
      await ensureAlertToken(encryptedStorage, userId, api);
    }
  } catch {
    // Retried on the next call.
  }
}

// A token that could not be issued at sign-in (no network) is issued when the app is next opened.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    void syncAlertToken();
  }
});

/** The account's armed phones, oldest first. Rejects when the server cannot be reached. */
export async function listDevices(): Promise<Device[]> {
  const { data, error } = await supabase.from('alert_devices').select('id, name').order('created_at');
  if (error) {
    throw error;
  }
  const own = (await readAlertToken(encryptedStorage))?.deviceId;
  return data.map((device) => ({ ...device, thisPhone: device.id === own }));
}

/** Removes another phone from the account, which revokes its alert token. False when it failed. */
export async function removeOtherDevice(id: string): Promise<boolean> {
  const { error } = await supabase.from('alert_devices').delete().eq('id', id);
  return error === null;
}

/**
 * "Remove this device": after a device unlock, revokes this phone's alert token, wipes the token
 * and the contacts cache, and signs out. `locked` means the unlock failed and nothing changed;
 * `removedOffline` means the phone is disarmed but the server could not be told.
 */
export async function removeThisPhone(): Promise<'removed' | 'removedOffline' | 'locked'> {
  if ((await requestUnlock('removeDevice')) === 'failed') {
    return 'locked';
  }
  const { revoked } = await removeThisDevice(encryptedStorage, api);
  await signOut();
  return revoked ? 'removed' : 'removedOffline';
}

/** Whether this phone holds an alert token, so it still sends an SOS signed out. Null until known. */
export function useArmed(): { armed: boolean | null; recheck: () => void } {
  const [armed, setArmed] = useState<boolean | null>(null);
  const recheck = (): void => {
    readAlertToken(encryptedStorage).then(
      (token) => setArmed(token !== null),
      () => setArmed(null),
    );
  };
  useEffect(recheck, []);
  return { armed, recheck };
}
