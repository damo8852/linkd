/**
 * POST /functions/v1/fire-armed-alerts
 * Called by pg_cron (migration armed_alerts) every second while an armed countdown is due.
 * Auth: `Authorization: Bearer <ARMED_ALERTS_CRON_SECRET>`; nothing else is accepted.
 * Returns 200 with how many alerts were sent and how many will be retried.
 */

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database.ts';
import { smsProviderFromEnv } from '../send-alert/sms.ts';
import { supabaseStore } from '../send-alert/store.ts';
import type { Trigger } from '../send-alert/sendAlert.ts';
import { type ArmedStore, fireDue, isCronRequest } from './fireArmed.ts';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const env = Deno.env.toObject();
  if (!isCronRequest(req.headers, env.ARMED_ALERTS_CRON_SECRET)) return json(401, { error: 'unauthorized' });

  const db = createClient<Database>(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  const armed: ArmedStore = {
    async claimDue() {
      const { data, error } = await db.rpc('claim_due_armed_alerts');
      if (error) throw new Error(`claim_due_armed_alerts: ${error.message}`);
      return (data ?? []).map((r) => ({
        id: r.id,
        userId: r.user_id,
        // The column's check constraint allows only the three triggers.
        trigger: r.trigger as Trigger,
        sendAt: r.send_at,
      }));
    },
    async retry(id, delayMs) {
      const { error } = await db.rpc('retry_armed_alert', { p_id: id, p_delay_ms: delayMs });
      if (error) throw new Error(`retry_armed_alert: ${error.message}`);
    },
  };

  try {
    return json(200, await fireDue(armed, supabaseStore(db), smsProviderFromEnv(env)));
  } catch (e) {
    console.error('fire-armed-alerts failed:', e instanceof Error ? e.message : 'unknown error');
    return json(500, { error: 'internal' });
  }
});
