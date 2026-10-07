import { FunctionsHttpError } from '@supabase/supabase-js';
// Polyfills crypto.getRandomValues, which React Native does not provide.
import 'react-native-get-random-values';

import { supabase } from '../../lib/supabase';
import type { OutgoingAlert, SendResult } from './sosController';

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
 * On failure: any error (network, 5xx, some texts failed) is `failed` so the caller retries;
 * 422 means there is nobody to text, which a retry cannot fix.
 */
export async function sendAlertRequest(alert: OutgoingAlert): Promise<SendResult> {
  const { error } = await supabase.functions.invoke('send-alert', {
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
