/**
 * POST /functions/v1/send-alert
 * Body: { id, trigger, triggeredAt, location | null } (see parseAlertInput).
 * Auth: the user's JWT, or an alert token in X-Alert-Token when signed out (see auth.ts).
 * Identity comes from the verified credential, never the body.
 * Returns 200 when every recipient has been texted; 502 with counts when any failed (the app
 * shows it, falls back to the SMS composer, and retries with the same id).
 */

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database.ts';
import { resolveUser, supabaseIdentity } from './auth.ts';
import { parseAlertInput, sendAlert } from './sendAlert.ts';
import { smsProviderFromEnv } from './sms.ts';
import { supabaseStore } from './store.ts';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

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
    console.error('send-alert auth failed:', e instanceof Error ? e.message : 'unknown error');
    return json(500, { error: 'internal' });
  }
  if (!userId) return json(401, { error: 'unauthorized' });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'body must be JSON' });
  }
  const input = parseAlertInput(body);
  if ('error' in input) return json(400, { error: input.error });

  try {
    const result = await sendAlert(supabaseStore(db), smsProviderFromEnv(env), userId, input);
    return json(result.status, result.body);
  } catch (e) {
    // Message only: never log request bodies (location) or phone numbers.
    console.error('send-alert failed:', e instanceof Error ? e.message : 'unknown error');
    return json(500, { alertId: input.id, error: 'internal' });
  }
});
