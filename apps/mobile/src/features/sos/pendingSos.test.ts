import type { KeyValueStorage } from '../emergency-contacts/contactsCache';
import { EMPTY_PENDING_SOS, createPendingSosWriter, readPendingSos } from './pendingSos';
import type { PendingSos } from './sosController';

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => {
      data.set(key, value);
    },
    removeItem: async (key) => {
      data.delete(key);
    },
  };
}

const record: PendingSos = {
  active: { id: 'a1', trigger: 'inApp', triggeredAt: 1000, endsAt: 3_601_000 },
  ends: [{ id: 'e1', reason: 'user' }],
  disarms: [{ id: 'd1', trigger: 'linkLoss', reason: 'reconnect' }],
};

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('readPendingSos', () => {
  it('round-trips what the writer saved', async () => {
    const storage = memoryStorage();
    createPendingSosWriter(storage, jest.fn())(record);
    await flush();

    expect(await readPendingSos(storage)).toEqual(record);
  });

  it('reads nothing saved, unreadable storage, or bad JSON as empty, never throwing', async () => {
    expect(await readPendingSos(memoryStorage())).toEqual(EMPTY_PENDING_SOS);
    expect(await readPendingSos({ ...memoryStorage(), getItem: () => Promise.reject(new Error('locked')) })).toEqual(
      EMPTY_PENDING_SOS,
    );
    expect(await readPendingSos(memoryStorage({ 'linkd.sos-pending': '{nope' }))).toEqual(EMPTY_PENDING_SOS);
    expect(await readPendingSos(memoryStorage({ 'linkd.sos-pending': 'null' }))).toEqual(EMPTY_PENDING_SOS);
  });

  it('keeps every valid entry and drops only the malformed ones', async () => {
    const saved = {
      active: { id: 'a1', trigger: 'inApp', triggeredAt: 'yesterday', endsAt: 1 },
      ends: [{ id: 'e1', reason: 'user' }, { id: 'e2', reason: 'bored' }, { reason: 'timeout' }],
      disarms: [{ id: 'd1', trigger: 'linkLoss', reason: 'reconnect' }, { id: 'd2', trigger: 'shake', reason: 'cancel' }],
    };
    const storage = memoryStorage({ 'linkd.sos-pending': JSON.stringify(saved) });

    expect(await readPendingSos(storage)).toEqual({
      active: null,
      ends: [{ id: 'e1', reason: 'user' }],
      disarms: [{ id: 'd1', trigger: 'linkLoss', reason: 'reconnect' }],
    });
  });
});

describe('createPendingSosWriter', () => {
  it('lands writes in the order they were made, even when an earlier one is slower', async () => {
    const storage = memoryStorage();
    const pending: (() => void)[] = [];
    const slow: KeyValueStorage = {
      ...storage,
      setItem: (key, value) =>
        new Promise<void>((resolve) => {
          pending.push(() => {
            storage.data.set(key, value);
            resolve();
          });
        }),
    };
    const save = createPendingSosWriter(slow, jest.fn());

    save(record);
    save(EMPTY_PENDING_SOS);
    await flush();
    // Only the first write has started; the second waits for it.
    expect(pending).toHaveLength(1);
    pending[0]?.();
    await flush();
    pending[1]?.();
    await flush();

    expect(await readPendingSos(storage)).toEqual(EMPTY_PENDING_SOS);
  });

  it('reports a failed write and still makes the next one', async () => {
    const storage = memoryStorage();
    let fail = true;
    const flaky: KeyValueStorage = {
      ...storage,
      setItem: (key, value) => (fail ? Promise.reject(new Error('disk full')) : storage.setItem(key, value)),
    };
    const onError = jest.fn();
    const save = createPendingSosWriter(flaky, onError);

    save(record);
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);

    fail = false;
    save(record);
    await flush();
    expect(await readPendingSos(storage)).toEqual(record);
  });
});
