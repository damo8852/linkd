/**
 * countdown logic: arms and disarms the server-side send of a countdown, free of HTTP so it is
 * testable with fakes. Spec: docs/design/sos_alert_flow.md (Countdowns run on the server).
 */

import { AlertOwnershipError, type Trigger } from '../send-alert/sendAlert.ts';

/** `fired`: the server already sent it, so a disarm came too late. */
export type ArmState = 'armed' | 'disarmed' | 'fired';

export type CountdownInput =
  | { action: 'arm'; id: string; trigger: Trigger; delayMs: number }
  | { action: 'disarm'; id: string };

/** Backed by the arm_alert / disarm_alert SQL functions. Both reject with AlertOwnershipError. */
export interface CountdownStore {
  arm(userId: string, id: string, trigger: Trigger, delayMs: number): Promise<ArmState>;
  disarm(userId: string, id: string): Promise<ArmState>;
}

export const MAX_DELAY_MS = 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TRIGGERS: readonly string[] = ['button', 'inApp', 'linkLoss'];

export function parseCountdownInput(body: unknown): CountdownInput | { error: string } {
  if (typeof body !== 'object' || body === null) return { error: 'body must be a JSON object' };
  const { action, id, trigger, delayMs } = body as Record<string, unknown>;
  if (typeof id !== 'string' || !UUID.test(id)) return { error: 'id must be a UUID' };
  if (action === 'disarm') return { action, id };
  if (action !== 'arm') return { error: 'action must be arm or disarm' };
  if (typeof trigger !== 'string' || !TRIGGERS.includes(trigger)) return { error: 'unknown trigger' };
  if (!Number.isInteger(delayMs) || (delayMs as number) < 0 || (delayMs as number) > MAX_DELAY_MS) {
    return { error: `delayMs must be an integer 0..${MAX_DELAY_MS}` };
  }
  return { action, id, trigger: trigger as Trigger, delayMs: delayMs as number };
}

/**
 * Arms or disarms for the verified user. On failure: another user's id is 403; store errors
 * reject so the handler returns 500 and the app retries.
 */
export async function countdown(
  store: CountdownStore,
  userId: string,
  input: CountdownInput,
): Promise<{ status: number; body: { alertId?: string; state?: ArmState; error?: string } }> {
  try {
    const state =
      input.action === 'arm'
        ? await store.arm(userId, input.id, input.trigger, input.delayMs)
        : await store.disarm(userId, input.id);
    return { status: 200, body: { alertId: input.id, state } };
  } catch (e) {
    if (e instanceof AlertOwnershipError) return { status: 403, body: { error: 'forbidden' } };
    throw e;
  }
}
