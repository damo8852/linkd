import { assertEquals } from '@std/assert';

import { AlertOwnershipError } from '../send-alert/sendAlert.ts';
import { type ArmState, countdown, type CountdownStore, parseCountdownInput } from './countdown.ts';

const USER = '11111111-1111-1111-1111-111111111111';
const ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function fakeStore(result: ArmState | Error = 'armed') {
  const calls: unknown[][] = [];
  const answer = (): Promise<ArmState> => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result));
  const store: CountdownStore = {
    arm: (...args) => {
      calls.push(['arm', ...args]);
      return answer();
    },
    disarm: (...args) => {
      calls.push(['disarm', ...args]);
      return answer();
    },
  };
  return { store, calls };
}

Deno.test('parse: accepts arm and disarm', () => {
  assertEquals(parseCountdownInput({ action: 'arm', id: ID, trigger: 'linkLoss', delayMs: 50000 }), {
    action: 'arm',
    id: ID,
    trigger: 'linkLoss',
    delayMs: 50000,
  });
  assertEquals(parseCountdownInput({ action: 'disarm', id: ID }), { action: 'disarm', id: ID });
});

Deno.test('parse: rejects a bad id, action, trigger, or delay', () => {
  const bad = [
    null,
    { action: 'arm', id: 'nope', trigger: 'button', delayMs: 5000 },
    { action: 'explode', id: ID },
    { action: 'arm', id: ID, trigger: 'shake', delayMs: 5000 },
    { action: 'arm', id: ID, trigger: 'button', delayMs: -1 },
    { action: 'arm', id: ID, trigger: 'button', delayMs: 60001 },
    { action: 'arm', id: ID, trigger: 'button', delayMs: 1.5 },
    { action: 'arm', id: ID, trigger: 'button' },
  ];
  for (const body of bad) assertEquals('error' in parseCountdownInput(body), true, JSON.stringify(body));
});

Deno.test('arm and disarm act for the verified user and return the server state', async () => {
  const { store, calls } = fakeStore('fired');
  assertEquals(await countdown(store, USER, { action: 'arm', id: ID, trigger: 'button', delayMs: 5000 }), {
    status: 200,
    body: { alertId: ID, state: 'fired' },
  });
  assertEquals(await countdown(store, USER, { action: 'disarm', id: ID }), {
    status: 200,
    body: { alertId: ID, state: 'fired' },
  });
  assertEquals(calls, [
    ['arm', USER, ID, 'button', 5000],
    ['disarm', USER, ID],
  ]);
});

Deno.test("another user's id is 403, not a silent success", async () => {
  const { store } = fakeStore(new AlertOwnershipError());
  assertEquals((await countdown(store, USER, { action: 'disarm', id: ID })).status, 403);
});
