import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { encryptedStorage } from '../src/lib/encryptedStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    AFTER_FIRST_UNLOCK: 'after-first-unlock',
    getItemAsync: async (key: string) => store.get(key) ?? null,
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    deleteItemAsync: async (key: string) => void store.delete(key),
  };
});

// Longer than the ~2048 bytes some iOS releases refuse in SecureStore.
const session = JSON.stringify({ refresh_token: 'r'.repeat(3000), note: 'café' });

describe('encryptedStorage', () => {
  it('round-trips a large value and never stores it in plain text', async () => {
    await encryptedStorage.setItem('k', session);

    expect(await encryptedStorage.getItem('k')).toBe(session);
    expect(await AsyncStorage.getItem('k')).not.toContain('rrrr');
    // Only the 256-bit key goes to the Keychain / Keystore.
    expect(await SecureStore.getItemAsync('k')).toHaveLength(64);
  });

  it('stores the key so a locked phone can still read it', async () => {
    await encryptedStorage.setItem('k', session);

    // The iOS default (when unlocked) would hide the session and the contacts cache
    // from an SOS that fires while the phone is locked.
    expect(SecureStore.setItemAsync).toHaveBeenLastCalledWith('k', expect.any(String), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  });

  it('reads as no session when the key is gone', async () => {
    await encryptedStorage.setItem('k', session);
    await SecureStore.deleteItemAsync('k');

    expect(await encryptedStorage.getItem('k')).toBeNull();
  });

  it('removes both the value and its key', async () => {
    await encryptedStorage.setItem('k', session);
    await encryptedStorage.removeItem('k');

    expect(await encryptedStorage.getItem('k')).toBeNull();
    expect(await AsyncStorage.getItem('k')).toBeNull();
    expect(await SecureStore.getItemAsync('k')).toBeNull();
  });
});
