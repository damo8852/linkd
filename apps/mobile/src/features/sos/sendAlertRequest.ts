import { FunctionsHttpError } from '@supabase/supabase-js';
// Polyfills crypto.getRandomValues, which React Native does not provide.
import 'react-native-get-random-values';

import { encryptedStorage } from '../../lib/encryptedStorage';
import { supabase } from '../../lib/supabase';
import type { EndReason } from './alertMachine';
import { readAlertToken } from './alertToken';
import type { OutgoingAlert, SendResult } from './sosController';

/** The stored alert token as a header, or none: an unreadable token is never a reason not to call. */
async function alertTokenHeaders(): Promise<{ headers?: { 'X-Alert-Token': string } }> {
  const alertToken = await readAlertToken(encryptedStorage).catch(() => null);
  return alertToken === null ? {} : { headers: { 'X-Alert-Token': alertToken.token } };
}

/** A random UUID v4. The server uses it to make retries of the same alert idempotent. */
export function newAlertId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Calls the send-alert Edge Function. Safe to repeat with the same alert: the server texts
 * each contact once per id.
 * The stored alert token rides along on every send: the server uses the session when it is
 * valid and the token otherwise, so signed out or a dead session still sends.
 * On failure: an unreadable token is skipped, never a reason not to send; any error (network,
 * 5xx, some texts failed) is `failed` so the caller retries; 422 means there is nobody to text,
 * which a retry cannot fix.
 */
export async function sendAlertRequest(alert: OutgoingAlert): Promise<SendResult> {
  const { error } = await supabase.functions.invoke('send-alert', {
    ...(await alertTokenHeaders()),
    body: {
      id: alert.id,
      trigger: alert.trigger,
      triggeredAt: new Date(alert.triggeredAt).toISOString(),
      // Location needs the location permission flow, which is not built yet.
      location: null,
    },
  });
  if (!error) {
    return 'delivered';
  }
  // `context` is the fetch Response for an HTTP error; supabase-js types it as `any`.
  if (error instanceof FunctionsHttpError && (error.context as { status?: number }).status === 422) {
    return 'noContacts';
  }
  return 'failed';
}

/**
 * Calls the end-alert Edge Function. Safe to repeat: the first end wins on the server and each
 * contact gets the end text once. The alert token rides along as for a send.
 * On failure: false for any error so the caller retries, including 404, since a send still in
 * flight may create the alert after this call.
 */
export async function endAlertRequest(id: string, reason: EndReason): Promise<boolean> {
  const { error } = await supabase.functions.invoke('end-alert', { ...(await alertTokenHeaders()), body: { id, reason } });
  return !error;
}
