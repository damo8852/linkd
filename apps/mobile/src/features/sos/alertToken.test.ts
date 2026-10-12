import { readContactsCache, syncContactsCache, type KeyValueStorage } from '../emergency-contacts/contactsCache';
import { ensureAlertToken, readAlertToken, removeThisDevice, type AlertTokenApi } from './alertToken';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => void data.set(key, value),
    removeItem: async (key) => void data.delete(key),
  };
}

/** A fake server: issues numbered tokens and remembers which are still valid. */
function fakeServer(): AlertTokenApi & { valid: Set<string>; issued: number; online: boolean } {
  const server = {
    valid: new Set<string>(),
    issued: 0,
    online: true,
    async issue(): Promise<{ deviceId: string; token: string }> {
      if (!server.online) {
        throw new Error('network down');
      }
      server.issued += 1;
      const token = `token-${server.issued}`;
      server.valid.add(token);
      return { deviceId: `device-${server.issued}`, token };
    },
    async revoke(token: string): Promise<void> {
      if (!server.online) {
        throw new Error('network down');
      }
      server.valid.delete(token);
    },
  };
  return server;
}

describe('alert token', () => {
  it('is absent before the first sign-in', async () => {
    expect(await readAlertToken(memoryStorage())).toBeNull();
  });

  it('is issued at sign-in and survives a restart and a sign-out', async () => {
    const storage = memoryStorage();
    const server = fakeServer();

    const token = await ensureAlertToken(storage, 'user-a', server);

    expect(token).toEqual({ userId: 'user-a', deviceId: 'device-1', token: 'token-1' });
    // A new read, as after a restart or a sign-out: nothing but storage is consulted.
    expect(await readAlertToken(storage)).toEqual(token);
  });

  it('keeps the same token for the same account without asking the server', async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    await ensureAlertToken(storage, 'user-a', server);
    server.online = false;

    const token = await ensureAlertToken(storage, 'user-a', server);

    expect(token?.token).toBe('token-1');
    expect(server.issued).toBe(1);
    expect(server.valid.has('token-1')).toBe(true);
  });

  it('stores nothing when the server cannot be reached, and issues on the next try', async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    server.online = false;

    expect(await ensureAlertToken(storage, 'user-a', server)).toBeNull();
    expect(await readAlertToken(storage)).toBeNull();

    server.online = true;
    expect((await ensureAlertToken(storage, 'user-a', server))?.token).toBe('token-1');
  });

  it('replaces the token when a different account signs in, and revokes the old one', async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    await ensureAlertToken(storage, 'user-a', server);

    const token = await ensureAlertToken(storage, 'user-b', server);

    expect(token).toEqual({ userId: 'user-b', deviceId: 'device-2', token: 'token-2' });
    expect(await readAlertToken(storage)).toEqual(token);
    expect([...server.valid]).toEqual(['token-2']);
  });

  it("never keeps the previous account's token, even when the new one cannot be issued", async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    await ensureAlertToken(storage, 'user-a', server);
    server.online = false;

    expect(await ensureAlertToken(storage, 'user-b', server)).toBeNull();

    // Otherwise an SOS from this phone would text the previous account's contacts.
    expect(await readAlertToken(storage)).toBeNull();
  });

  it('has the new token stored before the old one is revoked', async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    await ensureAlertToken(storage, 'user-a', server);
    let storedAtRevoke: string | undefined;
    const api: AlertTokenApi = {
      issue: () => server.issue(),
      revoke: async () => {
        storedAtRevoke = (await readAlertToken(storage))?.token;
        throw new Error('network down');
      },
    };

    const token = await ensureAlertToken(storage, 'user-b', api);

    expect(storedAtRevoke).toBe('token-2');
    // A failed revoke of the old token must not cost the phone its new one.
    expect(token?.token).toBe('token-2');
  });

  it('reads an unreadable stored token as absent', async () => {
    const storage = memoryStorage();
    await ensureAlertToken(storage, 'user-a', fakeServer());
    for (const key of storage.data.keys()) {
      storage.data.set(key, '{"userId":"user-a","token":42}');
    }

    expect(await readAlertToken(storage)).toBeNull();
  });
});

describe('remove this device', () => {
  async function armedPhone(): Promise<{ storage: ReturnType<typeof memoryStorage>; server: ReturnType<typeof fakeServer> }> {
    const storage = memoryStorage();
    const server = fakeServer();
    await ensureAlertToken(storage, 'user-a', server);
    await syncContactsCache(storage, 'user-a', async () => [
      { id: '1', name: 'Maya', phone_e164: '+12133734253', status: 'active' },
    ]);
    return { storage, server };
  }

  it('revokes the token and wipes the token and the contacts cache', async () => {
    const { storage, server } = await armedPhone();

    expect(await removeThisDevice(storage, server)).toEqual({ revoked: true });

    expect(server.valid.size).toBe(0);
    expect(await readAlertToken(storage)).toBeNull();
    expect(await readContactsCache(storage)).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it('still wipes the phone when the server cannot be reached, and says the server was not told', async () => {
    const { storage, server } = await armedPhone();
    server.online = false;

    expect(await removeThisDevice(storage, server)).toEqual({ revoked: false });

    expect(await readAlertToken(storage)).toBeNull();
    expect(await readContactsCache(storage)).toBeNull();
  });

  it('wipes the contacts cache even when there is no token', async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    await syncContactsCache(storage, 'user-a', async () => []);

    expect(await removeThisDevice(storage, server)).toEqual({ revoked: true });

    expect(await readContactsCache(storage)).toBeNull();
  });
});
