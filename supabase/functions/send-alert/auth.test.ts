import { assertEquals, assertRejects } from '@std/assert';

import { type Identity, resolveUser } from './auth.ts';
import { type AlertInput, AlertOwnershipError, type AlertStore, sendAlert } from './sendAlert.ts';
import type { SmsProvider } from './sms.ts';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);
const REVOKED = 'c'.repeat(64);

/** JWTs and alert tokens the fake server knows; anything else resolves to nobody. */
function fakeIdentity(overrides: Partial<Identity> = {}) {
  const asked: string[] = [];
  const identity: Identity = {
    userFromJwt: (jwt) => {
      asked.push(`jwt:${jwt}`);
      return Promise.resolve(jwt === 'jwt-a' ? USER_A : jwt === 'jwt-b' ? USER_B : null);
    },
    userFromAlertToken: (token) => {
      asked.push(`token:${token}`);
      return Promise.resolve(token === TOKEN_A ? USER_A : token === TOKEN_B ? USER_B : null);
    },
    ...overrides,
  };
  return { identity, asked };
}

const headers = (h: Record<string, string>): Headers => new Headers(h);

const alert: AlertInput = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  trigger: 'button',
  triggeredAt: '2026-10-01T12:00:00.000Z',
  location: null,
};

/** One alert owned by whoever starts it first, with one contact, claimed once until recorded. */
function oneContactStore() {
  let owner: string | null = null;
  let status = 'pending';
  const store: AlertStore = {
    start: (userId) => {
      owner ??= userId;
      if (owner !== userId) return Promise.reject(new AlertOwnershipError());
      return Promise.resolve({ displayName: 'Test User', phone: '+15555550199', recipientCount: 1 });
    },
    claim: () => {
      if (status !== 'pending' && status !== 'failed') return Promise.resolve([]);
      status = 'sending';
      return Promise.resolve(['+15555550101']);
    },
    record: (_id, _phone, outcome) => {
      status = outcome.ok ? 'sent' : 'failed';
      return Promise.resolve();
    },
  };
  return { store, owner: () => owner };
}

function countingSms() {
  const sent: string[] = [];
  const sms: SmsProvider = {
    send: (to) => {
      sent.push(to);
      return Promise.resolve({ ok: true, id: `SM-${to}` });
    },
  };
  return { sms, sent };
}

// ---------- who is sending ----------

Deno.test('a valid session JWT resolves to its user', async () => {
  const { identity } = fakeIdentity();
  assertEquals(await resolveUser(headers({ Authorization: 'Bearer jwt-a' }), identity), USER_A);
});

Deno.test('a valid alert token resolves to its user with no session at all', async () => {
  const { identity } = fakeIdentity();
  assertEquals(await resolveUser(headers({ 'X-Alert-Token': TOKEN_A }), identity), USER_A);
});

Deno.test('an alert token still works when the JWT is not a user session (signed out, expired)', async () => {
  const { identity } = fakeIdentity();
  const h = headers({ Authorization: 'Bearer anon-key', 'X-Alert-Token': TOKEN_A });
  assertEquals(await resolveUser(h, identity), USER_A);
});

Deno.test('an alert token still works when checking the JWT fails outright', async () => {
  const { identity } = fakeIdentity({ userFromJwt: () => Promise.reject(new Error('auth service down')) });
  const h = headers({ Authorization: 'Bearer jwt-a', 'X-Alert-Token': TOKEN_A });
  assertEquals(await resolveUser(h, identity), USER_A);
});

Deno.test('a valid session wins over an alert token left from another account', async () => {
  const { identity } = fakeIdentity();
  const h = headers({ Authorization: 'Bearer jwt-b', 'X-Alert-Token': TOKEN_A });
  assertEquals(await resolveUser(h, identity), USER_B);
});

Deno.test('a revoked or unknown alert token is rejected', async () => {
  const { identity } = fakeIdentity();
  assertEquals(await resolveUser(headers({ 'X-Alert-Token': REVOKED }), identity), null);
  assertEquals(await resolveUser(headers({ Authorization: 'Bearer anon-key', 'X-Alert-Token': REVOKED }), identity), null);
});

Deno.test('no credentials is rejected without asking the server about empty values', async () => {
  const { identity, asked } = fakeIdentity();
  assertEquals(await resolveUser(headers({}), identity), null);
  assertEquals(await resolveUser(headers({ Authorization: 'Bearer ', 'X-Alert-Token': '' }), identity), null);
  assertEquals(asked, []);
});

Deno.test('a failed alert token lookup rejects instead of reading as "not allowed"', async () => {
  const { identity } = fakeIdentity({ userFromAlertToken: () => Promise.reject(new Error('db down')) });
  await assertRejects(() => resolveUser(headers({ 'X-Alert-Token': TOKEN_A }), identity), Error, 'db down');
});

// ---------- what a token can do ----------

Deno.test('a signed-out phone sends an SOS with its alert token, as its own user', async () => {
  const { identity } = fakeIdentity();
  const { store, owner } = oneContactStore();
  const { sms, sent } = countingSms();

  const userId = await resolveUser(headers({ 'X-Alert-Token': TOKEN_A }), identity);
  const result = await sendAlert(store, sms, userId ?? '', alert);

  assertEquals(result.status, 200);
  assertEquals(owner(), USER_A);
  assertEquals(sent, ['+15555550101']);
});

Deno.test('a retry with the alert token never texts a contact twice', async () => {
  const { identity } = fakeIdentity();
  const { store } = oneContactStore();
  const { sms, sent } = countingSms();

  for (let i = 0; i < 3; i++) {
    const userId = await resolveUser(headers({ 'X-Alert-Token': TOKEN_A }), identity);
    assertEquals((await sendAlert(store, sms, userId ?? '', alert)).status, 200);
  }
  assertEquals(sent.length, 1);
});

Deno.test("an alert token cannot touch another user's alert", async () => {
  const { identity } = fakeIdentity();
  const { store } = oneContactStore();
  const { sms, sent } = countingSms();
  await sendAlert(store, sms, USER_A, alert);

  const userId = await resolveUser(headers({ 'X-Alert-Token': TOKEN_B }), identity);
  const result = await sendAlert(store, sms, userId ?? '', alert);

  assertEquals(result.status, 403);
  assertEquals(sent.length, 1);
});
