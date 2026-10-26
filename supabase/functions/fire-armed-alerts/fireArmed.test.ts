import { assertEquals } from '@std/assert';

import type { AlertInput, AlertStore } from '../send-alert/sendAlert.ts';
import type { SmsProvider } from '../send-alert/sms.ts';
import { type ArmedStore, type DueAlert, fireDue, isCronRequest, RETRY_MS } from './fireArmed.ts';

const SEND_AT = '2026-10-26T12:00:00.000Z';
const due = (id: string, userId = 'user-1'): DueAlert => ({ id, userId, trigger: 'linkLoss', sendAt: SEND_AT });

function fakes(contacts: Record<string, string[]>, failing: string[] = []) {
  const started: [string, AlertInput][] = [];
  const retries: [string, number][] = [];
  const texted: string[] = [];
  let queue: DueAlert[] = [];
  const armed: ArmedStore = {
    claimDue: () => {
      const claimed = queue;
      queue = [];
      return Promise.resolve(claimed);
    },
    retry: (id, delayMs) => {
      retries.push([id, delayMs]);
      return Promise.resolve();
    },
  };
  const alerts: AlertStore = {
    start: (userId, input) => {
      started.push([userId, input]);
      if (input.id === 'boom') return Promise.reject(new Error('db down'));
      return Promise.resolve({ displayName: 'U', phone: null, recipientCount: (contacts[input.id] ?? []).length });
    },
    claim: (id) => Promise.resolve(contacts[id] ?? []),
    record: () => Promise.resolve(),
  };
  const sms: SmsProvider = {
    send: (phone) => {
      texted.push(phone);
      return Promise.resolve(failing.includes(phone) ? { ok: false, error: 'carrier' } : { ok: true, id: 'SM' });
    },
  };
  return { armed, alerts, sms, started, retries, texted, arm: (...d: DueAlert[]) => (queue = d) };
}

Deno.test('sends each due alert as its own user, with its id, trigger, and send time', async () => {
  const f = fakes({ a: ['+15555550101'], b: ['+15555550102'] });
  f.arm(due('a', 'user-1'), due('b', 'user-2'));

  assertEquals(await fireDue(f.armed, f.alerts, f.sms), { fired: 2, failed: 0 });
  assertEquals(f.started, [
    ['user-1', { id: 'a', trigger: 'linkLoss', triggeredAt: SEND_AT, location: null }],
    ['user-2', { id: 'b', trigger: 'linkLoss', triggeredAt: SEND_AT, location: null }],
  ]);
  assertEquals(f.texted, ['+15555550101', '+15555550102']);
  assertEquals(f.retries, []);
});

Deno.test('a failed text or a store error schedules a retry; one failure never stops the others', async () => {
  const f = fakes({ a: ['+15555550101'], c: ['+15555550103'] }, ['+15555550101']);
  f.arm(due('a'), due('boom'), due('c'));

  assertEquals(await fireDue(f.armed, f.alerts, f.sms), { fired: 3, failed: 2 });
  assertEquals(f.retries, [
    ['a', RETRY_MS],
    ['boom', RETRY_MS],
  ]);
  assertEquals(f.texted, ['+15555550101', '+15555550103']);
});

Deno.test('no contacts is not retried: a retry cannot fix it', async () => {
  const f = fakes({});
  f.arm(due('a'));

  assertEquals(await fireDue(f.armed, f.alerts, f.sms), { fired: 1, failed: 0 });
  assertEquals(f.retries, []);
});

Deno.test('only the cron secret is accepted', () => {
  const req = (auth?: string) => new Headers(auth === undefined ? {} : { Authorization: auth });
  assertEquals(isCronRequest(req('Bearer s3cret-value'), 's3cret-value'), true);
  assertEquals(isCronRequest(req('Bearer wrong-value'), 's3cret-value'), false);
  assertEquals(isCronRequest(req(), 's3cret-value'), false);
  assertEquals(isCronRequest(req('Bearer '), ''), false);
  assertEquals(isCronRequest(req('Bearer undefined'), undefined), false);
});
