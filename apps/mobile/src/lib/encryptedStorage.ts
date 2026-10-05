import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import * as SecureStore from 'expo-secure-store';
// Polyfills crypto.getRandomValues, which React Native does not provide.
import 'react-native-get-random-values';

/**
 * Encrypted key-value storage for the Supabase session and the emergency
 * contacts cache, following Supabase's documented "LargeSecureStore" pattern.
 * Values are AES-256 encrypted in AsyncStorage and only the key lives in the
 * Keychain / Keystore, because some iOS releases refuse SecureStore values
 * above about 2048 bytes and both values can be larger.
 *
 * The key is readable after the first unlock since boot, not only while the
 * phone is unlocked: an SOS can fire from a locked phone and must still find
 * the session and the contacts.
 *
 * On failure: a missing key or unreadable value reads as absent (null); write
 * errors propagate to the caller.
 */
export const encryptedStorage = {
  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    const keyHex = await SecureStore.getItemAsync(key);
    if (encrypted === null || keyHex === null) {
      return null;
    }
    try {
      const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
      return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(encrypted)));
    } catch {
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    // A fresh key on every write, so the fixed CTR counter never repeats under one key.
    const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
    await AsyncStorage.setItem(key, aesjs.utils.hex.fromBytes(encrypted));
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  },
};
