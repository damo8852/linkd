/**
 * send-alert logic, free of HTTP and Supabase so it is testable with fakes.
 * Records the alert once per client-generated id, then texts every recipient not yet sent.
 * Spec: docs/design/sos_alert_flow.md. Rules: docs/protocol/supabase_protocol.md.
 */

import type { SmsProvider, SmsResult } from './sms.ts';

export type Trigger = 'button' | 'inApp' | 'linkLoss';

export type Location = { latitude: number; longitude: number; accuracyM: number | null; at: string | null };

export type AlertInput = { id: string; trigger: Trigger; triggeredAt: string; location: Location | null };

export type Profile = { displayName: string | null; phone: string | null };

/** Thrown by `AlertStore.start` when the alert id already belongs to another user. */
export class AlertOwnershipError extends Error {
  constructor() {
    super('alert id belongs to another user');
  }
}

/** Backed by the start_alert / claim_alert_recipients / record_alert_recipient SQL functions. */
export interface AlertStore {
  start(userId: string, input: AlertInput): Promise<Profile & { recipientCount: number }>;
  /** Atomically claims the recipients still needing a text; each is returned to one caller only. */
  claim(alertId: string): Promise<string[]>;
  record(alertId: string, phone: string, outcome: SmsResult): Promise<void>;
}

export type SendAlertResponse = {
  status: number;
  body: { alertId?: string; total?: number; sent?: number; failed?: number; error?: string };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRIGGERS: readonly string[] = ['button', 'inApp', 'linkLoss'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const inRange = (v: unknown, limit: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit;

export function parseAlertInput(body: unknown): AlertInput | { error: string } {
  if (!isRecord(body)) return { error: 'body must be a JSON object' };
  const { id, trigger, triggeredAt, location } = body;
  if (typeof id !== 'string' || !UUID.test(id)) return { error: 'id must be a UUID' };
  if (typeof trigger !== 'string' || !TRIGGERS.includes(trigger)) return { error: 'unknown trigger' };
  if (!isDate(triggeredAt)) return { error: 'triggeredAt must be an ISO date' };

  let parsedLocation: Location | null = null;
  if (location !== null && location !== undefined) {
    if (!isRecord(location)) return { error: 'location must be an object or null' };
    const { latitude, longitude, accuracyM, at } = location;
    if (!inRange(latitude, 90) || !inRange(longitude, 180)) return { error: 'location out of range' };
    if (accuracyM !== undefined && accuracyM !== null && !(typeof accuracyM === 'number' && accuracyM >= 0)) {
      return { error: 'accuracyM must be a non-negative number' };
    }
    if (at !== undefined && at !== null && !isDate(at)) return { error: 'location.at must be an ISO date' };
    parsedLocation = { latitude, longitude, accuracyM: accuracyM ?? null, at: at ?? null };
  }

  return { id, trigger: trigger as Trigger, triggeredAt, location: parsedLocation };
}

/** The SOS text. Works without a profile or a location: sending always beats waiting. */
export function buildMessage(profile: Profile, location: Location | null): string {
  const who = profile.displayName ?? 'Your LINKD contact';
  const lines = [`LINKD SOS: ${who} triggered an emergency alert and may need help.`];
  if (location) {
    const accuracy = location.accuracyM === null ? '' : ` (within ${Math.round(location.accuracyM)} m)`;
    lines.push(
      `Location: https://maps.google.com/?q=${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}${accuracy}`,
    );
  } else {
    lines.push('Location unavailable.');
  }
  if (profile.phone) lines.push(`Call ${profile.displayName ?? 'them'}: ${profile.phone}`);
  return lines.join('\n');
}

/**
 * Records the alert and texts its recipients.
 * On failure: provider errors are recorded per recipient and returned as 502 so the app shows
 * them and retries; store errors reject so the handler returns 500. Nothing is swallowed.
 */
export async function sendAlert(
  store: AlertStore,
  sms: SmsProvider,
  userId: string,
  input: AlertInput,
): Promise<SendAlertResponse> {
  let started;
  try {
    started = await store.start(userId, input);
  } catch (e) {
    if (e instanceof AlertOwnershipError) return { status: 403, body: { error: 'forbidden' } };
    throw e;
  }
  const { recipientCount, ...profile } = started;
  if (recipientCount === 0) return { status: 422, body: { alertId: input.id, error: 'no_active_contacts' } };

  const message = buildMessage(profile, input.location);
  const phones = await store.claim(input.id);

  // Sequential keeps Twilio rate limits simple; at most 5 recipients.
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

  const body = { alertId: input.id, total: recipientCount, sent, failed };
  return failed > 0 ? { status: 502, body: { ...body, error: 'sms_failed' } } : { status: 200, body };
}
