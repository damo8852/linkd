import { assert, assertEquals } from '@std/assert';

import { type DeliveryStore, handleStatusCallback, validTwilioSignature } from './smsStatus.ts';

const CONFIG = { authToken: 'test-token', url: 'https://example.test/functions/v1/sms-status' };

/** Signs the way Twilio does. Trusted because the documented-example test below pins the algorithm. */
async function sign(authToken: string, url: string, body: string): Promise<string> {
  const pairs = [...new URLSearchParams(body)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const data = url + pairs.map(([k, v]) => k + v).join('');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)));
  return btoa(String.fromCharCode(...mac));
}

function memoryStore(known: string[] = ['SM0123']) {
  const recorded: { id: string; status: string; errorCode: string | null }[] = [];
  const store: DeliveryStore = {
    record(id, status, errorCode) {
      if (!known.includes(id)) return Promise.resolve(false);
      recorded.push({ id, status, errorCode });
      return Promise.resolve(true);
    },
  };
  return { store, recorded };
}

const form = (fields: Record<string, string>): string => new URLSearchParams(fields).toString();

async function call(store: DeliveryStore, fields: Record<string, string>) {
  const body = form(fields);
  return handleStatusCallback(store, CONFIG, await sign(CONFIG.authToken, CONFIG.url, body), body);
}

// ---------- signature ----------

// Worked example from https://www.twilio.com/docs/usage/security (validating requests).
Deno.test('signature matches Twilio\'s documented example', async () => {
  const params = new URLSearchParams({
    Digits: '1234',
    To: '+18005551212',
    From: '+14158675310',
    Caller: '+14158675310',
    CallSid: 'CA1234567890ABCDE',
  });
  const url = 'https://example.com/myapp.php?foo=1&bar=2';
  assert(await validTwilioSignature('12345', url, params, 'L/OH5YylLD5NRKLltdqwSvS0BnU='));
});

Deno.test('signature is rejected when anything differs', async () => {
  const params = new URLSearchParams({ MessageSid: 'SM0123', MessageStatus: 'delivered' });
  const good = await sign(CONFIG.authToken, CONFIG.url, params.toString());

  assert(await validTwilioSignature(CONFIG.authToken, CONFIG.url, params, good));
  assert(!(await validTwilioSignature('other-token', CONFIG.url, params, good)), 'wrong auth token');
  assert(!(await validTwilioSignature(CONFIG.authToken, `${CONFIG.url}?x=1`, params, good)), 'wrong url');
  const tampered = new URLSearchParams({ MessageSid: 'SM0123', MessageStatus: 'undelivered' });
  assert(!(await validTwilioSignature(CONFIG.authToken, CONFIG.url, tampered, good)), 'tampered body');
  assert(!(await validTwilioSignature(CONFIG.authToken, CONFIG.url, params, null)), 'missing header');
  assert(!(await validTwilioSignature(CONFIG.authToken, CONFIG.url, params, '')), 'empty header');
  assert(!(await validTwilioSignature(CONFIG.authToken, CONFIG.url, params, 'not base64!')), 'garbage header');
});

// ---------- handler ----------

Deno.test('an unsigned or forged callback is refused and records nothing', async () => {
  const { store, recorded } = memoryStore();
  const body = form({ MessageSid: 'SM0123', MessageStatus: 'delivered' });

  assertEquals((await handleStatusCallback(store, CONFIG, null, body)).status, 403);
  const forged = await sign('attacker-token', CONFIG.url, body);
  assertEquals((await handleStatusCallback(store, CONFIG, forged, body)).status, 403);
  assertEquals(recorded, []);
});

Deno.test('delivered, undelivered, and failed are recorded by provider message id', async () => {
  const { store, recorded } = memoryStore(['SM1', 'SM2', 'SM3']);

  assertEquals((await call(store, { MessageSid: 'SM1', MessageStatus: 'delivered' })).status, 200);
  assertEquals(
    (await call(store, { MessageSid: 'SM2', MessageStatus: 'undelivered', ErrorCode: '30003' })).status,
    200,
  );
  assertEquals((await call(store, { MessageSid: 'SM3', MessageStatus: 'failed', ErrorCode: '30008' })).status, 200);

  assertEquals(recorded, [
    { id: 'SM1', status: 'delivered', errorCode: null },
    { id: 'SM2', status: 'undelivered', errorCode: '30003' },
    { id: 'SM3', status: 'failed', errorCode: '30008' },
  ]);
});

Deno.test('extra parameters Twilio adds do not break a signed callback', async () => {
  const { store, recorded } = memoryStore();
  const res = await call(store, {
    SmsSid: 'SM0123',
    SmsStatus: 'delivered',
    MessageStatus: 'delivered',
    To: '+15555550101',
    MessageSid: 'SM0123',
    AccountSid: 'AC1',
    From: '+15555550100',
    ApiVersion: '2010-04-01',
    RawDlrDoneDate: '2610051640',
    SomethingNew: 'x',
  });
  assertEquals(res.status, 200);
  assertEquals(recorded.length, 1);
});

Deno.test('in-flight and unknown statuses are acknowledged but never recorded', async () => {
  const { store, recorded } = memoryStore();
  for (const status of ['queued', 'sending', 'sent', 'read', 'some-future-status']) {
    assertEquals((await call(store, { MessageSid: 'SM0123', MessageStatus: status })).status, 200, status);
  }
  assertEquals(recorded, []);
});

Deno.test('a signed callback without a message id or status is a bad request', async () => {
  const { store, recorded } = memoryStore();
  assertEquals((await call(store, { MessageStatus: 'delivered' })).status, 400);
  assertEquals((await call(store, { MessageSid: 'SM0123' })).status, 400);
  assertEquals(recorded, []);
});

Deno.test('a final status for a message we never sent is reported, not swallowed', async () => {
  const { store } = memoryStore([]);
  assertEquals((await call(store, { MessageSid: 'SM-unknown', MessageStatus: 'undelivered' })).status, 404);
});

Deno.test('a store failure propagates instead of acknowledging the callback', async () => {
  const store: DeliveryStore = { record: () => Promise.reject(new Error('db down')) };
  let threw = false;
  try {
    await call(store, { MessageSid: 'SM0123', MessageStatus: 'undelivered' });
  } catch (e) {
    threw = e instanceof Error && e.message === 'db down';
  }
  assert(threw);
});
