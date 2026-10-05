/**
 * POST /functions/v1/sms-status
 * Called by Twilio (form-encoded status callback), not by the app, so there is no user JWT
 * (`verify_jwt = false` in supabase/config.toml). The caller is authenticated by its
 * X-Twilio-Signature instead. Returns 200 once a final delivery status is recorded or ignored.
 */

import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database.ts';
import { type DeliveryStore, handleStatusCallback } from './smsStatus.ts';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const env = Deno.env.toObject();
  // Without both there is nothing to verify against, so refuse rather than trust the caller.
  if (!env.TWILIO_AUTH_TOKEN || !env.SMS_STATUS_CALLBACK_URL) {
    console.error('sms-status failed: TWILIO_AUTH_TOKEN or SMS_STATUS_CALLBACK_URL is not set');
    return json(500, { error: 'internal' });
  }

  const db = createClient<Database>(env.SUPABASE_URL ?? '', env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });
  const store: DeliveryStore = {
    async record(providerMessageId, status, errorCode) {
      const { data, error } = await db.rpc('record_alert_delivery', {
        p_provider_message_id: providerMessageId,
        p_status: status,
        // Generated types mark every SQL argument non-null; the function accepts null here.
        p_error_code: errorCode ?? (null as unknown as string),
      });
      if (error) throw new Error(`record_alert_delivery: ${error.message}`);
      return data === true;
    },
  };

  try {
    const result = await handleStatusCallback(
      store,
      { authToken: env.TWILIO_AUTH_TOKEN, url: env.SMS_STATUS_CALLBACK_URL },
      req.headers.get('X-Twilio-Signature'),
      await req.text(),
    );
    return json(result.status, result.body);
  } catch (e) {
    // Message only: never log the request body (it carries phone numbers).
    console.error('sms-status failed:', e instanceof Error ? e.message : 'unknown error');
    return json(500, { error: 'internal' });
  }
});
