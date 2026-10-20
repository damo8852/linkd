/**
 * POST /functions/v1/join-waitlist  { email, token }
 * Called by the public landing page (apps/web), which has no user, so `verify_jwt = false`
 * (supabase/config.toml). The caller proves it is a person with a Cloudflare Turnstile token;
 * only then is the email inserted, with the service role (clients cannot insert directly).
 */

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database.ts';
import { joinWaitlist, verifyTurnstile, type WaitlistStore } from './joinWaitlist.ts';

// Any origin: the Turnstile token is what authenticates the request, not the page it came from.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const env = Deno.env.toObject();
  // Without the secret nothing can be verified, so refuse rather than let bots through.
  if (!env.TURNSTILE_SECRET_KEY) {
    console.error('join-waitlist failed: TURNSTILE_SECRET_KEY is not set');
    return json(500, { error: 'internal' });
  }

  const db = createClient<Database>(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  const store: WaitlistStore = {
    async add(email) {
      const { error } = await db.from('waitlist').insert({ email });
      if (!error) return 'added';
      if (error.code === '23505') return 'duplicate';
      throw new Error(`waitlist insert: ${error.message}`);
    },
  };

  let input: unknown = null;
  try {
    input = await req.json();
  } catch {
    // Not JSON: joinWaitlist answers invalid_email.
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || null;

  try {
    const result = await joinWaitlist(store, verifyTurnstile(env.TURNSTILE_SECRET_KEY), input, ip);
    return json(result.status, result.body);
  } catch (e) {
    // Message only: never log the email.
    console.error('join-waitlist failed:', e instanceof Error ? e.message : 'unknown error');
    return json(500, { error: 'internal' });
  }
});
