import { INITIAL_STATE, transition, type SosEvent, type SosState } from './alertMachine';
import { countdownNotificationAt, createCountdownNotifier } from './countdownNotification';

const S = 1000;

function stateAfter(steps: [number, SosEvent][]): SosState {
  return steps.reduce((state, [at, event]) => transition(state, event, at).state, INITIAL_STATE);
}

describe('countdownNotificationAt', () => {
  it('is the moment a hold starts its visible window', () => {
    expect(countdownNotificationAt(stateAfter([[2 * S, { type: 'sosHold', source: 'button' }]]))).toBe(2 * S);
  });

  it('is the end of grace after a link loss, and stays put when the window starts', () => {
    expect(countdownNotificationAt(stateAfter([[0, { type: 'linkLost' }]]))).toBe(20 * S);
    expect(countdownNotificationAt(stateAfter([[0, { type: 'linkLost' }], [20 * S, { type: 'tick' }]]))).toBe(20 * S);
  });

  it('is none when nothing is counting down', () => {
    expect(countdownNotificationAt(INITIAL_STATE)).toBeNull();
    expect(countdownNotificationAt(stateAfter([[0, { type: 'sosHold', source: 'button' }], [5 * S, { type: 'tick' }]]))).toBeNull();
  });
});

describe('createCountdownNotifier', () => {
  function fake() {
    const calls: (string | number | null)[][] = [];
    const sync = createCountdownNotifier({
      schedule: async (at) => void calls.push(['schedule', at]),
      clear: async () => void calls.push(['clear']),
    });
    return { sync, calls };
  }

  it('schedules once per countdown, moves it sooner on a hold during grace, and clears it at the end', () => {
    const { sync, calls } = fake();
    sync(stateAfter([[0, { type: 'linkLost' }]]));
    sync(stateAfter([[0, { type: 'linkLost' }], [1 * S, { type: 'linkUp' }]]));
    sync(stateAfter([[0, { type: 'linkLost' }], [3 * S, { type: 'sosHold', source: 'button' }]]));
    sync(INITIAL_STATE);
    sync(INITIAL_STATE);

    expect(calls).toEqual([['schedule', 20 * S], ['schedule', 3 * S], ['clear']]);
  });
});
