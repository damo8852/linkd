import { assertEquals, assertMatch, assertRejects } from '@std/assert';

import type { SmsProvider, SmsResult } from '../send-alert/sms.ts';
import { type CodeStore, sendPhoneCode, type StartResult } from './verifyPhone.ts';

const USER = '11111111-1111-1111-1111-111111111111';

function recordingSms(result: SmsResult = { ok: true, id: 'SM1' }) {
  const sent: { to: string; body: string }[] = [];
  const sms: SmsProvider = {
    send(to, body) {
      sent.push({ to, body });
      return Promise.resolve(result);
    },
  };
  return { sms, sent };
}

const store = (result: StartResult): CodeStore & { users: string[] } => {
  const users: string[] = [];
  return {
    users,
    start(userId) {
      users.push(userId);
      return Promise.resolve(result);
    },
  };
};

Deno.test('a started code is texted to the number it was started for', async () => {
  const s = store({ status: 'sent', code: '042137', phone: '+15555550101' });
  const { sms, sent } = recordingSms();
  const res = await sendPhoneCode(s, sms, USER);
  assertEquals(res, { status: 200, body: { sent: true } });
  assertEquals(s.users, [USER]);
  assertEquals(sent.length, 1);
  assertEquals(sent[0].to, '+15555550101');
  assertMatch(sent[0].body, /042137/);
  assertMatch(sent[0].body, /10 minutes/);
});

Deno.test('a provider refusal is reported, not swallowed', async () => {
  const { sms } = recordingSms({ ok: false, error: 'twilio 21211: invalid' });
  const res = await sendPhoneCode(store({ status: 'sent', code: '000000', phone: '+15555550101' }), sms, USER);
  assertEquals(res, { status: 502, body: { error: 'sms_failed' } });
});

Deno.test('a network failure rejects so the handler answers 500', async () => {
  const sms: SmsProvider = { send: () => Promise.reject(new Error('offline')) };
  await assertRejects(() => sendPhoneCode(store({ status: 'sent', code: '000000', phone: '+15555550101' }), sms, USER));
});

for (const [status, code, body] of [
  ['too_soon', 429, { error: 'too_soon' }],
  ['too_many', 429, { error: 'too_many' }],
  ['no_profile', 409, { error: 'no_profile' }],
  ['already_verified', 200, { verified: true }],
] as const) {
  Deno.test(`${status} sends no text`, async () => {
    const { sms, sent } = recordingSms();
    const res = await sendPhoneCode(store({ status }), sms, USER);
    assertEquals(res, { status: code, body });
    assertEquals(sent, []);
  });
}
