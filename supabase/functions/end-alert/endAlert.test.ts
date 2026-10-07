import { assert, assertEquals, assertRejects, assertStringIncludes } from '@std/assert';

import { AlertOwnershipError } from '../send-alert/sendAlert.ts';
import type { SmsProvider } from '../send-alert/sms.ts';
import {
  AlertNotFoundError,
  buildEndMessage,
  endAlert,
  type EndInput,
  type EndReason,
  type EndStore,
  parseEndInput,
} from './endAlert.ts';

const USER = '11111111-1111-1111-1111-111111111111';
const ALERT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ENDED_AT = '2026-10-07T12:00:00.000Z';
const PROFILE = { displayName: 'Test User', phone: '+15555550199' };

const input = (reason: EndReason = 'user'): EndInput => ({ id: ALERT_ID, reason });

/**
 * In-memory store with the same semantics as the SQL functions: the first end fixes the reason,
 * and a recipient is claimed once until recorded. `phones` are the recipients whose SOS was sent.
 */
function memoryStore(phones: string[], profile = PROFILE) {
  const status = new Map(phones.map((p) => [p, 'pending']));
  let endedReason: EndReason | null = null;
  const store: EndStore = {
    end: (_userId, { reason }) => {
      endedReason ??= reason;
      return Promise.resolve({ ...profile, reason: endedReason, endedAt: ENDED_AT, recipientCount: phones.length });
    },
    claim: () => {
      const claimable = phones.filter((p) => status.get(p) === 'pending' || status.get(p) === 'failed');
      claimable.forEach((p) => status.set(p, 'sending'));
      return Promise.resolve(claimable);
    },
    record: (_alertId, phone, outcome) => {
      status.set(phone, outcome.ok ? 'sent' : 'failed');
      return Promise.resolve();
    },
  };
  return { store, status };
}

function recordingSms(fail: (to: string) => 'error' | 'throw' | null = () => null) {
  const sent: { to: string; body: string }[] = [];
  const sms: SmsProvider = {
    send(to, body) {
      sent.push({ to, body });
      const mode = fail(to);
      if (mode === 'throw') return Promise.reject(new Error('network down'));
      if (mode === 'error') return Promise.resolve({ ok: false, error: 'carrier error' });
      return Promise.resolve({ ok: true, id: `SM-${to}` });
    },
  };
  return { sms, sent };
}

// ---------- input validation ----------

Deno.test('parseEndInput accepts a user end and a timeout end', () => {
  assertEquals(parseEndInput({ id: ALERT_ID, reason: 'user' }), { id: ALERT_ID, reason: 'user' });
  assertEquals(parseEndInput({ id: ALERT_ID, reason: 'timeout' }), { id: ALERT_ID, reason: 'timeout' });
});

Deno.test('parseEndInput rejects bad input: the reason is never guessed', () => {
  const bad: unknown[] = [null, 'x', {}, { id: 'not-a-uuid', reason: 'user' }, { id: ALERT_ID }, {
    id: ALERT_ID,
    reason: 'safe',
  }];
  for (const body of bad) assert('error' in parseEndInput(body), JSON.stringify(body));
});

// ---------- message content ----------

Deno.test('a user end says they confirmed they are safe', () => {
  const msg = buildEndMessage(PROFILE, 'user');
  assertStringIncludes(msg, 'Test User');
  assertStringIncludes(msg, 'confirmed they are safe');
});

Deno.test('a timeout end never says safe: it says nobody confirmed, and gives the callback number', () => {
  const msg = buildEndMessage(PROFILE, 'timeout');
  assertStringIncludes(msg, 'Test User');
  assertStringIncludes(msg, 'NOT confirmed they are safe');
  assertStringIncludes(msg, '+15555550199');
  assert(!/(is|are) safe\./i.test(msg.replace('NOT confirmed they are safe.', '')));
});

Deno.test('messages still go out without a profile', () => {
  for (const reason of ['user', 'timeout'] as const) {
    const msg = buildEndMessage({ displayName: null, phone: null }, reason);
    assertStringIncludes(msg, 'LINKD');
    assert(!msg.includes('null'));
  }
});

// ---------- ending ----------

Deno.test('texts every recipient the SOS reached and reports how it ended', async () => {
  const { store, status } = memoryStore(['+15555550101', '+15555550102']);
  const { sms, sent } = recordingSms();

  const res = await endAlert(store, sms, USER, input());

  assertEquals(res.status, 200);
  assertEquals(res.body, { alertId: ALERT_ID, reason: 'user', endedAt: ENDED_AT, total: 2, sent: 2, failed: 0 });
  assertEquals(sent.map((s) => s.to), ['+15555550101', '+15555550102']);
  assertStringIncludes(sent[0]!.body, 'confirmed they are safe');
  assertEquals([...status.values()], ['sent', 'sent']);
});

Deno.test('a retry never texts anyone twice', async () => {
  const { store } = memoryStore(['+15555550101', '+15555550102']);
  await endAlert(store, recordingSms().sms, USER, input());

  const retry = recordingSms();
  const res = await endAlert(store, retry.sms, USER, input());

  assertEquals(retry.sent, []);
  assertEquals(res.status, 200);
  assertEquals(res.body, { alertId: ALERT_ID, reason: 'user', endedAt: ENDED_AT, total: 2, sent: 0, failed: 0 });
});

Deno.test('a timeout end sends the not-confirmed text', async () => {
  const { store } = memoryStore(['+15555550101']);
  const { sms, sent } = recordingSms();

  const res = await endAlert(store, sms, USER, input('timeout'));

  assertEquals(res.body.reason, 'timeout');
  assertStringIncludes(sent[0]!.body, 'NOT confirmed they are safe');
});

Deno.test('the text follows how the alert was first ended, not what a later call claims', async () => {
  const { store } = memoryStore(['+15555550101']);
  // The timeout end is recorded, but its text fails.
  await endAlert(store, recordingSms(() => 'error').sms, USER, input('timeout'));

  const { sms, sent } = recordingSms();
  const res = await endAlert(store, sms, USER, input('user'));

  assertEquals(res.body.reason, 'timeout');
  assertStringIncludes(sent[0]!.body, 'NOT confirmed they are safe');
});

Deno.test('a provider error is recorded and returned, and the others still send', async () => {
  const { store, status } = memoryStore(['+15555550101', '+15555550102']);
  const { sms, sent } = recordingSms((to) => (to === '+15555550101' ? 'error' : null));

  const res = await endAlert(store, sms, USER, input());

  assertEquals(sent.length, 2);
  assertEquals(res.status, 502);
  assertEquals(res.body, {
    alertId: ALERT_ID,
    reason: 'user',
    endedAt: ENDED_AT,
    total: 2,
    sent: 1,
    failed: 1,
    error: 'sms_failed',
  });
  assertEquals(status.get('+15555550101'), 'failed');
});

Deno.test('a provider that throws is recorded as failed, not swallowed', async () => {
  const { store, status } = memoryStore(['+15555550101']);

  const res = await endAlert(store, recordingSms(() => 'throw').sms, USER, input());

  assertEquals(res.status, 502);
  assertEquals(status.get('+15555550101'), 'failed');
});

Deno.test('a retry resends only the failed contact', async () => {
  const { store } = memoryStore(['+15555550101', '+15555550102']);
  await endAlert(store, recordingSms((to) => (to === '+15555550102' ? 'error' : null)).sms, USER, input());

  const retry = recordingSms();
  const res = await endAlert(store, retry.sms, USER, input());

  assertEquals(retry.sent.map((s) => s.to), ['+15555550102']);
  assertEquals(res.status, 200);
});

Deno.test('an alert whose SOS reached nobody still ends, with nobody to text', async () => {
  const { store } = memoryStore([]);
  const { sms, sent } = recordingSms();

  const res = await endAlert(store, sms, USER, input());

  assertEquals(res.status, 200);
  assertEquals(res.body.total, 0);
  assertEquals(sent, []);
});

Deno.test('another user\'s alert is forbidden and nobody is texted', async () => {
  const { store } = memoryStore(['+15555550101']);
  store.end = () => Promise.reject(new AlertOwnershipError());
  const { sms, sent } = recordingSms();

  const res = await endAlert(store, sms, USER, input());

  assertEquals(res.status, 403);
  assertEquals(sent, []);
});

Deno.test('an unknown alert is a loud 404 and nobody is texted', async () => {
  const { store } = memoryStore(['+15555550101']);
  store.end = () => Promise.reject(new AlertNotFoundError());
  const { sms, sent } = recordingSms();

  const res = await endAlert(store, sms, USER, input());

  assertEquals(res.status, 404);
  assertEquals(res.body.error, 'unknown_alert');
  assertEquals(sent, []);
});

Deno.test('a store failure propagates instead of reporting the alert ended', async () => {
  const { store } = memoryStore(['+15555550101']);
  store.end = () => Promise.reject(new Error('db down'));
  await assertRejects(() => endAlert(store, recordingSms().sms, USER, input()), Error, 'db down');
});
