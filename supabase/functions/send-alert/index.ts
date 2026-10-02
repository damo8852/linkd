/**
 * POST /functions/v1/send-alert
 * Body: { id, trigger, triggeredAt, location | null } (see parseAlertInput).
 * Auth: the user's JWT. Identity comes from the verified token, never the body.
 * Returns 200 when every recipient has been texted; 502 with counts when any failed (the app
 * shows it, falls back to the SMS composer, and retries with the same id).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database.ts';
import { AlertOwnershipError, type AlertStore, parseAlertInput, sendAlert } from './sendAlert.ts';
import { smsProviderFromEnv } from './sms.ts';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function supabaseStore(db: SupabaseClient<Database>): AlertStore {
  return {
    async start(userId, input) {
      const { data, error } = await db.rpc('start_alert', {
        p_user_id: userId,
        p_id: input.id,
        p_trigger: input.trigger,
        p_triggered_at: input.triggeredAt,
        // Generated types mark every SQL argument non-null; these columns are nullable and
        // start_alert accepts null for a missing location.
        p_latitude: input.location?.latitude ?? (null as unknown as number),
        p_longitude: input.location?.longitude ?? (null as unknown as number),
        p_accuracy_m: input.location?.accuracyM ?? (null as unknown as number),
        p_located_at: input.location?.at ?? (null as unknown as string),
      });
      if (error?.code === '42501') throw new AlertOwnershipError();
      if (error) throw new Error(`start_alert: ${error.message}`);
      const row = data?.[0];
      if (!row) throw new Error('start_alert returned no row');
      return { displayName: row.display_name ?? null, phone: row.phone_e164 ?? null, recipientCount: row.recipient_count };
    },
    async claim(alertId) {
      const { data, error } = await db.rpc('claim_alert_recipients', { p_alert_id: alertId });
      if (error) throw new Error(`claim_alert_recipients: ${error.message}`);
      return (data ?? []).map((r) => r.phone_e164);
    },
    async record(alertId, phone, outcome) {
      const { error } = await db.rpc('record_alert_recipient', {
        p_alert_id: alertId,
        p_phone_e164: phone,
        p_status: outcome.ok ? 'sent' : 'failed',
        // Nullable in SQL; see the note in start().
        p_provider_message_id: outcome.ok ? outcome.id : (null as unknown as string),
        p_error: outcome.ok ? (null as unknown as string) : outcome.error,
      });
      if (error) throw new Error(`record_alert_recipient: ${error.message}`);
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
  const input = parseAlertInput(body);
  if ('error' in input) return json(400, { error: input.error });

  try {
    const result = await sendAlert(supabaseStore(db), smsProviderFromEnv(env), auth.user.id, input);
    return json(result.status, result.body);
  } catch (e) {
    // Message only: never log request bodies (location) or phone numbers.
    console.error('send-alert failed:', e instanceof Error ? e.message : 'unknown error');
    return json(500, { alertId: input.id, error: 'internal' });
  }
});
