import { assert, assertEquals, assertMatch, assertRejects, assertStringIncludes, assertThrows } from '@std/assert';

import {
  type AlertInput,
  AlertOwnershipError,
  type AlertStore,
  buildMessage,
  parseAlertInput,
  sendAlert,
} from './sendAlert.ts';
import { fakeSms, type SmsProvider, smsProviderFromEnv, twilioSms } from './sms.ts';

const USER = '11111111-1111-1111-1111-111111111111';
const ALERT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

const validBody = {
  id: ALERT_ID,
  trigger: 'linkLoss',
  triggeredAt: '2026-10-01T12:00:00.000Z',
  location: { latitude: 40.0150123, longitude: -105.2705456, accuracyM: 12, at: '2026-10-01T11:59:58.000Z' },
};

function input(): AlertInput {
  const parsed = parseAlertInput(validBody);
  if ('error' in parsed) throw new Error(parsed.error);
  return parsed;
}

/** In-memory store with the same claim semantics as the SQL functions (claimed once until recorded). */
function memoryStore(phones: string[], profile = { displayName: 'Test User', phone: '+15555550199' }) {
  const status = new Map(phones.map((p) => [p, 'pending']));
  const recorded: { phone: string; outcome: string; detail: string | null }[] = [];
  const store: AlertStore = {
    start: () => Promise.resolve({ ...profile, recipientCount: phones.length }),
    claim: () => {
      const claimable = phones.filter((p) => status.get(p) === 'pending' || status.get(p) === 'failed');
      claimable.forEach((p) => status.set(p, 'sending'));
      return Promise.resolve(claimable);
    },
    record: (_alertId, phone, outcome) => {
      status.set(phone, outcome.ok ? 'sent' : 'failed');
      recorded.push({ phone, outcome: outcome.ok ? 'sent' : 'failed', detail: outcome.ok ? outcome.id : outcome.error });
      return Promise.resolve();
    },
  };
  return { store, status, recorded };
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

Deno.test('parseAlertInput accepts a valid body', () => {
  assertEquals(input().id, ALERT_ID);
  assertEquals(input().location?.accuracyM, 12);
});

Deno.test('parseAlertInput accepts a missing location', () => {
  const parsed = parseAlertInput({ ...validBody, location: null });
  assert(!('error' in parsed));
  assertEquals(parsed.location, null);
});

Deno.test('parseAlertInput rejects bad input', () => {
  const bad: unknown[] = [
    null,
    'x',
    { ...validBody, id: 'not-a-uuid' },
    { ...validBody, trigger: 'shake' },
    { ...validBody, triggeredAt: 'yesterday' },
    { ...validBody, location: { latitude: 91, longitude: 0 } },
    { ...validBody, location: { latitude: 0, longitude: 181 } },
    { ...validBody, location: { latitude: 0 } },
    { ...validBody, location: { latitude: 0, longitude: 0, accuracyM: -1 } },
  ];
  for (const body of bad) assert('error' in parseAlertInput(body), JSON.stringify(body));
});

// ---------- message content ----------

Deno.test('message has the name, a map link for the fix, and the callback number', () => {
  const msg = buildMessage({ displayName: 'Test User', phone: '+15555550199' }, input().location);
  assertStringIncludes(msg, 'Test User');
  assertStringIncludes(msg, 'https://maps.google.com/?q=40.01501,-105.27055');
  assertStringIncludes(msg, '12 m');
  assertStringIncludes(msg, '+15555550199');
});

Deno.test('message says when location is unavailable', () => {
  const msg = buildMessage({ displayName: 'Test User', phone: '+15555550199' }, null);
  assertStringIncludes(msg, 'Location unavailable');
  assert(!msg.includes('maps.google.com'));
});

Deno.test('message still goes out without a profile', () => {
  const msg = buildMessage({ displayName: null, phone: null }, input().location);
  assertMatch(msg, /LINKD SOS/);
  assertStringIncludes(msg, 'maps.google.com');
  assert(!msg.includes('null'));
});

// ---------- sending ----------

Deno.test('texts every claimed recipient and records each result', async () => {
  const { store, recorded } = memoryStore(['+15555550101', '+15555550102']);
  const { sms, sent } = recordingSms();

  const res = await sendAlert(store, sms, USER, input());

  assertEquals(res.status, 200);
  assertEquals(res.body, { alertId: ALERT_ID, total: 2, sent: 2, failed: 0 });
  assertEquals(sent.map((s) => s.to), ['+15555550101', '+15555550102']);
  assertStringIncludes(sent[0]!.body, 'Test User');
  assertEquals(recorded, [
    { phone: '+15555550101', outcome: 'sent', detail: 'SM-+15555550101' },
    { phone: '+15555550102', outcome: 'sent', detail: 'SM-+15555550102' },
  ]);
});

Deno.test('a retry never texts an already-sent contact', async () => {
  const { store } = memoryStore(['+15555550101', '+15555550102']);
  const first = recordingSms();
  await sendAlert(store, first.sms, USER, input());

  const retry = recordingSms();
  const res = await sendAlert(store, retry.sms, USER, input());

  assertEquals(retry.sent, []);
  assertEquals(res.status, 200);
  assertEquals(res.body, { alertId: ALERT_ID, total: 2, sent: 0, failed: 0 });
});

Deno.test('a provider error is recorded and returned, and the others still send', async () => {
  const { store, recorded } = memoryStore(['+15555550101', '+15555550102']);
  const { sms, sent } = recordingSms((to) => (to === '+15555550101' ? 'error' : null));

  const res = await sendAlert(store, sms, USER, input());

  assertEquals(sent.length, 2);
  assertEquals(res.status, 502);
  assertEquals(res.body, { alertId: ALERT_ID, total: 2, sent: 1, failed: 1, error: 'sms_failed' });
  assertEquals(recorded[0], { phone: '+15555550101', outcome: 'failed', detail: 'carrier error' });
});

Deno.test('a provider that throws is recorded as failed, not swallowed', async () => {
  const { store, status } = memoryStore(['+15555550101']);
  const { sms } = recordingSms(() => 'throw');

  const res = await sendAlert(store, sms, USER, input());

  assertEquals(res.status, 502);
  assertEquals(status.get('+15555550101'), 'failed');
});

Deno.test('a retry resends only the failed contact', async () => {
  const { store } = memoryStore(['+15555550101', '+15555550102']);
  await sendAlert(store, recordingSms((to) => (to === '+15555550102' ? 'error' : null)).sms, USER, input());

  const retry = recordingSms();
  const res = await sendAlert(store, retry.sms, USER, input());

  assertEquals(retry.sent.map((s) => s.to), ['+15555550102']);
  assertEquals(res.status, 200);
});

Deno.test('no active contacts is a loud error', async () => {
  const { store } = memoryStore([]);
  const res = await sendAlert(store, recordingSms().sms, USER, input());
  assertEquals(res.status, 422);
  assertEquals(res.body.error, 'no_active_contacts');
});

Deno.test('an alert id owned by another user is forbidden', async () => {
  const { store } = memoryStore(['+15555550101']);
  store.start = () => Promise.reject(new AlertOwnershipError());
  const { sms, sent } = recordingSms();

  const res = await sendAlert(store, sms, USER, input());

  assertEquals(res.status, 403);
  assertEquals(sent, []);
});

Deno.test('a store failure propagates instead of reporting success', async () => {
  const { store } = memoryStore(['+15555550101']);
  store.start = () => Promise.reject(new Error('db down'));
  await assertRejects(() => sendAlert(store, recordingSms().sms, USER, input()), Error, 'db down');
});

// ---------- provider selection ----------

Deno.test('SMS_PROVIDER must be set: unset never silently skips texting', () => {
  assertThrows(() => smsProviderFromEnv({}), Error, 'SMS_PROVIDER');
  assertThrows(() => smsProviderFromEnv({ SMS_PROVIDER: 'carrier-pigeon' }), Error, 'SMS_PROVIDER');
});

Deno.test('sandbox needs Twilio test credentials; live needs live credentials', () => {
  assertThrows(() => smsProviderFromEnv({ SMS_PROVIDER: 'sandbox' }), Error, 'TWILIO_TEST_ACCOUNT_SID');
  assertThrows(() => smsProviderFromEnv({ SMS_PROVIDER: 'live' }), Error, 'TWILIO_ACCOUNT_SID');
  assert(smsProviderFromEnv({ SMS_PROVIDER: 'fake' }));
  assert(
    smsProviderFromEnv({ SMS_PROVIDER: 'sandbox', TWILIO_TEST_ACCOUNT_SID: 'AC1', TWILIO_TEST_AUTH_TOKEN: 't' }),
  );
  assert(
    smsProviderFromEnv({
      SMS_PROVIDER: 'live',
      TWILIO_ACCOUNT_SID: 'AC1',
      TWILIO_AUTH_TOKEN: 't',
      TWILIO_FROM_NUMBER: '+15555550100',
    }),
  );
});

Deno.test('fake provider succeeds without network', async () => {
  const res = await fakeSms.send('+15555550101', 'hi');
  assert(res.ok);
});

Deno.test('twilio provider posts the documented request and maps success and errors', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let reply = new Response(JSON.stringify({ sid: 'SM0123' }), { status: 201 });
  const fetchStub: typeof fetch = (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return Promise.resolve(reply);
  };
  const sms = twilioSms({ accountSid: 'AC1', authToken: 'secret', from: '+15005550006' }, fetchStub);

  assertEquals(await sms.send('+15555550101', 'Help'), { ok: true, id: 'SM0123' });
  assertEquals(calls[0]!.url, 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json');
  assertEquals(calls[0]!.init.method, 'POST');
  assertEquals((calls[0]!.init.headers as Record<string, string>).Authorization, `Basic ${btoa('AC1:secret')}`);
  assertEquals(
    Object.fromEntries(new URLSearchParams(String(calls[0]!.init.body))),
    { To: '+15555550101', From: '+15005550006', Body: 'Help' },
  );

  reply = new Response(JSON.stringify({ code: 21211, message: 'Invalid To number' }), { status: 400 });
  assertEquals(await sms.send('+15005550001', 'Help'), { ok: false, error: 'twilio 21211: Invalid To number' });
});
