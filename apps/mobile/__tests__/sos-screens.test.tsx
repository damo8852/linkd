import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import HomeScreen from '../app/index';
import { ActiveAlertScreen } from '../src/features/sos/ActiveAlertScreen';
import { SOS_HOLD_MS, type SosState } from '../src/features/sos/alertMachine';
import { CountdownScreen } from '../src/features/sos/CountdownScreen';
import * as sosModule from '../src/features/sos/sos';
import { SosButton } from '../src/features/sos/SosButton';
import { SosOverlay } from '../src/features/sos/SosOverlay';
import { theme } from '../src/lib/theme';

// Factories, so the real modules (native storage, biometrics, the Supabase client) never load.
jest.mock('../src/features/sos/sos', () => ({ useSos: jest.fn(), useHasScreenLock: jest.fn() }));
jest.mock('../src/features/auth/auth', () => ({ signOut: jest.fn() }));
jest.mock('../src/features/emergency-contacts/contacts', () => ({
  useContacts: () => ({
    contacts: [{ id: '1', name: 'Contact 1', phone_e164: '+12133734251', status: 'active' }],
    loading: false,
    fresh: true,
    reload: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mocked = jest.mocked(sosModule);
const hold = jest.fn();
const cancel = jest.fn(async () => true);
const imSafe = jest.fn(async () => true);

function useSosReturns(state: SosState, noContacts = false): void {
  mocked.useSos.mockReturnValue({ snapshot: { state, noContacts }, hold, cancel, imSafe });
}

const idle: SosState = { kind: 'idle', batteryCritical: false };
const buttonWindow: SosState = { kind: 'cancelWindow', trigger: 'inApp', endsAt: 5000, bangleReconnected: false };
const linkWindow: SosState = { kind: 'cancelWindow', trigger: 'linkLoss', endsAt: 30_000, bangleReconnected: false };
const active: SosState = { kind: 'active', trigger: 'inApp', endsAt: 60 * 60_000, delivery: 'delivered' };

beforeEach(() => {
  jest.clearAllMocks();
  mocked.useHasScreenLock.mockReturnValue(true);
  useSosReturns(idle);
});

describe('SosButton', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('triggers only after a full 3 second hold', () => {
    const onHold = jest.fn();
    render(<SosButton onHold={onHold} />);
    const button = screen.getByRole('button', { name: /SOS/ });

    fireEvent(button, 'pressIn');
    act(() => jest.advanceTimersByTime(SOS_HOLD_MS - 1));
    expect(onHold).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1));
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a tap or a hold released early', () => {
    const onHold = jest.fn();
    render(<SosButton onHold={onHold} />);
    const button = screen.getByRole('button', { name: /SOS/ });

    fireEvent.press(button);
    fireEvent(button, 'pressIn');
    act(() => jest.advanceTimersByTime(SOS_HOLD_MS - 500));
    fireEvent(button, 'pressOut');
    act(() => jest.advanceTimersByTime(10_000));

    expect(onHold).not.toHaveBeenCalled();
  });

  it('is a red fill with the word SOS, never the pink accent', () => {
    render(<SosButton onHold={jest.fn()} />);

    expect(screen.getByText('SOS')).toBeOnTheScreen();
    expect(screen.getByText('Hold 3 seconds')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /SOS/ })).toHaveStyle({ backgroundColor: theme.color.danger });
  });
});

describe('CountdownScreen', () => {
  it('shows the seconds left, rounded up', () => {
    const { rerender } = render(<CountdownScreen state={buttonWindow} onCancel={cancel} now={() => 0} />);
    expect(screen.getByText('5')).toBeOnTheScreen();
    expect(screen.getByText('Sending SOS in')).toBeOnTheScreen();

    rerender(<CountdownScreen state={buttonWindow} onCancel={cancel} now={() => 4200} />);
    expect(screen.getByText('1')).toBeOnTheScreen();
  });

  it('has a cancel target of at least 88pt that asks for an unlock', async () => {
    render(<CountdownScreen state={buttonWindow} onCancel={cancel} now={() => 0} />);
    const button = screen.getByRole('button', { name: /Cancel/ });

    expect(button).toHaveStyle({ minHeight: 96 });
    expect(96).toBeGreaterThanOrEqual(theme.size.cancelTarget);
    expect(screen.getByText('Unlock your phone to stop it')).toBeOnTheScreen();

    fireEvent.press(button);
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  });

  it('says so when the unlock did not cancel', async () => {
    cancel.mockResolvedValueOnce(false);
    render(<CountdownScreen state={buttonWindow} onCancel={cancel} now={() => 0} />);

    fireEvent.press(screen.getByRole('button', { name: /Cancel/ }));

    expect(await screen.findByText('Not cancelled. Unlock your phone to stop the SOS.')).toBeOnTheScreen();
  });

  it('explains a link-loss countdown and a reconnect that does not cancel', () => {
    const { rerender } = render(<CountdownScreen state={linkWindow} onCancel={cancel} now={() => 0} />);
    expect(screen.getByText('Bangle disconnected')).toBeOnTheScreen();
    expect(screen.getByText('30')).toBeOnTheScreen();
    expect(screen.queryByText(/reconnected/)).toBeNull();

    rerender(<CountdownScreen state={{ ...linkWindow, bangleReconnected: true }} onCancel={cancel} now={() => 0} />);
    expect(screen.getByText('Bangle reconnected. This is still counting. Unlock to cancel.')).toBeOnTheScreen();
  });
});

describe('ActiveAlertScreen', () => {
  const props = { endsAt: 60 * 60_000, onImSafe: imSafe, now: () => 0, noContacts: false };

  it('says what actually happened for each delivery state', () => {
    const { rerender } = render(<ActiveAlertScreen {...props} delivery="pending" />);
    expect(screen.getByText('Sending SOS')).toBeOnTheScreen();

    rerender(<ActiveAlertScreen {...props} delivery="delivered" />);
    expect(screen.getByText('SOS sent')).toBeOnTheScreen();
    expect(screen.getByText('Your contacts were texted.')).toBeOnTheScreen();

    rerender(<ActiveAlertScreen {...props} delivery="failed" />);
    expect(screen.getByText('SOS not sent yet')).toBeOnTheScreen();
    expect(screen.getByText(/Trying again/)).toBeOnTheScreen();
    expect(screen.queryByText('SOS sent')).toBeNull();
  });

  it('never claims anyone was texted when there are no contacts', () => {
    render(<ActiveAlertScreen {...props} delivery="failed" noContacts />);

    expect(screen.getByText(/no emergency contacts, so no one was texted/)).toBeOnTheScreen();
    expect(screen.queryByText(/Trying again/)).toBeNull();
  });

  it('ends with "I\'m safe" and says so when the unlock failed', async () => {
    imSafe.mockResolvedValueOnce(false);
    render(<ActiveAlertScreen {...props} delivery="delivered" />);
    expect(screen.getByText('Ends by itself in 60 min.')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: "I'm safe" }));

    expect(await screen.findByText('Still active. Unlock your phone to end the alert.')).toBeOnTheScreen();
    expect(imSafe).toHaveBeenCalledTimes(1);
  });
});

describe('SosOverlay', () => {
  it('shows nothing while idle', () => {
    render(<SosOverlay />);
    expect(screen.queryByText('Sending SOS in')).toBeNull();
    expect(screen.queryByText('SOS sent')).toBeNull();
  });

  it('takes over the screen for the countdown and wires cancel', async () => {
    useSosReturns(buttonWindow);
    render(<SosOverlay />);

    fireEvent.press(screen.getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
  });

  it('shows the active alert and wires "I\'m safe"', async () => {
    useSosReturns(active);
    render(<SosOverlay />);
    expect(screen.getByText('SOS sent')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: "I'm safe" }));
    await waitFor(() => expect(imSafe).toHaveBeenCalledTimes(1));
  });
});

describe('HomeScreen SOS', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('a held SOS button raises an in-app hold', () => {
    render(<HomeScreen />);

    fireEvent(screen.getByRole('button', { name: /SOS/ }), 'pressIn');
    act(() => jest.advanceTimersByTime(SOS_HOLD_MS));

    expect(hold).toHaveBeenCalledWith('inApp');
  });

  it('warns when the phone has no screen lock', () => {
    mocked.useHasScreenLock.mockReturnValue(false);
    render(<HomeScreen />);

    expect(screen.getByText(/Set a screen lock/)).toBeOnTheScreen();
  });

  it('does not warn while the screen lock is set or still unknown', () => {
    mocked.useHasScreenLock.mockReturnValue(null);
    render(<HomeScreen />);

    expect(screen.queryByText(/Set a screen lock/)).toBeNull();
  });
});
