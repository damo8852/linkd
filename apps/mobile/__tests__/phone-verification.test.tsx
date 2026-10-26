import { FunctionsHttpError } from '@supabase/supabase-js';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PhoneCard } from '../src/features/settings/PhoneCard';

const mockLoad = jest.fn();
const mockInvoke = jest.fn();
const mockRpc = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ maybeSingle: mockLoad }) }),
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));
// Focus is the first render here; the effect runs like a mount.
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => jest.requireActual<typeof import('react')>('react').useEffect(effect, [effect]),
}));

const UNVERIFIED = { data: { phone_e164: '+14155550123', phone_verified: false }, error: null };
const VERIFIED = { data: { phone_e164: '+14155550123', phone_verified: true }, error: null };

function httpError(status: number, body: unknown): FunctionsHttpError {
  return new FunctionsHttpError({ status, json: () => Promise.resolve(body) });
}

async function askForCode(): Promise<void> {
  fireEvent.press(await screen.findByText('Text me a code'));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoad.mockResolvedValue(UNVERIFIED);
  mockInvoke.mockResolvedValue({ data: { sent: true }, error: null });
});

describe('PhoneCard', () => {
  it('flags an unverified number and says why it matters', async () => {
    render(<PhoneCard />);

    expect(await screen.findByText('Your number: Not verified')).toBeOnTheScreen();
    expect(
      screen.getByText('Your contacts and dispatch call you back on this number. Verify it so you know it reaches you.'),
    ).toBeOnTheScreen();
  });

  it('texts a code, then shows Verified once the server confirms it', async () => {
    mockRpc.mockResolvedValue({ data: 'verified', error: null });
    render(<PhoneCard />);
    await askForCode();

    fireEvent.changeText(await screen.findByLabelText('Code'), '123456');
    mockLoad.mockResolvedValue(VERIFIED);
    fireEvent.press(screen.getByText('Verify'));

    expect(await screen.findByText('Your number: Verified')).toBeOnTheScreen();
    expect(mockInvoke).toHaveBeenCalledWith('verify-phone', { body: {} });
    expect(mockRpc).toHaveBeenCalledWith('confirm_phone_code', { p_code: '123456' });
  });

  it('says a wrong code is wrong and stays unverified', async () => {
    mockRpc.mockResolvedValue({ data: 'wrong', error: null });
    render(<PhoneCard />);
    await askForCode();

    fireEvent.changeText(await screen.findByLabelText('Code'), '000000');
    fireEvent.press(screen.getByText('Verify'));

    expect(await screen.findByText("That code isn't right. Check the text and try again.")).toBeOnTheScreen();
    expect(screen.getByText('Your number: Not verified')).toBeOnTheScreen();
  });

  it.each([
    [{ error: 'too_soon' }, 'A code was just sent. Wait a minute before asking for another.'],
    [{ error: 'too_many' }, 'Too many codes today. Try again tomorrow.'],
    [{ error: 'sms_failed' }, "Couldn't send a code. Check your connection and try again."],
  ])('says why no code was sent (%j)', async (body, message) => {
    mockInvoke.mockResolvedValue({ data: null, error: httpError(429, body) });
    render(<PhoneCard />);
    await askForCode();

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.queryByLabelText('Code')).toBeNull();
  });

  it('shows a verified number with no way to re-send', async () => {
    mockLoad.mockResolvedValue(VERIFIED);
    render(<PhoneCard />);

    expect(await screen.findByText('Your number: Verified')).toBeOnTheScreen();
    expect(screen.queryByText('Text me a code')).toBeNull();
  });

  it('shows nothing when the number cannot be read', async () => {
    mockLoad.mockResolvedValue({ data: null, error: { message: 'offline' } });
    render(<PhoneCard />);
    await Promise.resolve();

    expect(screen.queryByText(/Your number/)).toBeNull();
  });
});
