/**
 * SMS provider for alert texts. `SMS_PROVIDER` picks it:
 * - `fake`: no network, always succeeds (tests, local dev)
 * - `sandbox`: Twilio test credentials; Twilio validates but never delivers
 * - `live`: real Twilio; set only in production
 * Unset or unknown throws, so a misconfigured deploy fails loud instead of silently not texting.
 */

export type SmsResult = { ok: true; id: string } | { ok: false; error: string };

export interface SmsProvider {
  /** Never rejects for a provider-side refusal; returns `ok: false`. May reject on network failure. */
  send(to: string, body: string): Promise<SmsResult>;
}

export const fakeSms: SmsProvider = {
  send: () => Promise.resolve({ ok: true, id: `fake-${crypto.randomUUID()}` }),
};

/** `statusCallback`: where Twilio reports handset delivery (the sms-status function). */
type TwilioConfig = { accountSid: string; authToken: string; from: string; statusCallback?: string };

/** Twilio Messages API: https://www.twilio.com/docs/messaging/api/message-resource */
export function twilioSms(config: TwilioConfig, fetchFn: typeof fetch = fetch): SmsProvider {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const authorization = `Basic ${btoa(`${config.accountSid}:${config.authToken}`)}`;
  return {
    async send(to, body) {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          To: to,
          From: config.from,
          Body: body,
          ...(config.statusCallback ? { StatusCallback: config.statusCallback } : {}),
        }).toString(),
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
      if (res.ok && json.sid) return { ok: true, id: json.sid };
      return { ok: false, error: `twilio ${json.code ?? res.status}: ${json.message ?? 'unknown error'}` };
    },
  };
}

/** Twilio's test-credential sender that always validates; see twilio.com/docs/iam/test-credentials */
const TWILIO_TEST_FROM = '+15005550006';

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function smsProviderFromEnv(
  env: Record<string, string | undefined>,
  fetchFn: typeof fetch = fetch,
): SmsProvider {
  switch (env.SMS_PROVIDER) {
    case 'fake':
      return fakeSms;
    case 'sandbox':
      // No status callback: Twilio test credentials never send one.
      return twilioSms({
        accountSid: required(env, 'TWILIO_TEST_ACCOUNT_SID'),
        authToken: required(env, 'TWILIO_TEST_AUTH_TOKEN'),
        from: TWILIO_TEST_FROM,
      }, fetchFn);
    case 'live':
      return twilioSms({
        accountSid: required(env, 'TWILIO_ACCOUNT_SID'),
        authToken: required(env, 'TWILIO_AUTH_TOKEN'),
        from: required(env, 'TWILIO_FROM_NUMBER'),
        // Optional on purpose: a missing URL loses delivery reports, but must never stop the SOS text.
        statusCallback: env.SMS_STATUS_CALLBACK_URL || undefined,
      }, fetchFn);
    default:
      throw new Error(`SMS_PROVIDER must be fake, sandbox, or live (got ${env.SMS_PROVIDER ?? 'nothing'})`);
  }
}
