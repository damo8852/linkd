import type { Tables } from '../../../../../supabase/types/database';

/** The part of an emergency contact the app shows and an SOS needs. */
export type Contact = Pick<Tables<'emergency_contacts'>, 'id' | 'name' | 'phone_e164' | 'status'>;

/** The contacts last seen on the server, and whose they are. */
export type ContactsCache = { userId: string; contacts: Contact[] };

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const CACHE_KEY = 'linkd.emergency-contacts';

function isContact(value: unknown): value is Contact {
  const contact = value as Partial<Contact> | null;
  return (
    typeof contact === 'object' &&
    contact !== null &&
    typeof contact.id === 'string' &&
    typeof contact.name === 'string' &&
    typeof contact.phone_e164 === 'string' &&
    typeof contact.status === 'string'
  );
}

/**
 * Reads the cached contacts. Works offline and signed out; nothing but device
 * storage is consulted. On failure: a missing or unreadable cache reads as null
 * (no contacts known), it never throws on bad data.
 */
export async function readContactsCache(storage: KeyValueStorage): Promise<ContactsCache | null> {
  const raw = await storage.getItem(CACHE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ContactsCache> | null;
    if (typeof parsed?.userId === 'string' && Array.isArray(parsed.contacts) && parsed.contacts.every(isContact)) {
      return { userId: parsed.userId, contacts: parsed.contacts };
    }
  } catch {
    // Unreadable: fall through to "no contacts known".
  }
  return null;
}

/**
 * Refreshes the cache from the server for `userId`.
 *
 * - Fetch succeeds: the cache is replaced with what the server returned (`fresh: true`).
 * - Fetch fails: the existing cache is kept and returned (`fresh: false`). A
 *   failed fetch never empties the cache, or an offline SOS would reach nobody.
 * - The cache belongs to another account: it is removed before fetching, so the
 *   previous account's contacts can never be texted for this account's SOS.
 *
 * Sign-out does not call this and does not clear the cache.
 */
export async function syncContactsCache(
  storage: KeyValueStorage,
  userId: string,
  fetchContacts: () => Promise<Contact[]>,
): Promise<{ cache: ContactsCache | null; fresh: boolean }> {
  let cache = await readContactsCache(storage);
  if (cache !== null && cache.userId !== userId) {
    await storage.removeItem(CACHE_KEY);
    cache = null;
  }
  let contacts: Contact[];
  try {
    contacts = await fetchContacts();
  } catch {
    return { cache, fresh: false };
  }
  const fresh = { userId, contacts };
  await storage.setItem(CACHE_KEY, JSON.stringify(fresh));
  return { cache: fresh, fresh: true };
}

/** The contacts an SOS texts. Opted-out contacts are never texted and never count toward the limit. */
export function activeContacts(cache: ContactsCache | null): Contact[] {
  return cache?.contacts.filter((contact) => contact.status === 'active') ?? [];
}
