import type { ContactsCache } from '../emergency-contacts/contactsCache';
import { buildFallbackMessage, openSmsFallback, type FallbackDeps } from './smsFallback';

const cache: ContactsCache = {
  userId: 'user-a',
  contacts: [
    { id: '1', name: 'A', phone_e164: '+15555550101', status: 'active' },
    { id: '2', name: 'B', phone_e164: '+15555550102', status: 'opted_out' },
    { id: '3', name: 'C', phone_e164: '+15555550103', status: 'active' },
  ],
};

describe('buildFallbackMessage', () => {
  it('says it is an SOS and links the location with its accuracy', () => {
    expect(buildFallbackMessage({ latitude: 40.0150123, longitude: -105.2705456, accuracyM: 12.4 })).toBe(
      'LINKD SOS: I triggered an emergency alert and may need help.\n' +
        'Location: https://maps.google.com/?q=40.01501,-105.27055 (within 12 m)',
    );
  });

  it('says the location is unavailable rather than waiting for one', () => {
    expect(buildFallbackMessage(null)).toBe(
      'LINKD SOS: I triggered an emergency alert and may need help.\nLocation unavailable.',
    );
  });

  it('leaves out an unknown accuracy', () => {
    expect(buildFallbackMessage({ latitude: 1, longitude: 2, accuracyM: null })).toBe(
      'LINKD SOS: I triggered an emergency alert and may need help.\n' +
        'Location: https://maps.google.com/?q=1.00000,2.00000',
    );
  });
});

describe('openSmsFallback', () => {
  function deps(overrides: Partial<FallbackDeps> = {}) {
    const opened: { to: string[]; body: string }[] = [];
    const d: FallbackDeps = {
      isAvailable: async () => true,
      readCache: async () => cache,
      lastLocation: async () => ({ latitude: 1, longitude: 2, accuracyM: 5 }),
      compose: async (to, body) => void opened.push({ to, body }),
      ...overrides,
    };
    return { d, opened };
  }

  it('opens the composer to the cached active contacts only, with the location', async () => {
    const { d, opened } = deps();
    expect(await openSmsFallback(d)).toBe('opened');
    expect(opened).toEqual([{ to: ['+15555550101', '+15555550103'], body: buildFallbackMessage({ latitude: 1, longitude: 2, accuracyM: 5 }) }]);
  });

  it('still opens when the location cannot be read', async () => {
    const { d, opened } = deps({ lastLocation: async () => Promise.reject(new Error('denied')) });
    expect(await openSmsFallback(d)).toBe('opened');
    expect(opened[0]?.body).toContain('Location unavailable.');
  });

  it('reports noContacts when the cache has no active contact, and opens nothing', async () => {
    const { d, opened } = deps({
      readCache: async () => ({ userId: 'user-a', contacts: [{ id: '2', name: 'B', phone_e164: '+15555550102', status: 'opted_out' }] }),
    });
    expect(await openSmsFallback(d)).toBe('noContacts');
    expect(opened).toEqual([]);
  });

  it('reports noContacts for an unreadable or missing cache', async () => {
    expect(await openSmsFallback(deps({ readCache: async () => null }).d)).toBe('noContacts');
    expect(await openSmsFallback(deps({ readCache: async () => Promise.reject(new Error('keychain')) }).d)).toBe('noContacts');
  });

  it('reports unavailable when the phone cannot send texts, or the composer fails', async () => {
    expect(await openSmsFallback(deps({ isAvailable: async () => false }).d)).toBe('unavailable');
    expect(await openSmsFallback(deps({ compose: async () => Promise.reject(new Error('no ui')) }).d)).toBe('unavailable');
  });
});
