import { assertEquals, assertRejects } from '@std/assert';

import { type Captcha, joinWaitlist, verifyTurnstile, type WaitlistStore } from './joinWaitlist.ts';

function memoryStore() {
  const emails: string[] = [];
  const store: WaitlistStore = {
    add(email) {
      if (emails.some((e) => e.toLowerCase() === email.toLowerCase())) return Promise.resolve('duplicate');
      emails.push(email);
      return Promise.resolve('added');
    },
  };
  return { store, emails };
}

const passing: Captcha = { verify: () => Promise.resolve(true) };
const failing: Captcha = { verify: () => Promise.resolve(false) };

Deno.test('a valid email with a passing captcha joins the list', async () => {
  const { store, emails } = memoryStore();
  const res = await joinWaitlist(store, passing, { email: '  early@example.test ', token: 't' }, '203.0.113.9');
  assertEquals(res, { status: 200, body: { joined: true } });
  assertEquals(emails, ['early@example.test']);
});

Deno.test('a repeat signup answers exactly like a new one', async () => {
  const { store, emails } = memoryStore();
  await joinWaitlist(store, passing, { email: 'early@example.test', token: 't' }, null);
  const res = await joinWaitlist(store, passing, { email: 'EARLY@example.test', token: 't' }, null);
  assertEquals(res, { status: 200, body: { joined: true } });
  assertEquals(emails.length, 1);
});

Deno.test('a failed captcha stores nothing', async () => {
  const { store, emails } = memoryStore();
  const res = await joinWaitlist(store, failing, { email: 'bot@example.test', token: 't' }, null);
  assertEquals(res, { status: 403, body: { error: 'captcha_failed' } });
  assertEquals(emails, []);
});

Deno.test('a missing captcha token is refused without calling the verifier', async () => {
  const { store, emails } = memoryStore();
  let called = false;
  const spy: Captcha = { verify: () => ((called = true), Promise.resolve(true)) };
  const res = await joinWaitlist(store, spy, { email: 'early@example.test' }, null);
  assertEquals(res, { status: 403, body: { error: 'captcha_failed' } });
  assertEquals(called, false);
  assertEquals(emails, []);
});

Deno.test('malformed or over-long emails are rejected before the captcha', async () => {
  const { store } = memoryStore();
  for (const email of ['not-an-email', 'a@b', '', 42, `${'a'.repeat(250)}@x.io`]) {
    const res = await joinWaitlist(store, passing, { email, token: 't' }, null);
    assertEquals(res, { status: 400, body: { error: 'invalid_email' } }, String(email));
  }
  assertEquals((await joinWaitlist(store, passing, null, null)).status, 400);
});

Deno.test('a store failure is thrown, not reported as joined', async () => {
  const broken: WaitlistStore = { add: () => Promise.reject(new Error('db down')) };
  await assertRejects(() => joinWaitlist(broken, passing, { email: 'early@example.test', token: 't' }, null));
});

Deno.test('verifyTurnstile posts the secret, token, and client IP to siteverify', async () => {
  let sent: { url: string; body: URLSearchParams } | undefined;
  const fakeFetch = (url: string | URL | Request, init?: RequestInit) => {
    sent = { url: String(url), body: new URLSearchParams(String(init?.body)) };
    return Promise.resolve(Response.json({ success: true }));
  };
  const captcha = verifyTurnstile('secret-1', fakeFetch);
  assertEquals(await captcha.verify('tok', '203.0.113.9'), true);
  assertEquals(sent?.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assertEquals(sent?.body.get('secret'), 'secret-1');
  assertEquals(sent?.body.get('response'), 'tok');
  assertEquals(sent?.body.get('remoteip'), '203.0.113.9');
});

Deno.test('verifyTurnstile is false when Cloudflare says so', async () => {
  const captcha = verifyTurnstile('s', () => Promise.resolve(Response.json({ success: false })));
  assertEquals(await captcha.verify('tok', null), false);
});

Deno.test('verifyTurnstile throws when siteverify is unreachable', async () => {
  const captcha = verifyTurnstile('s', () => Promise.resolve(new Response('oops', { status: 502 })));
  await assertRejects(() => captcha.verify('tok', null));
});
