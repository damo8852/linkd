/**
 * Who is calling an alert function: a signed-in user (JWT) or a signed-out phone (alert token).
 * Shared by send-alert and end-alert. Identity never comes from the request body.
 * Spec: docs/design/sos_alert_flow.md (Signed out).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database.ts';

/** Header carrying the per-install alert token. */
export const ALERT_TOKEN_HEADER = 'X-Alert-Token';

/** Each lookup returns the user id, or null when the credential is not valid. */
export interface Identity {
  userFromJwt(jwt: string): Promise<string | null>;
  userFromAlertToken(token: string): Promise<string | null>;
}

/**
 * Resolves the caller to a user id, or null if neither credential is valid (the handler
 * answers 401). A valid session wins; otherwise the alert token is tried, so an expired
 * session or an auth outage never blocks an SOS.
 * On failure: a JWT check that throws falls through to the token; a token lookup that throws
 * rejects, so the handler answers 500 and the app retries instead of treating it as revoked.
 */
export async function resolveUser(headers: Headers, identity: Identity): Promise<string | null> {
  const jwt = headers.get('Authorization')?.replace(/^Bearer\s*/i, '').trim();
  if (jwt) {
    const userId = await identity.userFromJwt(jwt).catch(() => null);
    if (userId) return userId;
  }
  const token = headers.get(ALERT_TOKEN_HEADER)?.trim();
  return token ? await identity.userFromAlertToken(token) : null;
}

/** Identity backed by Supabase Auth and the alert_token_user SQL function (service role). */
export function supabaseIdentity(db: SupabaseClient<Database>): Identity {
  return {
    async userFromJwt(jwt) {
      const { data, error } = await db.auth.getUser(jwt);
      return error ? null : (data.user?.id ?? null);
    },
    async userFromAlertToken(token) {
      const { data, error } = await db.rpc('alert_token_user', { p_token: token });
      if (error) throw new Error(`alert_token_user: ${error.message}`);
      return data ?? null;
    },
  };
}
