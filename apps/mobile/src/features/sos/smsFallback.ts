import { activeContacts, type ContactsCache } from '../emergency-contacts/contactsCache';
import type { Fix } from './location';

export type FallbackLocation = Pick<Fix, 'latitude' | 'longitude' | 'accuracyM'>;

/** `noContacts`: no cached active contact to text. `unavailable`: this phone cannot open a text. */
export type FallbackResult = 'opened' | 'noContacts' | 'unavailable';

export type FallbackDeps = {
  isAvailable(): Promise<boolean>;
  readCache(): Promise<ContactsCache | null>;
  lastLocation(): Promise<FallbackLocation | null>;
  /** Opens the native composer prefilled; the user taps send. */
  compose(to: string[], body: string): Promise<unknown>;
};

/**
 * The SOS text the user sends from their own phone when the server cannot be reached. Same
 * shape as the server's (supabase/functions/send-alert), in the first person since it comes
 * from the user's own number. Never waits for a location.
 */
export function buildFallbackMessage(location: FallbackLocation | null): string {
  const lines = ['LINKD SOS: I triggered an emergency alert and may need help.'];
  if (location) {
    const accuracy = location.accuracyM === null ? '' : ` (within ${Math.round(location.accuracyM)} m)`;
    lines.push(
      `Location: https://maps.google.com/?q=${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}${accuracy}`,
    );
  } else {
    lines.push('Location unavailable.');
  }
  return lines.join('\n');
}

/**
 * Opens the native SMS composer to the cached active contacts with the last known location.
 * On failure: an unreadable cache is `noContacts`, an unreadable location is left out, and a
 * phone that cannot text (or a composer that fails to open) is `unavailable`, so the caller can
 * tell the user to call for help another way. Never throws.
 */
export async function openSmsFallback(deps: FallbackDeps): Promise<FallbackResult> {
  const cache = await deps.readCache().catch(() => null);
  const to = activeContacts(cache).map((contact) => contact.phone_e164);
  if (to.length === 0) return 'noContacts';
  if (!(await deps.isAvailable().catch(() => false))) return 'unavailable';
  const location = await deps.lastLocation().catch(() => null);
  try {
    await deps.compose(to, buildFallbackMessage(location));
    return 'opened';
  } catch {
    return 'unavailable';
  }
}
