/**
 * end-alert logic, free of HTTP and Supabase so it is testable with fakes.
 * Ends the alert once, then sends the end text to every recipient the SOS text reached.
 * Spec: docs/design/sos_alert_flow.md (Ending an alert). Rules: docs/protocol/supabase_protocol.md.
 */

import { AlertOwnershipError, type Profile } from '../send-alert/sendAlert.ts';
import type { SmsProvider, SmsResult } from '../send-alert/sms.ts';

/** `user`: she said "I'm safe". `timeout`: the 60 min auto-end; nobody confirmed anything. */
export type EndReason = 'user' | 'timeout';

export type EndInput = { id: string; reason: EndReason };

/** Thrown by `EndStore.end` when no alert has that id. */
export class AlertNotFoundError extends Error {
  constructor() {
    super('alert not found');
  }
}

/** Backed by the end_alert / claim_alert_end_recipients / record_alert_end_recipient SQL functions. */
export interface EndStore {
  /**
   * Ends the alert; the first end wins. Resolves with the end as recorded, which can differ from
   * `input.reason` on a retry. Rejects with AlertOwnershipError or AlertNotFoundError.
   */
  end(userId: string, input: EndInput): Promise<Profile & { reason: EndReason; endedAt: string; recipientCount: number }>;
  /** Atomically claims the recipients still owed the end text; each is returned to one caller only. */
  claim(alertId: string): Promise<string[]>;
  record(alertId: string, phone: string, outcome: SmsResult): Promise<void>;
}

export type EndAlertResponse = {
  status: number;
  body: {
    alertId?: string;
    reason?: EndReason;
    endedAt?: string;
    total?: number;
    sent?: number;
    failed?: number;
    error?: string;
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseEndInput(body: unknown): EndInput | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'body must be a JSON object' };
  const { id, reason } = body as Record<string, unknown>;
  if (typeof id !== 'string' || !UUID.test(id)) return { error: 'id must be a UUID' };
  // No default: guessing `user` would tell contacts she is safe when nobody said so.
  if (reason !== 'user' && reason !== 'timeout') return { error: 'reason must be user or timeout' };
  return { id, reason };
}

/** The end text. Only a `user` end may say she is safe; a `timeout` end says nobody confirmed it. */
export function buildEndMessage(profile: Profile, reason: EndReason): string {
  const who = profile.displayName ?? 'Your LINKD contact';
  if (reason === 'user') return `LINKD: ${who} has confirmed they are safe. The emergency alert has ended.`;
  const lines = [
    `LINKD: ${who}'s emergency alert ended automatically after 60 minutes. They have NOT confirmed they are safe.`,
  ];
  if (profile.phone) lines.push(`Call ${profile.displayName ?? 'them'}: ${profile.phone}`);
  return lines.join('\n');
}

/**
 * Ends the alert and texts the recipients the SOS reached.
 * On failure: provider errors are recorded per recipient and returned as 502 so the app shows
 * them and retries; store errors reject so the handler returns 500. Nothing is swallowed.
 */
export async function endAlert(
  store: EndStore,
  sms: SmsProvider,
  userId: string,
  input: EndInput,
): Promise<EndAlertResponse> {
  let ended;
  try {
    ended = await store.end(userId, input);
  } catch (e) {
    if (e instanceof AlertOwnershipError) return { status: 403, body: { error: 'forbidden' } };
    if (e instanceof AlertNotFoundError) return { status: 404, body: { alertId: input.id, error: 'unknown_alert' } };
    throw e;
  }
  const { recipientCount, reason, endedAt, ...profile } = ended;

  // The recorded reason, not the request's: a retry must never change what contacts are told.
  const message = buildEndMessage(profile, reason);
  const phones = await store.claim(input.id);

  let sent = 0;
  let failed = 0;
  for (const phone of phones) {
    let outcome: SmsResult;
    try {
      outcome = await sms.send(phone, message);
    } catch (e) {
      outcome = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    await store.record(input.id, phone, outcome);
    if (outcome.ok) sent++;
    else failed++;
  }

  const body = { alertId: input.id, reason, endedAt, total: recipientCount, sent, failed };
  return failed > 0 ? { status: 502, body: { ...body, error: 'sms_failed' } } : { status: 200, body };
}
