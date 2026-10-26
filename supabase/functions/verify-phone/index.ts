/**
 * POST /functions/v1/verify-phone  {}
 * Texts the signed-in user a code for their own number. The gateway verifies the JWT
 * (`verify_jwt` stays on); the user comes from it, never from the body.
 */

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database.ts';
import { smsProviderFromEnv } from '../send-alert/sms.ts';
import { type CodeStore, sendPhoneCode, type StartResult } from './verifyPhone.ts';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const env = Deno.env.toObject();
  const db = createClient<Database>(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });

  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s*/i, '').trim() ?? '';
  const { data: auth, error: authError } = await db.auth.getUser(jwt);
  const userId = authError ? null : auth.user?.id;
  if (!userId) return json(401, { error: 'unauthorized' });

  const store: CodeStore = {
    async start(id) {
      const { data, error } = await db.rpc('start_phone_code', { p_user_id: id });
      if (error) throw new Error(`start_phone_code: ${error.message}`);
      const row = data?.[0];
      if (!row) throw new Error('start_phone_code returned nothing');
      // The SQL function sets code and phone exactly when status is 'sent'.
      return (row.status === 'sent' ? { status: 'sent', code: row.code, phone: row.phone_e164 } : { status: row.status }) as StartResult;
    },
  };

  try {
    const result = await sendPhoneCode(store, smsProviderFromEnv(env), userId);
    return json(result.status, result.body);
  } catch (e) {
    // Message only: never log the number or the code.
    console.error('verify-phone failed:', e instanceof Error ? e.message : 'unknown error');
    return json(500, { error: 'internal' });
  }
});
