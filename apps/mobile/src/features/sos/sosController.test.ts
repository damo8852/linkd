import { BUTTON_CANCEL_WINDOW_MS, GRACE_PERIOD_MS, LIVE_LOCATION_MS } from './alertMachine';
import type { FallbackResult } from './smsFallback';
import {
  RETRY_MS,
  createSosController,
  type DisarmResult,
  type PendingSos,
  type SendResult,
  type SosDeps,
  type UnlockResult,
} from './sosController';

const S = 1000;

/** A manual clock and timer queue, so tests never sleep. */
function harness(overrides: Partial<SosDeps> = {}, { restored = true } = {}) {
  let now = 0;
  let nextHandle = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const sends: { id: string; trigger: string; triggeredAt: number; at: number }[] = [];
  let sendResults: (SendResult | Error)[] = [];
  let unlockResult: UnlockResult | Promise<UnlockResult> = 'unlocked';
  const ends: { id: string; reason: string; at: number }[] = [];
  let endResults: (boolean | Error)[] = [];
  let fallbacks = 0;
  let fallbackResult: FallbackResult | Error = 'opened';
  const arms: { id: string; trigger: string; delayMs: number }[] = [];
  let armResult: Error | null = null;
  const disarms: { id: string; at: number }[] = [];
  let disarmResults: (DisarmResult | Error)[] = [];
  let ids = 0;
  const saves: PendingSos[] = [];

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
    arm: (id, trigger, delayMs) => {
      arms.push({ id, trigger, delayMs });
      return armResult ? Promise.reject(armResult) : Promise.resolve('armed');
    },
    disarm: (id) => {
      disarms.push({ id, at: now });
      const result = disarmResults.shift() ?? 'disarmed';
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
    fallback: () => {
      fallbacks++;
      return fallbackResult instanceof Error ? Promise.reject(fallbackResult) : Promise.resolve(fallbackResult);
    },
    end: (id, reason) => {
      ends.push({ id, reason, at: now });
      const result = endResults.shift() ?? true;
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    },
    save: (record) => {
      saves.push(record);
    },
    ...overrides,
  };
  const controller = createSosController(deps);
  // The app restores the saved record at start; most tests start from nothing saved.
  if (restored) controller.restore({ active: null, countdown: null, ends: [], disarms: [] });

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
    saves,
    lastSave: (): PendingSos | undefined => saves[saves.length - 1],
    flush,
    sends,
    ends,
    timers,
    arms,
    disarms,
    armWill: (result: Error | null) => {
      armResult = result;
    },
    disarmWill: (...results: (DisarmResult | Error)[]) => {
      disarmResults = results;
    },
    fallbacks: () => fallbacks,
    fallbackWill: (result: FallbackResult | Error) => {
      fallbackResult = result;
    },
    endWill: (...results: (boolean | Error)[]) => {
      endResults = results;
    },
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

describe('telling the server the alert ended', () => {
  it('"I\'m safe" ends the alert on the server with reason user', async () => {
    const h = harness();
    h.controller.hold('inApp');
    await h.advance(5 * S);
    await h.controller.imSafe();

    expect(h.ends).toEqual([{ id: 'alert-1', reason: 'user', at: 5 * S }]);
    expect(h.controller.getSnapshot().endFailed).toBe(false);
  });

  it('the 60 min auto-end ends it on the server with reason timeout', async () => {
    const h = harness();
    h.controller.hold('inApp');
    await h.advance(5 * S);
    await h.advance(LIVE_LOCATION_MS);

    expect(h.ends).toEqual([{ id: 'alert-1', reason: 'timeout', at: 5 * S + LIVE_LOCATION_MS }]);
  });

  it('ends on the server even when the send never confirmed', async () => {
    const h = harness();
    h.sendWill('failed');
    h.controller.hold('inApp');
    await h.advance(5 * S);
    await h.controller.imSafe();

    expect(h.ends.map((e) => e.id)).toEqual(['alert-1']);
  });

  it('a failed or thrown end is shown and retried with the same id and reason until it succeeds', async () => {
    const h = harness();
    h.endWill(false, new Error('offline'), true);
    h.controller.hold('inApp');
    await h.advance(5 * S);
    await h.controller.imSafe();
    await h.flush();
    expect(h.controller.getSnapshot().endFailed).toBe(true);

    await h.advance(RETRY_MS);
    expect(h.controller.getSnapshot().endFailed).toBe(true);

    await h.advance(RETRY_MS);
    expect(h.ends).toEqual([
      { id: 'alert-1', reason: 'user', at: 5 * S },
      { id: 'alert-1', reason: 'user', at: 5 * S + RETRY_MS },
      { id: 'alert-1', reason: 'user', at: 5 * S + 2 * RETRY_MS },
    ]);
    expect(h.controller.getSnapshot().endFailed).toBe(false);

    await h.advance(10 * RETRY_MS);
    expect(h.ends).toHaveLength(3);
  });

  it('a new alert never stops the retries that end the previous one', async () => {
    const h = harness();
    h.endWill(false, false, true);
    h.controller.hold('inApp');
    await h.advance(5 * S);
    await h.controller.imSafe();

    h.controller.hold('inApp');
    await h.advance(5 * S);
    await h.advance(2 * RETRY_MS);

    expect(h.ends.map((e) => e.id)).toEqual(['alert-1', 'alert-1', 'alert-1']);
    expect(h.controller.getSnapshot()).toMatchObject({ endFailed: false, state: { kind: 'active' } });
  });
});

describe('arming the server', () => {
  it('a hold arms the server for the 5 s window, and the phone sends on the same id', async () => {
    const h = harness();
    h.controller.hold('inApp');
    expect(h.arms).toEqual([{ id: 'alert-1', trigger: 'inApp', delayMs: BUTTON_CANCEL_WINDOW_MS }]);

    await h.advance(5 * S);
    expect(h.sends.map((s) => s.id)).toEqual(['alert-1']);
  });

  it('a link loss arms for 50 s; a hold during grace re-arms the same id for 5 s', async () => {
    const h = harness();
    h.controller.dispatch({ type: 'linkLost' });
    await h.advance(3 * S);
    h.controller.hold('button');
    await h.advance(5 * S);

    expect(h.arms).toEqual([
      { id: 'alert-1', trigger: 'linkLoss', delayMs: 50 * S },
      { id: 'alert-1', trigger: 'button', delayMs: 5 * S },
    ]);
    expect(h.sends.map((s) => s.id)).toEqual(['alert-1']);
  });

  it('an arm that fails leaves the phone countdown to send by itself', async () => {
    const h = harness();
    h.armWill(new Error('offline'));
    h.controller.hold('inApp');
    await h.advance(5 * S);

    expect(h.sends).toHaveLength(1);
  });

  it('a cancel disarms that id, and the next countdown gets a new one', async () => {
    const h = harness();
    h.controller.hold('inApp');
    await h.controller.cancel();
    h.controller.hold('inApp');

    expect(h.disarms.map((d) => d.id)).toEqual(['alert-1']);
    expect(h.arms.map((a) => a.id)).toEqual(['alert-1', 'alert-2']);
    expect(h.controller.getSnapshot()).toMatchObject({ disarmFailed: false, lateCancel: false });
  });

  it('a cancel that reached the server after it sent warns and ends the alert as safe', async () => {
    const h = harness();
    h.disarmWill('fired');
    h.controller.hold('inApp');
    await h.controller.cancel();
    await h.flush();

    expect(h.kind()).toBe('idle');
    expect(h.controller.getSnapshot().lateCancel).toBe(true);
    expect(h.ends).toEqual([{ id: 'alert-1', reason: 'user', at: 0 }]);
  });

  it('a disarm that cannot reach the server is shown and retried on the same id', async () => {
    const h = harness();
    h.disarmWill(new Error('offline'), new Error('offline'), 'disarmed');
    h.controller.hold('inApp');
    await h.controller.cancel();
    await h.flush();
    expect(h.controller.getSnapshot().disarmFailed).toBe(true);

    await h.advance(2 * RETRY_MS);
    expect(h.disarms).toEqual([
      { id: 'alert-1', at: 0 },
      { id: 'alert-1', at: RETRY_MS },
      { id: 'alert-1', at: 2 * RETRY_MS },
    ]);
    expect(h.controller.getSnapshot()).toMatchObject({ disarmFailed: false, lateCancel: false });
    await h.advance(10 * RETRY_MS);
    expect(h.disarms).toHaveLength(3);
  });

  it('a retried disarm that finds the alert sent still warns and ends it', async () => {
    const h = harness();
    h.disarmWill(new Error('offline'), 'fired');
    h.controller.hold('inApp');
    await h.controller.cancel();
    await h.advance(RETRY_MS);

    expect(h.controller.getSnapshot()).toMatchObject({ disarmFailed: false, lateCancel: true });
    expect(h.ends.map((e) => [e.id, e.reason])).toEqual([['alert-1', 'user']]);
  });

  it('a reconnect disarm that was too late shows the alert as active instead, never as safe', async () => {
    const h = harness();
    h.disarmWill('fired');
    h.controller.dispatch({ type: 'linkLost' });
    await h.advance(1 * S);
    h.controller.dispatch({ type: 'linkUp' });
    await h.advance(5 * S);

    expect(h.disarms.map((d) => d.id)).toEqual(['alert-1']);
    expect(h.controller.getSnapshot().state).toMatchObject({ kind: 'active', trigger: 'linkLoss' });
    expect(h.sends.map((s) => s.id)).toEqual(['alert-1']);
    expect(h.ends).toEqual([]);
  });

  it('a benign link loss during grace disarms', async () => {
    const h = harness();
    h.controller.dispatch({ type: 'linkLost' });
    await h.advance(GRACE_PERIOD_MS / 2);
    h.controller.dispatch({ type: 'bluetoothOff' });

    expect(h.disarms.map((d) => d.id)).toEqual(['alert-1']);
    expect(h.kind()).toBe('unprotected');
  });

  it('a new hold clears the late-cancel warning', async () => {
    const h = harness();
    h.disarmWill('fired');
    h.controller.hold('inApp');
    await h.controller.cancel();
    await h.flush();
    h.controller.hold('inApp');

    expect(h.controller.getSnapshot().lateCancel).toBe(false);
  });
});

describe('SMS composer fallback', () => {
  it('opens once on the first failed send, while the server retries continue on the same id', async () => {
    const h = harness();
    h.sendWill('failed', 'failed', 'delivered');
    h.controller.hold('inApp');
    await h.advance(5 * S);
    expect(h.fallbacks()).toBe(1);
    expect(h.controller.getSnapshot().fallback).toBe('opened');

    await h.advance(2 * RETRY_MS);
    expect(h.fallbacks()).toBe(1);
    expect(h.sends.map((s) => s.id)).toEqual(['alert-1', 'alert-1', 'alert-1']);
    expect(h.controller.getSnapshot().state).toMatchObject({ delivery: 'delivered' });
  });

  it('opens for a thrown send too', async () => {
    const h = harness();
    h.sendWill(new Error('network'));
    h.controller.hold('inApp');
    await h.advance(5 * S);
    expect(h.fallbacks()).toBe(1);
  });

  it('does not open when the send is delivered, or when the server has nobody to text', async () => {
    for (const result of ['delivered', 'noContacts'] as const) {
      const h = harness();
      h.sendWill(result);
      h.controller.hold('inApp');
      await h.advance(5 * S);
      expect(h.fallbacks()).toBe(0);
    }
  });

  it('keeps what happened for the screen, and a fallback that throws counts as unavailable', async () => {
    const h = harness();
    h.fallbackWill(new Error('boom'));
    h.sendWill('failed');
    h.controller.hold('inApp');
    await h.advance(5 * S);
    expect(h.controller.getSnapshot().fallback).toBe('unavailable');
  });

  it('textContacts reopens it for the active alert, and a new alert starts clean', async () => {
    const h = harness();
    h.sendWill('failed');
    h.controller.hold('inApp');
    await h.advance(5 * S);
    await h.controller.textContacts();
    expect(h.fallbacks()).toBe(2);

    await h.controller.imSafe();
    await h.controller.textContacts();
    expect(h.fallbacks()).toBe(2);

    h.controller.hold('inApp');
    expect(h.controller.getSnapshot().fallback).toBeNull();
  });
});

describe('alert id for the screen', () => {
  it('is the sent alert id while it is active, and null once it ends', async () => {
    const h = harness();
    expect(h.controller.getSnapshot().alertId).toBeNull();
    h.controller.hold('inApp');
    expect(h.controller.getSnapshot().alertId).toBeNull();

    await h.advance(5 * S);
    expect(h.controller.getSnapshot().alertId).toBe('alert-1');

    await h.controller.imSafe();
    expect(h.controller.getSnapshot().alertId).toBeNull();
  });
});

describe('surviving the app being killed', () => {
  const none: PendingSos = { active: null, countdown: null, ends: [], disarms: [] };
  const MIN = 60 * S;

  it('saves nothing before the saved record is restored, so a startup change cannot overwrite it', async () => {
    const h = harness({}, { restored: false });
    h.controller.hold('inApp');
    await h.advance(5 * S);
    expect(h.saves).toHaveLength(0);

    h.controller.restore(none);
    expect(h.lastSave()?.active).toMatchObject({ id: 'alert-1' });
  });

  it('saves the active alert as soon as it sends, and drops it once it ends', async () => {
    const h = harness();
    h.controller.hold('inApp');
    await h.advance(5 * S);

    expect(h.lastSave()).toEqual({
      active: { id: 'alert-1', trigger: 'inApp', triggeredAt: 5 * S, endsAt: 5 * S + LIVE_LOCATION_MS },
      countdown: null,
      ends: [],
      disarms: [],
    });

    await h.controller.imSafe();
    await h.flush();
    expect(h.lastSave()).toEqual(none);
  });

  it('saves an end until the server confirms it, including while the first try is in flight', async () => {
    let finishEnd: (ok: boolean) => void = () => {};
    const h = harness({ end: () => new Promise<boolean>((resolve) => (finishEnd = resolve)) });
    h.controller.hold('inApp');
    await h.advance(5 * S);
    await h.controller.imSafe();

    expect(h.lastSave()).toEqual({ active: null, countdown: null, ends: [{ id: 'alert-1', reason: 'user' }], disarms: [] });

    finishEnd(false);
    await h.flush();
    expect(h.lastSave()?.ends).toEqual([{ id: 'alert-1', reason: 'user' }]);

    await h.advance(RETRY_MS);
    finishEnd(true);
    await h.flush();
    expect(h.lastSave()).toEqual(none);
  });

  it('saves a cancelled countdown until its disarm reaches the server', async () => {
    let finishDisarm: (r: DisarmResult) => void = () => {};
    const h = harness({ disarm: () => new Promise<DisarmResult>((resolve) => (finishDisarm = resolve)) });
    h.controller.hold('inApp');
    await h.controller.cancel();

    expect(h.lastSave()).toEqual({
      active: null,
      countdown: null,
      ends: [],
      disarms: [{ id: 'alert-1', trigger: 'inApp', reason: 'cancel' }],
    });

    finishDisarm('disarmed');
    await h.flush();
    expect(h.lastSave()).toEqual(none);
  });

  it('restores an alert still inside its 60 min: same id, same end time, and resends to confirm', async () => {
    const h = harness();
    h.setNow(10 * MIN);
    h.controller.restore({
      active: { id: 'old-1', trigger: 'button', triggeredAt: 0, endsAt: LIVE_LOCATION_MS },
      countdown: null,
      ends: [],
      disarms: [],
    });
    await h.flush();

    expect(h.controller.getSnapshot()).toMatchObject({
      alertId: 'old-1',
      state: { kind: 'active', trigger: 'button', endsAt: LIVE_LOCATION_MS, delivery: 'delivered' },
    });
    expect(h.sends).toEqual([{ id: 'old-1', trigger: 'button', triggeredAt: 0, at: 10 * MIN }]);

    await h.advance(LIVE_LOCATION_MS - 10 * MIN);
    expect(h.kind()).toBe('idle');
    expect(h.ends).toEqual([{ id: 'old-1', reason: 'timeout', at: LIVE_LOCATION_MS }]);
  });

  it('a restored alert can be ended with "I\'m safe"', async () => {
    const h = harness();
    h.controller.restore({
      active: { id: 'old-1', trigger: 'inApp', triggeredAt: 0, endsAt: LIVE_LOCATION_MS },
      countdown: null,
      ends: [],
      disarms: [],
    });
    await h.flush();

    expect(await h.controller.imSafe()).toBe(true);
    expect(h.ends).toEqual([{ id: 'old-1', reason: 'user', at: 0 }]);
  });

  it('an alert whose 60 min passed while the app was dead is ended as timeout, never shown', async () => {
    const h = harness();
    h.endWill(false, true);
    h.setNow(LIVE_LOCATION_MS + 1);
    h.controller.restore({
      active: { id: 'old-1', trigger: 'linkLoss', triggeredAt: 0, endsAt: LIVE_LOCATION_MS },
      countdown: null,
      ends: [],
      disarms: [],
    });
    await h.flush();

    expect(h.kind()).toBe('idle');
    expect(h.sends).toHaveLength(0);
    expect(h.controller.getSnapshot().endFailed).toBe(true);

    await h.advance(RETRY_MS);
    expect(h.ends.map((e) => [e.id, e.reason])).toEqual([
      ['old-1', 'timeout'],
      ['old-1', 'timeout'],
    ]);
    expect(h.controller.getSnapshot().endFailed).toBe(false);
    expect(h.lastSave()).toEqual(none);
  });

  it('restored ends retry with the same id and reason until the server confirms', async () => {
    const h = harness();
    h.endWill(new Error('offline'), false, true);
    h.controller.restore({ active: null, countdown: null, ends: [{ id: 'old-1', reason: 'user' }], disarms: [] });
    await h.flush();
    await h.advance(2 * RETRY_MS);

    expect(h.ends.map((e) => [e.id, e.reason])).toEqual([
      ['old-1', 'user'],
      ['old-1', 'user'],
      ['old-1', 'user'],
    ]);
    expect(h.lastSave()).toEqual(none);
  });

  it('a restored disarm that finds the alert sent ends it as safe, since the user unlocked to cancel', async () => {
    const h = harness();
    h.disarmWill('fired');
    h.controller.restore({ active: null, countdown: null, ends: [], disarms: [{ id: 'old-1', trigger: 'inApp', reason: 'cancel' }] });
    await h.flush();
    await h.flush();

    expect(h.disarms.map((d) => d.id)).toEqual(['old-1']);
    expect(h.controller.getSnapshot().lateCancel).toBe(true);
    expect(h.ends.map((e) => [e.id, e.reason])).toEqual([['old-1', 'user']]);
  });

  it('a restored reconnect disarm that finds the alert sent shows it as active, never as safe', async () => {
    const h = harness();
    h.disarmWill('fired');
    h.controller.restore({ active: null, countdown: null, ends: [], disarms: [{ id: 'old-1', trigger: 'linkLoss', reason: 'reconnect' }] });
    await h.flush();
    await h.flush();

    expect(h.controller.getSnapshot()).toMatchObject({ alertId: 'old-1', state: { kind: 'active' } });
    expect(h.ends).toHaveLength(0);
  });

  it('a new alert after a restore still gets a new id', async () => {
    const h = harness();
    h.controller.restore({ active: null, countdown: null, ends: [{ id: 'old-1', reason: 'user' }], disarms: [] });
    h.controller.hold('inApp');
    await h.advance(5 * S);

    expect(h.sends.map((s) => s.id)).toEqual(['alert-1']);
  });
});

describe('a countdown running when the app is killed', () => {
  const none: PendingSos = { active: null, countdown: null, ends: [], disarms: [] };
  const MIN = 60 * S;

  it('is saved with its send time while it runs, and dropped once it sends or is cancelled', async () => {
    const h = harness();
    h.controller.hold('inApp');
    expect(h.lastSave()).toEqual({ ...none, countdown: { id: 'alert-1', trigger: 'inApp', sendAt: 5 * S } });

    await h.advance(5 * S);
    expect(h.lastSave()?.countdown).toBeNull();
    expect(h.lastSave()?.active).toMatchObject({ id: 'alert-1' });

    const h2 = harness();
    h2.controller.hold('inApp');
    await h2.controller.cancel();
    await h2.flush();
    expect(h2.lastSave()).toEqual(none);
  });

  it('a link-loss countdown is saved with the end of grace plus the window', async () => {
    const h = harness();
    h.controller.dispatch({ type: 'linkLost' });

    expect(h.lastSave()?.countdown).toEqual({ id: 'alert-1', trigger: 'linkLoss', sendAt: 50 * S });
  });

  it('restored before its send time: counts down the time left on the same id, re-armed for the rest', async () => {
    const h = harness();
    h.setNow(2 * S);
    h.controller.restore({ ...none, countdown: { id: 'old-1', trigger: 'inApp', sendAt: 5 * S } });

    expect(h.controller.getSnapshot().state).toMatchObject({ kind: 'cancelWindow', trigger: 'inApp', endsAt: 5 * S });
    expect(h.arms).toEqual([{ id: 'old-1', trigger: 'inApp', delayMs: 3 * S }]);

    await h.advance(3 * S);
    expect(h.sends).toEqual([{ id: 'old-1', trigger: 'inApp', triggeredAt: 5 * S, at: 5 * S }]);
    expect(h.kind()).toBe('active');
  });

  it('a restored countdown can be cancelled with an unlock, which disarms its id', async () => {
    const h = harness();
    h.controller.restore({ ...none, countdown: { id: 'old-1', trigger: 'linkLoss', sendAt: 30 * S } });

    expect(await h.controller.cancel()).toBe(true);
    await h.flush();
    expect(h.disarms.map((d) => d.id)).toEqual(['old-1']);
    expect(h.sends).toHaveLength(0);
  });

  it('restored after its send time: shown as the active alert on the same id, never as cancelled or safe', async () => {
    const h = harness();
    h.setNow(10 * MIN);
    h.controller.restore({ ...none, countdown: { id: 'old-1', trigger: 'linkLoss', sendAt: 50 * S } });
    await h.flush();

    expect(h.controller.getSnapshot()).toMatchObject({
      alertId: 'old-1',
      lateCancel: false,
      state: { kind: 'active', trigger: 'linkLoss', endsAt: 50 * S + LIVE_LOCATION_MS },
    });
    // Same id: if the server already sent it nobody is texted twice; if its arm never landed, this sends it.
    expect(h.sends).toEqual([{ id: 'old-1', trigger: 'linkLoss', triggeredAt: 50 * S, at: 10 * MIN }]);
    expect(h.ends).toHaveLength(0);
  });

  it('restored after its 60 min would have passed: ended as timeout, never shown', async () => {
    const h = harness();
    h.setNow(5 * S + LIVE_LOCATION_MS);
    h.controller.restore({ ...none, countdown: { id: 'old-1', trigger: 'inApp', sendAt: 5 * S } });
    await h.flush();

    expect(h.kind()).toBe('idle');
    expect(h.ends.map((e) => [e.id, e.reason])).toEqual([['old-1', 'timeout']]);
  });
});
