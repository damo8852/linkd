import {
  BUTTON_CANCEL_WINDOW_MS,
  GRACE_PERIOD_MS,
  INITIAL_STATE,
  LINK_LOSS_CANCEL_WINDOW_MS,
  LIVE_LOCATION_MS,
  RECONNECT_STABLE_MS,
  nextDeadline,
  transition,
  type Command,
  type SosEvent,
  type SosState,
} from './alertMachine';

const S = 1000;
const MIN = 60 * S;

/** Feeds timed events through the machine; a `tick` at each listed time stands in for the timer. */
function run(steps: [number, SosEvent][], from: SosState = INITIAL_STATE) {
  let state = from;
  const commands: { at: number; command: Command }[] = [];
  for (const [at, event] of steps) {
    const result = transition(state, event, at);
    state = result.state;
    for (const command of result.commands) commands.push({ at, command });
  }
  return { state, commands };
}

const tick: SosEvent = { type: 'tick' };
const sent = (r: ReturnType<typeof run>) => r.commands.filter((c) => c.command.type === 'sendAlert');

describe('timing constants match sos_alert_flow.md', () => {
  it('uses the decided starting values', () => {
    expect(BUTTON_CANCEL_WINDOW_MS).toBe(5 * S);
    expect(GRACE_PERIOD_MS).toBe(20 * S);
    expect(RECONNECT_STABLE_MS).toBe(5 * S);
    expect(LINK_LOSS_CANCEL_WINDOW_MS).toBe(30 * S);
    expect(LIVE_LOCATION_MS).toBe(60 * MIN);
  });
});

describe('button and in-app hold', () => {
  it.each(['button', 'inApp'] as const)('%s hold sends after the 5 s window, not before', (source) => {
    const early = run([[0, { type: 'sosHold', source }], [4999, tick]]);
    expect(early.state.kind).toBe('cancelWindow');
    expect(sent(early)).toHaveLength(0);

    const r = run([[0, { type: 'sosHold', source }], [5 * S, tick]]);
    expect(r.state.kind).toBe('active');
    expect(sent(r)).toEqual([{ at: 5 * S, command: { type: 'sendAlert', trigger: source } }]);
  });

  it('device unlock during the window cancels and nothing is sent', () => {
    const r = run([[0, { type: 'sosHold', source: 'button' }], [3 * S, { type: 'cancel' }], [60 * S, tick]]);
    expect(r.state.kind).toBe('idle');
    expect(r.commands).toHaveLength(0);
  });

  it('a second hold during the window sends immediately', () => {
    const r = run([[0, { type: 'sosHold', source: 'button' }], [2 * S, { type: 'sosHold', source: 'button' }]]);
    expect(sent(r)).toEqual([{ at: 2 * S, command: { type: 'sendAlert', trigger: 'button' } }]);
  });

  it('link events do not affect a running button window', () => {
    const r = run([
      [0, { type: 'sosHold', source: 'button' }],
      [1 * S, { type: 'linkLost' }],
      [2 * S, { type: 'linkUp' }],
      [5 * S, tick],
    ]);
    expect(sent(r)).toHaveLength(1);
  });
});

describe('link loss', () => {
  it('is silent for 20 s, counts down 30 s, then sends at 50 s', () => {
    const r1 = run([[0, { type: 'linkLost' }], [19_999, tick]]);
    expect(r1.state.kind).toBe('grace');

    const r2 = run([[0, { type: 'linkLost' }], [20 * S, tick]]);
    expect(r2.state).toMatchObject({ kind: 'cancelWindow', trigger: 'linkLoss', endsAt: 50 * S });

    const r3 = run([[0, { type: 'linkLost' }], [20 * S, tick], [49_999, tick]]);
    expect(sent(r3)).toHaveLength(0);

    const r4 = run([[0, { type: 'linkLost' }], [20 * S, tick], [50 * S, tick]]);
    expect(sent(r4)).toEqual([{ at: 50 * S, command: { type: 'sendAlert', trigger: 'linkLoss' } }]);
  });

  it('a reconnect that stays up 5 s during grace returns to idle and never sends', () => {
    const r = run([[0, { type: 'linkLost' }], [3 * S, { type: 'linkUp' }], [8 * S, tick], [120 * S, tick]]);
    expect(r.state.kind).toBe('idle');
    expect(r.commands).toHaveLength(0);
  });

  it('a reconnect shorter than 5 s does not clear grace', () => {
    const r = run([[0, { type: 'linkLost' }], [3 * S, { type: 'linkUp' }], [7_999, tick]]);
    expect(r.state.kind).toBe('grace');
  });

  it('a flapping link resumes the same grace timer and still sends at 50 s', () => {
    const r = run([
      [0, { type: 'linkLost' }],
      [2 * S, { type: 'linkUp' }],
      [6 * S, { type: 'linkLost' }],
      [8 * S, { type: 'linkUp' }],
      [12 * S, { type: 'linkLost' }],
      [14 * S, { type: 'linkUp' }],
      [18 * S, { type: 'linkLost' }],
      [20 * S, tick],
      [50 * S, tick],
    ]);
    expect(sent(r)).toEqual([{ at: 50 * S, command: { type: 'sendAlert', trigger: 'linkLoss' } }]);
  });

  it('grace expiring before the link is stable starts the cancel window', () => {
    const r = run([[0, { type: 'linkLost' }], [18 * S, { type: 'linkUp' }], [20 * S, tick]]);
    expect(r.state).toMatchObject({ kind: 'cancelWindow', trigger: 'linkLoss', bangleReconnected: true });
  });

  it('a reconnect during the link-loss window keeps counting and still sends', () => {
    const r = run([[0, { type: 'linkLost' }], [20 * S, tick], [25 * S, { type: 'linkUp' }], [40 * S, tick]]);
    expect(r.state).toMatchObject({ kind: 'cancelWindow', bangleReconnected: true });

    const done = run([[0, { type: 'linkLost' }], [20 * S, tick], [25 * S, { type: 'linkUp' }], [50 * S, tick]]);
    expect(sent(done)).toHaveLength(1);
  });

  it('device unlock cancels the link-loss window', () => {
    const r = run([[0, { type: 'linkLost' }], [20 * S, tick], [30 * S, { type: 'cancel' }], [60 * S, tick]]);
    expect(r.state.kind).toBe('idle');
    expect(r.commands).toHaveLength(0);
  });

  it('device unlock during silent grace does not stop the alert', () => {
    const r = run([[0, { type: 'linkLost' }], [5 * S, { type: 'cancel' }], [20 * S, tick], [50 * S, tick]]);
    expect(sent(r)).toHaveLength(1);
  });

  it('a hold during the link-loss window sends immediately', () => {
    const r = run([
      [0, { type: 'linkLost' }],
      [20 * S, tick],
      [22 * S, { type: 'linkUp' }],
      [23 * S, { type: 'sosHold', source: 'button' }],
    ]);
    expect(sent(r)).toEqual([{ at: 23 * S, command: { type: 'sendAlert', trigger: 'button' } }]);
  });

  it('a hold during grace starts the 5 s window', () => {
    const r = run([[0, { type: 'linkLost' }], [4 * S, { type: 'sosHold', source: 'inApp' }]]);
    expect(r.state).toMatchObject({ kind: 'cancelWindow', trigger: 'inApp', endsAt: 9 * S });
    expect(sent(run([[0, { type: 'linkLost' }], [4 * S, { type: 'sosHold', source: 'inApp' }], [9 * S, tick]]))).toHaveLength(1);
  });
});

describe('benign link loss never sends', () => {
  it('battery critical, then link loss: unprotected', () => {
    const r = run([[0, { type: 'batteryCritical' }], [1 * S, { type: 'linkLost' }], [10 * MIN, tick]]);
    expect(r.state).toEqual({ kind: 'unprotected', reason: 'batteryCritical' });
    expect(r.commands).toHaveLength(0);
  });

  it.each(['bluetoothOff', 'phoneDying'] as const)('%s while idle: unprotected', (type) => {
    const r = run([[0, { type }], [1 * S, { type: 'linkLost' }], [10 * MIN, tick]]);
    expect(r.state).toEqual({ kind: 'unprotected', reason: type });
    expect(r.commands).toHaveLength(0);
  });

  it.each(['bluetoothOff', 'phoneDying'] as const)('%s reported during grace: unprotected', (type) => {
    const r = run([[0, { type: 'linkLost' }], [50, { type }], [10 * MIN, tick]]);
    expect(r.state).toEqual({ kind: 'unprotected', reason: type });
    expect(r.commands).toHaveLength(0);
  });

  it.each(['bluetoothOff', 'phoneDying'] as const)('%s during the link-loss window: still sends', (type) => {
    const r = run([[0, { type: 'linkLost' }], [20 * S, tick], [25 * S, { type }], [50 * S, tick]]);
    expect(sent(r)).toHaveLength(1);
  });

  it('a reconnect clears unprotected and a later link loss alerts again', () => {
    const r = run([
      [0, { type: 'batteryCritical' }],
      [1 * S, { type: 'linkLost' }],
      [60 * MIN, { type: 'linkUp' }],
      [61 * MIN, { type: 'linkLost' }],
      [61 * MIN + 50 * S, tick],
      [61 * MIN + 50 * S, tick],
    ]);
    expect(sent(r)).toHaveLength(1);
  });

  it('the in-app hold still works while unprotected', () => {
    const r = run([[0, { type: 'bluetoothOff' }], [1 * S, { type: 'sosHold', source: 'inApp' }], [6 * S, tick]]);
    expect(sent(r)).toHaveLength(1);
  });
});

describe('active alert', () => {
  const sendAt5s: [number, SosEvent][] = [[0, { type: 'sosHold', source: 'button' }], [5 * S, tick]];

  it('ends after 60 min with endAlert', () => {
    const before = run([...sendAt5s, [5 * S + 60 * MIN - 1, tick]]);
    expect(before.state.kind).toBe('active');

    const r = run([...sendAt5s, [5 * S + 60 * MIN, tick]]);
    expect(r.state.kind).toBe('idle');
    expect(r.commands.at(-1)).toEqual({ at: 5 * S + 60 * MIN, command: { type: 'endAlert' } });
  });

  it('"I\'m safe" (device unlock) ends it with endAlert', () => {
    const r = run([...sendAt5s, [10 * MIN, { type: 'imSafe' }]]);
    expect(r.state.kind).toBe('idle');
    expect(r.commands.at(-1)?.command).toEqual({ type: 'endAlert' });
  });

  it('never sends twice for further triggers', () => {
    const r = run([
      ...sendAt5s,
      [6 * S, { type: 'sosHold', source: 'button' }],
      [7 * S, { type: 'linkLost' }],
      [10 * MIN, tick],
    ]);
    expect(sent(r)).toHaveLength(1);
    expect(r.state.kind).toBe('active');
  });

  it('starts pending and records delivery or failure', () => {
    expect(run(sendAt5s).state).toMatchObject({ kind: 'active', delivery: 'pending' });
    expect(run([...sendAt5s, [6 * S, { type: 'alertFailed' }]]).state).toMatchObject({ delivery: 'failed' });
    expect(run([...sendAt5s, [6 * S, { type: 'alertDelivered' }]]).state).toMatchObject({ delivery: 'delivered' });
  });
});

describe('late or missing timers never skip or postpone a send', () => {
  it('one late tick after link loss cascades through grace and the window', () => {
    const r = run([[0, { type: 'linkLost' }], [10 * MIN, tick]]);
    expect(sent(r)).toEqual([{ at: 10 * MIN, command: { type: 'sendAlert', trigger: 'linkLoss' } }]);
  });

  it('a late tick does not let a reconnect that became stable after grace ended clear it', () => {
    // Up at 17 s, stable at 22 s, but grace ended at 20 s; the first tick arrives at 25 s.
    const r = run([[0, { type: 'linkLost' }], [17 * S, { type: 'linkUp' }], [25 * S, tick]]);
    expect(r.state).toMatchObject({ kind: 'cancelWindow', trigger: 'linkLoss', endsAt: 50 * S });
  });

  it('a reconnect reported after grace already expired does not cancel', () => {
    const r = run([[0, { type: 'linkLost' }], [25 * S, { type: 'linkUp' }], [31 * S, tick], [50 * S, tick]]);
    expect(sent(r)).toHaveLength(1);
  });

  it('a cancel reported after the window already expired neither cancels nor ends the alert', () => {
    const r = run([[0, { type: 'sosHold', source: 'button' }], [6 * S, { type: 'cancel' }]]);
    expect(sent(r)).toHaveLength(1);
    expect(r.state.kind).toBe('active');
    expect(r.commands.map((c) => c.command.type)).not.toContain('endAlert');
  });

  it('"I\'m safe" during a countdown does not cancel it', () => {
    const r = run([[0, { type: 'sosHold', source: 'button' }], [1 * S, { type: 'imSafe' }], [5 * S, tick]]);
    expect(sent(r)).toHaveLength(1);
  });
});

describe('nextDeadline', () => {
  it('returns the time the caller must tick at', () => {
    expect(nextDeadline(INITIAL_STATE)).toBeNull();
    expect(nextDeadline(run([[0, { type: 'sosHold', source: 'button' }]]).state)).toBe(5 * S);
    expect(nextDeadline(run([[0, { type: 'linkLost' }]]).state)).toBe(20 * S);
    expect(nextDeadline(run([[0, { type: 'linkLost' }], [3 * S, { type: 'linkUp' }]]).state)).toBe(8 * S);
    expect(nextDeadline(run([[0, { type: 'sosHold', source: 'button' }], [5 * S, tick]]).state)).toBe(5 * S + 60 * MIN);
  });
});
