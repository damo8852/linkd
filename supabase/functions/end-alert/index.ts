/**
 * POST /functions/v1/end-alert
 * Body: { id, reason: 'user' | 'timeout' } (see parseEndInput).
 * Auth: the user's JWT. Identity comes from the verified token, never the body.
 * Returns 200 when the alert is ended and every recipient owed the end text has it; 502 with
 * counts when any text failed (the alert is still ended; the app shows it and retries with the
 * same id).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database.ts';
import { AlertOwnershipError } from '../send-alert/sendAlert.ts';
import { smsProviderFromEnv } from '../send-alert/sms.ts';
import { AlertNotFoundError, endAlert, type EndReason, type EndStore, parseEndInput } from './endAlert.ts';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function supabaseStore(db: SupabaseClient<Database>): EndStore {
  return {
    async end(userId, input) {
      const { data, error } = await db.rpc('end_alert', {
        p_user_id: userId,
        p_id: input.id,
        p_reason: input.reason,
      });
      if (error?.code === '42501') throw new AlertOwnershipError();
      if (error?.code === 'P0002') throw new AlertNotFoundError();
      if (error) throw new Error(`end_alert: ${error.message}`);
      const row = data?.[0];
      if (!row) throw new Error('end_alert returned no row');
      return {
        displayName: row.display_name ?? null,
        phone: row.phone_e164 ?? null,
        // The column's check constraint allows only these two values.
        reason: row.ended_reason as EndReason,
        endedAt: row.ended_at,
        recipientCount: row.recipient_count,
      };
    },
    async claim(alertId) {
      const { data, error } = await db.rpc('claim_alert_end_recipients', { p_alert_id: alertId });
      if (error) throw new Error(`claim_alert_end_recipients: ${error.message}`);
      return (data ?? []).map((r) => r.phone_e164);
    },
    async record(alertId, phone, outcome) {
      const { error } = await db.rpc('record_alert_end_recipient', {
        p_alert_id: alertId,
        p_phone_e164: phone,
        p_status: outcome.ok ? 'sent' : 'failed',
        // Generated types mark every SQL argument non-null; these columns are nullable.
        p_provider_message_id: outcome.ok ? outcome.id : (null as unknown as string),
        p_error: outcome.ok ? (null as unknown as string) : outcome.error,
      });
      if (error) throw new Error(`record_alert_end_recipient: ${error.message}`);
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const env = Deno.env.toObject();
  const db = createClient<Database>(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });

  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
  const { data: auth, error: authError } = token ? await db.auth.getUser(token) : { data: null, error: true };
  if (authError || !auth?.user) return json(401, { error: 'unauthorized' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'body must be JSON' });
  }
  const input = parseEndInput(body);
  if ('error' in input) return json(400, { error: input.error });

  try {
    // ponytail: no delivery reports for end texts (sms-status only knows SOS message ids and
    // would answer 404). Add end_delivery_status columns if handset delivery of these matters.
    const sms = smsProviderFromEnv({ ...env, SMS_STATUS_CALLBACK_URL: undefined });
    const result = await endAlert(supabaseStore(db), sms, auth.user.id, input);
    return json(result.status, result.body);
  } catch (e) {
    // Message only: never log request bodies or phone numbers.
    console.error('end-alert failed:', e instanceof Error ? e.message : 'unknown error');
    return json(500, { alertId: input.id, error: 'internal' });
  }
});
