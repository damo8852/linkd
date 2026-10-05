import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { encryptedStorage } from '../../lib/encryptedStorage';
import { supabase } from '../../lib/supabase';
import { classifyContactError, type ContactResult } from './contactErrors';
import { readContactsCache, syncContactsCache, type Contact } from './contactsCache';

const COLUMNS = 'id, name, phone_e164, status';

async function currentUserId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id;
}

/**
 * Refreshes the device cache from the server and returns the contacts to show.
 * `fresh` is false when the server could not be reached or the user is signed
 * out; the cached contacts are returned and kept. Never throws.
 */
export async function refreshContacts(): Promise<{ contacts: Contact[]; fresh: boolean }> {
  const userId = await currentUserId();
  if (userId === undefined) {
    return { contacts: (await readContactsCache(encryptedStorage))?.contacts ?? [], fresh: false };
  }
  const { cache, fresh } = await syncContactsCache(encryptedStorage, userId, async () => {
    const { data, error } = await supabase.from('emergency_contacts').select(COLUMNS).order('created_at');
    if (error) {
      throw error;
    }
    return data;
  });
  return { contacts: cache?.contacts ?? [], fresh };
}

/**
 * Applies a change the server has already accepted to the cache at once, so the
 * cache is right even if the refresh that follows cannot reach the server.
 */
async function applyToCache(change: (contacts: Contact[]) => Contact[]): Promise<void> {
  const userId = await currentUserId();
  if (userId === undefined) {
    return;
  }
  const cache = await readContactsCache(encryptedStorage);
  const current = cache?.userId === userId ? cache.contacts : [];
  await syncContactsCache(encryptedStorage, userId, async () => change(current));
}

/** Adds a contact. `phoneE164` must already be normalized (see `normalizePhone`). */
export async function addContact(name: string, phoneE164: string): Promise<ContactResult> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .insert({ name: name.trim(), phone_e164: phoneE164 })
    .select(COLUMNS)
    .single();
  if (error) {
    return { ok: false, failure: classifyContactError(error) };
  }
  await applyToCache((contacts) => [...contacts, data]);
  return { ok: true };
}

/** Removes an active contact. Opted-out contacts cannot be removed (the server keeps them). */
export async function removeContact(id: string): Promise<ContactResult> {
  const { error } = await supabase.from('emergency_contacts').delete().eq('id', id);
  if (error) {
    return { ok: false, failure: classifyContactError(error) };
  }
  await applyToCache((contacts) => contacts.filter((contact) => contact.id !== id));
  return { ok: true };
}

/**
 * The user's contacts for a screen: the cached list at once, then the server's.
 * Reloads whenever the screen regains focus. `fresh` false after loading means
 * the list is the saved copy and may be out of date.
 */
export function useContacts(): { contacts: Contact[]; loading: boolean; fresh: boolean; reload: () => Promise<void> } {
  const [state, setState] = useState<{ contacts: Contact[]; loading: boolean; fresh: boolean }>({
    contacts: [],
    loading: true,
    fresh: false,
  });

  const reload = useCallback(async (): Promise<void> => {
    setState({ ...(await refreshContacts()), loading: false });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let focused = true;
      void (async (): Promise<void> => {
        const cached = await readContactsCache(encryptedStorage);
        if (focused && cached !== null) {
          setState((previous) => (previous.loading ? { ...previous, contacts: cached.contacts } : previous));
        }
        const refreshed = await refreshContacts();
        if (focused) {
          setState({ ...refreshed, loading: false });
        }
      })();
      return () => {
        focused = false;
      };
    }, []),
  );

  return { ...state, reload };
}
