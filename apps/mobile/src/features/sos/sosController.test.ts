import { BUTTON_CANCEL_WINDOW_MS, LIVE_LOCATION_MS } from './alertMachine';
import { RETRY_MS, createSosController, type SendResult, type SosDeps, type UnlockResult } from './sosController';

const S = 1000;

/** A manual clock and timer queue, so tests never sleep. */
function harness(overrides: Partial<SosDeps> = {}) {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const sends: { id: string; trigger: string; triggeredAt: number; at: number }[] = [];
  let sendResults: (SendResult | Error)[] = [];
  let unlockResult: UnlockResult | Promise<UnlockResult> = 'unlocked';
  let ids = 0;

  const deps: SosDeps = {
    now: () => now,
    setTimer: (fn, ms) => {
      const handle = nextHandle++;
      timers.set(handle, { at: now + ms, fn });
      return handle;
    },
    clearTimer: (handle) => {
      timers.delete(handle as number);
    },
    newId: () => `alert-${++ids}`,
    send: (alert) => {
      sends.push({ ...alert, at: now });
      const result = sendResults.shift() ?? 'delivered';
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
    unlock: () => Promise.resolve(unlockResult),
    ...overrides,
  };
  const controller = createSosController(deps);

  /** Lets resolved promises (send, unlock) run their continuations. */
  const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  /** Moves the clock forward, firing due timers in order. */
  async function advance(ms: number): Promise<void> {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].fn();
      await flush();
    }
    now = end;
    await flush();
  }

  return {
    controller,
    advance,
    flush,
    sends,
    timers,
    setNow: (t: number) => {
      now = t;
    },
    sendWill: (...results: (SendResult | Error)[]) => {
      sendResults = results;
    },
    unlockWill: (result: UnlockResult | Promise<UnlockResult>) => {
      unlockResult = result;
    },
    kind: () => controller.getSnapshot().state.kind,
  };
}

describe('hold and countdown', () => {
  it('a hold starts the 5 s window and sends once when it runs out', async () => {
    const h = harness();
    h.controller.hold('inApp');
    expect(h.kind()).toBe('cancelWindow');

    await h.advance(BUTTON_CANCEL_WINDOW_MS - 1);
    expect(h.sends).toHaveLength(0);

    await h.advance(1);
    expect(h.sends).toEqual([{ id: 'alert-1', trigger: 'inApp', triggeredAt: 5 * S, at: 5 * S }]);
    expect(h.controller.getSnapshot().state).toMatchObject({ kind: 'active', delivery: 'delivered' });
  });

  it('notifies subscribers on every change', async () => {
    const h = harness();
    const seen: string[] = [];
    const unsubscribe = h.controller.subscribe(() => seen.push(h.kind()));
    h.controller.hold('inApp');
    await h.advance(5 * S);
    unsubscribe();
    expect(seen).toEqual(expect.arrayContaining(['cancelWindow', 'active']));
  });

  it('catches up on resume when the timer never fired (app was suspended)', async () => {
    const h = harness();
    h.controller.hold('inApp');
    h.timers.clear();
    h.setNow(60 * S);

    h.controller.resume();
    await h.flush();

    expect(h.sends).toHaveLength(1);
    expect(h.kind()).toBe('active');
  });
});

describe('cancel needs a device unlock', () => {
  it('unlock in time cancels and nothing is sent', async () => {
    const h = harness();
    h.controller.hold('inApp');
    await h.advance(2 * S);

    expect(await h.controller.cancel()).toBe(true);
    await h.advance(60 * S);

    expect(h.kind()).toBe('idle');
    expect(h.sends).toHaveLength(0);
  });

  it('a failed unlock does not cancel: the alert still sends', async () => {
    const h = harness();
    h.unlockWill('failed');
    h.controller.hold('inApp');

    expect(await h.controller.cancel()).toBe(false);
    await h.advance(5 * S);

    expect(h.sends).toHaveLength(1);
  });

  it('an unlock that finishes after the window does not cancel or end the alert', async () => {
    const h = harness();
    let finishUnlock: (r: UnlockResult) => void = () => {};
    h.unlockWill(new Promise<UnlockResult>((resolve) => (finishUnlock = resolve)));
    h.controller.hold('inApp');

    const cancelling = h.controller.cancel();
    await h.advance(6 * S);
    finishUnlock('unlocked');

    expect(await cancelling).toBe(false);
    expect(h.sends).toHaveLength(1);
    expect(h.kind()).toBe('active');
  });

  it('with no screen lock set, cancel works without an unlock', async () => {
    const h = harness();
    h.unlockWill('noLock');
    h.controller.hold('inApp');

    expect(await h.controller.cancel()).toBe(true);
    expect(h.kind()).toBe('idle');
  });

  it('an unlock prompt that throws does not cancel', async () => {
    const h = harness({ unlock: () => Promise.reject(new Error('prompt crashed')) });
    h.controller.hold('inApp');

    expect(await h.controller.cancel()).toBe(false);
    await h.advance(5 * S);

    expect(h.sends).toHaveLength(1);
  });
});

describe('sending', () => {
  it('a failed send is shown and retried with the same id until it delivers', async () => {
    const h = harness();
    h.sendWill('failed', 'failed', 'delivered');
    h.controller.hold('inApp');
    await h.advance(5 * S);
    expect(h.controller.getSnapshot().state).toMatchObject({ kind: 'active', delivery: 'failed' });

    await h.advance(RETRY_MS);
    expect(h.controller.getSnapshot().state).toMatchObject({ delivery: 'failed' });
    await h.advance(RETRY_MS);

    expect(h.sends.map((s) => s.id)).toEqual(['alert-1', 'alert-1', 'alert-1']);
    expect(h.sends.map((s) => s.triggeredAt)).toEqual([5 * S, 5 * S, 5 * S]);
    expect(h.controller.getSnapshot().state).toMatchObject({ delivery: 'delivered' });

    await h.advance(10 * RETRY_MS);
    expect(h.sends).toHaveLength(3);
  });

  it('a send that throws counts as failed and is retried, never swallowed', async () => {
    const h = harness();
    h.sendWill(new Error('network down'));
    h.controller.hold('inApp');
    await h.advance(5 * S);

    expect(h.controller.getSnapshot().state).toMatchObject({ kind: 'active', delivery: 'failed' });
    await h.advance(RETRY_MS);
    expect(h.sends).toHaveLength(2);
  });

  it('no contacts is failed, flagged, and not retried', async () => {
    const h = harness();
    h.sendWill('noContacts');
    h.controller.hold('inApp');
    await h.advance(5 * S);

    expect(h.controller.getSnapshot()).toMatchObject({ noContacts: true, state: { delivery: 'failed' } });
    await h.advance(10 * RETRY_MS);
    expect(h.sends).toHaveLength(1);
  });

  it('a new alert gets a new id and clears the no-contacts flag', async () => {
    const h = harness();
    h.sendWill('noContacts');
    h.controller.hold('inApp');
    await h.advance(5 * S);
    await h.controller.imSafe();

    h.controller.hold('inApp');
    await h.advance(5 * S);

    expect(h.sends.map((s) => s.id)).toEqual(['alert-1', 'alert-2']);
    expect(h.controller.getSnapshot().noContacts).toBe(false);
  });
});

describe('ending an alert', () => {
  it('"I\'m safe" with an unlock ends it and stops retries', async () => {
    const h = harness();
    h.sendWill('failed', 'failed', 'failed');
    h.controller.hold('inApp');
    await h.advance(5 * S);

    expect(await h.controller.imSafe()).toBe(true);
    expect(h.kind()).toBe('idle');

    await h.advance(10 * RETRY_MS);
    expect(h.sends).toHaveLength(1);
  });

  it('"I\'m safe" with a failed unlock leaves the alert active', async () => {
    const h = harness();
    h.controller.hold('inApp');
    await h.advance(5 * S);
    h.unlockWill('failed');

    expect(await h.controller.imSafe()).toBe(false);
    expect(h.kind()).toBe('active');
  });

  it('ends by itself after 60 min and stops retrying', async () => {
    const h = harness();
    h.sendWill(...Array<SendResult>(2000).fill('failed'));
    h.controller.hold('inApp');
    await h.advance(5 * S);

    await h.advance(LIVE_LOCATION_MS);
    expect(h.kind()).toBe('idle');

    const sentSoFar = h.sends.length;
    await h.advance(10 * RETRY_MS);
    expect(h.sends).toHaveLength(sentSoFar);
  });

  it('a slow send that fails after the alert ended is not retried', async () => {
    const finish: ((r: SendResult) => void)[] = [];
    const h = harness({ send: () => new Promise<SendResult>((resolve) => finish.push(resolve)) });
    h.controller.hold('inApp');
    await h.advance(5 * S);
    await h.controller.imSafe();

    finish[0]?.('failed');
    await h.flush();
    await h.advance(10 * RETRY_MS);

    expect(h.kind()).toBe('idle');
    expect(finish).toHaveLength(1);
  });

  it("an old alert's late result never marks a newer alert as delivered", async () => {
    const finish: ((r: SendResult) => void)[] = [];
    const h = harness({ send: () => new Promise<SendResult>((resolve) => finish.push(resolve)) });
    h.controller.hold('inApp');
    await h.advance(5 * S);
    await h.controller.imSafe();
    h.controller.hold('inApp');
    await h.advance(5 * S);

    finish[0]?.('delivered');
    await h.flush();

    expect(h.controller.getSnapshot().state).toMatchObject({ kind: 'active', delivery: 'pending' });
  });
});
