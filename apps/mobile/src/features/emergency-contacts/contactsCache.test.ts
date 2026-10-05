import {
  activeContacts,
  readContactsCache,
  syncContactsCache,
  type Contact,
  type KeyValueStorage,
} from './contactsCache';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => void data.set(key, value),
    removeItem: async (key) => void data.delete(key),
  };
}

const maya: Contact = { id: '1', name: 'Maya', phone_e164: '+12133734253', status: 'active' };
const sam: Contact = { id: '2', name: 'Sam', phone_e164: '+12133734254', status: 'opted_out' };

const offline = async (): Promise<Contact[]> => {
  throw new Error('network down');
};

describe('contacts cache', () => {
  it('is empty before anything is cached', async () => {
    expect(await readContactsCache(memoryStorage())).toBeNull();
  });

  it('caches what the server returned and survives a restart', async () => {
    const storage = memoryStorage();

    const result = await syncContactsCache(storage, 'user-a', async () => [maya, sam]);

    expect(result).toEqual({ cache: { userId: 'user-a', contacts: [maya, sam] }, fresh: true });
    // A new read, as after an app restart or a sign-out: nothing but storage is consulted.
    expect(await readContactsCache(storage)).toEqual({ userId: 'user-a', contacts: [maya, sam] });
  });

  it('keeps the cached contacts when the server cannot be reached', async () => {
    const storage = memoryStorage();
    await syncContactsCache(storage, 'user-a', async () => [maya]);

    const result = await syncContactsCache(storage, 'user-a', offline);

    expect(result).toEqual({ cache: { userId: 'user-a', contacts: [maya] }, fresh: false });
    expect(await readContactsCache(storage)).toEqual({ userId: 'user-a', contacts: [maya] });
  });

  it('caches an empty list when the server says there are no contacts', async () => {
    const storage = memoryStorage();
    await syncContactsCache(storage, 'user-a', async () => [maya]);

    await syncContactsCache(storage, 'user-a', async () => []);

    expect(await readContactsCache(storage)).toEqual({ userId: 'user-a', contacts: [] });
  });

  it("replaces another account's contacts, even when the fetch fails", async () => {
    const storage = memoryStorage();
    await syncContactsCache(storage, 'user-a', async () => [maya]);

    const result = await syncContactsCache(storage, 'user-b', offline);

    // Never text the previous account's contacts for the new account's SOS.
    expect(result).toEqual({ cache: null, fresh: false });
    expect(await readContactsCache(storage)).toBeNull();
  });

  it('never counts or returns opted-out contacts as active', () => {
    expect(activeContacts({ userId: 'user-a', contacts: [maya, sam] })).toEqual([maya]);
    expect(activeContacts(null)).toEqual([]);
  });

  it.each([
    ['not JSON', '{oops'],
    ['the wrong shape', JSON.stringify({ userId: 'user-a', contacts: 'none' })],
    ['a contact without a phone number', JSON.stringify({ userId: 'user-a', contacts: [{ id: '1', name: 'Maya' }] })],
  ])('reads a cache that is %s as empty instead of throwing', async (_label, raw) => {
    const storage = memoryStorage();
    await syncContactsCache(storage, 'user-a', async () => [maya]);
    const [key] = [...storage.data.keys()];
    storage.data.set(key as string, raw);

    expect(await readContactsCache(storage)).toBeNull();
  });
});
