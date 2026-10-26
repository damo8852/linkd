/**
 * POST /functions/v1/countdown
 * Body: { action: 'arm', id, trigger, delayMs } | { action: 'disarm', id } (see parseCountdownInput).
 * Auth: the user's JWT, or an alert token in X-Alert-Token when signed out (see send-alert/auth.ts).
 * Returns 200 with the server state: `armed`, `disarmed`, or `fired` (sent before the disarm).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database.ts';
import { resolveUser, supabaseIdentity } from '../send-alert/auth.ts';
import { AlertOwnershipError } from '../send-alert/sendAlert.ts';
import { type ArmState, countdown, type CountdownStore, parseCountdownInput } from './countdown.ts';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function supabaseStore(db: SupabaseClient<Database>): CountdownStore {
  const state = (data: string | null, error: { code?: string; message: string } | null, fn: string): ArmState => {
    if (error?.code === '42501') throw new AlertOwnershipError();
    if (error) throw new Error(`${fn}: ${error.message}`);
    // The SQL functions return only these three values.
    return data as ArmState;
  };
  return {
    async arm(userId, id, trigger, delayMs) {
      const { data, error } = await db.rpc('arm_alert', {
        p_user_id: userId,
        p_id: id,
        p_trigger: trigger,
        p_delay_ms: delayMs,
      });
      return state(data, error, 'arm_alert');
    },
    async disarm(userId, id) {
      const { data, error } = await db.rpc('disarm_alert', { p_user_id: userId, p_id: id });
      return state(data, error, 'disarm_alert');
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const env = Deno.env.toObject();
  const db = createClient<Database>(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });

  let userId: string | null;
  try {
    userId = await resolveUser(req.headers, supabaseIdentity(db));
  } catch (e) {
    console.error('countdown auth failed:', e instanceof Error ? e.message : 'unknown error');
    return json(500, { error: 'internal' });
  }
  if (!userId) return json(401, { error: 'unauthorized' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'body must be JSON' });
  }
  const input = parseCountdownInput(body);
  if ('error' in input) return json(400, { error: input.error });

  try {
    const result = await countdown(supabaseStore(db), userId, input);
    return json(result.status, result.body);
  } catch (e) {
    console.error('countdown failed:', e instanceof Error ? e.message : 'unknown error');
    return json(500, { alertId: input.id, error: 'internal' });
  }
});
