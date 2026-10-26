/**
 * verify-phone logic, free of HTTP and Supabase so it is testable with fakes.
 * The code, its expiry, and the send limits live in SQL (start_phone_code); this only texts it.
 * The app confirms the code itself with the confirm_phone_code RPC.
 */

import type { SmsProvider } from '../send-alert/sms.ts';

export type StartResult =
  | { status: 'sent'; code: string; phone: string }
  | { status: 'no_profile' | 'already_verified' | 'too_soon' | 'too_many' };

/** Backed by the start_phone_code SQL function (service role). */
export interface CodeStore {
  start(userId: string): Promise<StartResult>;
}

export type SendResponse = { status: number; body: { sent?: true; verified?: true; error?: string } };

export function codeMessage(code: string): string {
  return `Your LINKD code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this text.`;
}

/**
 * Starts a code for the user's own number and texts it.
 * On failure: a provider refusal answers 502 so the app says the text was not sent; a network
 * error rejects and the handler answers 500. Either way the 60 s resend wait still applies.
 */
export async function sendPhoneCode(store: CodeStore, sms: SmsProvider, userId: string): Promise<SendResponse> {
  const started = await store.start(userId);
  switch (started.status) {
    case 'sent': {
      const result = await sms.send(started.phone, codeMessage(started.code));
      return result.ok ? { status: 200, body: { sent: true } } : { status: 502, body: { error: 'sms_failed' } };
    }
    case 'already_verified':
      return { status: 200, body: { verified: true } };
    case 'no_profile':
      return { status: 409, body: { error: 'no_profile' } };
    default:
      return { status: 429, body: { error: started.status } };
  }
}
