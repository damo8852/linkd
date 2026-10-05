import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { sessionStorage } from '../src/lib/sessionStorage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-get-random-values', () => ({}));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (key: string) => store.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => void store.set(key, value),
    deleteItemAsync: async (key: string) => void store.delete(key),
  };
});

// Longer than the ~2048 bytes some iOS releases refuse in SecureStore.
const session = JSON.stringify({ refresh_token: 'r'.repeat(3000), note: 'café' });

describe('sessionStorage', () => {
  it('round-trips a large value and never stores it in plain text', async () => {
    await sessionStorage.setItem('k', session);

    expect(await sessionStorage.getItem('k')).toBe(session);
    expect(await AsyncStorage.getItem('k')).not.toContain('rrrr');
    // Only the 256-bit key goes to the Keychain / Keystore.
    expect(await SecureStore.getItemAsync('k')).toHaveLength(64);
  });

  it('reads as no session when the key is gone', async () => {
    await sessionStorage.setItem('k', session);
    await SecureStore.deleteItemAsync('k');

    expect(await sessionStorage.getItem('k')).toBeNull();
  });

  it('removes both the value and its key', async () => {
    await sessionStorage.setItem('k', session);
    await sessionStorage.removeItem('k');

    expect(await sessionStorage.getItem('k')).toBeNull();
    expect(await AsyncStorage.getItem('k')).toBeNull();
    expect(await SecureStore.getItemAsync('k')).toBeNull();
  });
});
