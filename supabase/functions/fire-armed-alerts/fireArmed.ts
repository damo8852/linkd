/**
 * fire-armed-alerts logic: sends every armed countdown that came due without being disarmed,
 * free of HTTP so it is testable with fakes. Called every second by pg_cron when something is due.
 * Spec: docs/design/sos_alert_flow.md (Countdowns run on the server).
 */

import { type AlertStore, sendAlert, type Trigger } from '../send-alert/sendAlert.ts';
import type { SmsProvider } from '../send-alert/sms.ts';

export const RETRY_MS = 5_000;

export type DueAlert = { id: string; userId: string; trigger: Trigger; sendAt: string };

/** Backed by the claim_due_armed_alerts / retry_armed_alert SQL functions. */
export interface ArmedStore {
  /** Atomically claims due alerts; each is returned to one caller only. */
  claimDue(): Promise<DueAlert[]>;
  retry(id: string, delayMs: number): Promise<void>;
}

/** True only for the cron's shared secret. Compared in constant time; an unset secret accepts nothing. */
export function isCronRequest(headers: Headers, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = new TextEncoder().encode(headers.get('Authorization') ?? '');
  const expected = new TextEncoder().encode(`Bearer ${secret}`);
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (given[i] ?? 0) ^ (expected[i] ?? 0);
  return diff === 0;
}

/**
 * Sends each claimed alert as its owner, exactly as the app's own send would, on the same id so
 * contacts are never texted twice when the phone sends too.
 * On failure: a failed text or a store error schedules a retry in RETRY_MS and never stops the
 * other alerts; nobody to text (422) is not retried. Errors are logged without PII.
 */
export async function fireDue(
  armed: ArmedStore,
  alerts: AlertStore,
  sms: SmsProvider,
): Promise<{ fired: number; failed: number }> {
  const due = await armed.claimDue();
  let failed = 0;
  for (const alert of due) {
    let ok: boolean;
    try {
      const result = await sendAlert(alerts, sms, alert.userId, {
        id: alert.id,
        trigger: alert.trigger,
        triggeredAt: alert.sendAt,
        // ponytail: no location from the server; the phone's own send carries it once location lands.
        location: null,
      });
      ok = result.status !== 502;
    } catch (e) {
      console.error('fire-armed-alerts send failed:', e instanceof Error ? e.message : 'unknown error');
      ok = false;
    }
    if (!ok) {
      failed++;
      await armed.retry(alert.id, RETRY_MS);
    }
  }
  return { fired: due.length, failed };
}
