import { clearContactsCache, type KeyValueStorage } from '../emergency-contacts/contactsCache';

/** This install's alert token, and whose it is. The server keeps only a hash of `token`. */
export type AlertToken = { userId: string; deviceId: string; token: string };

/** The server calls the token needs, injected so the logic is testable without a network. */
export type AlertTokenApi = {
  /** Issues a new token for the signed-in user. Rejects when the server cannot be reached. */
  issue(): Promise<{ deviceId: string; token: string }>;
  /** Revokes a token by presenting it; works signed out. Rejects when the server cannot be reached. */
  revoke(token: string): Promise<void>;
};

const TOKEN_KEY = 'linkd.alert-token';

/**
 * Reads the stored alert token. Works offline and signed out; nothing but device storage is
 * consulted. On failure: a missing or unreadable token reads as null, it never throws on bad data.
 */
export async function readAlertToken(storage: KeyValueStorage): Promise<AlertToken | null> {
  const raw = await storage.getItem(TOKEN_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<AlertToken> | null;
    if (typeof parsed?.userId === 'string' && typeof parsed.deviceId === 'string' && typeof parsed.token === 'string') {
      return { userId: parsed.userId, deviceId: parsed.deviceId, token: parsed.token };
    }
  } catch {
    // Unreadable: fall through to "no token".
  }
  return null;
}

/**
 * Makes sure this install holds an alert token for the signed-in `userId`. Call at app start
 * and at sign-in.
 *
 * - Same account already has one: kept, the server is not asked (works offline).
 * - Another account's token: removed from the phone first, so an SOS can never be sent as the
 *   previous account; then a new one is issued and stored, and only then is the old one revoked.
 *
 * On failure: returns null when a token could not be issued (the next call retries); a failed
 * revoke of the old token is ignored, since no phone holds it any more. Sign-out does not call
 * this and does not clear the token.
 */
export async function ensureAlertToken(
  storage: KeyValueStorage,
  userId: string,
  api: AlertTokenApi,
): Promise<AlertToken | null> {
  const existing = await readAlertToken(storage);
  if (existing?.userId === userId) {
    return existing;
  }
  if (existing !== null) {
    await storage.removeItem(TOKEN_KEY);
  }
  let issued: { deviceId: string; token: string };
  try {
    issued = await api.issue();
  } catch {
    return null;
  }
  const fresh: AlertToken = { userId, ...issued };
  await storage.setItem(TOKEN_KEY, JSON.stringify(fresh));
  if (existing !== null) {
    await api.revoke(existing.token).catch(() => undefined);
  }
  return fresh;
}

/**
 * "Remove this device": revokes the token and wipes the token and the contacts cache. The only
 * way to disarm a phone. The phone is wiped even when the server cannot be reached; `revoked`
 * false then means the server still lists the device, so the caller can say so.
 */
export async function removeThisDevice(storage: KeyValueStorage, api: AlertTokenApi): Promise<{ revoked: boolean }> {
  const existing = await readAlertToken(storage);
  let revoked = true;
  if (existing !== null) {
    revoked = await api.revoke(existing.token).then(
      () => true,
      () => false,
    );
  }
  await storage.removeItem(TOKEN_KEY);
  await clearContactsCache(storage);
  return { revoked };
}
