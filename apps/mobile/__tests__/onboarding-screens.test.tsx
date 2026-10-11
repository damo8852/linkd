import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { OnboardingScreen } from '../src/features/onboarding/OnboardingScreen';
import * as permissionsModule from '../src/features/onboarding/permissions';
import * as profileModule from '../src/features/onboarding/profile';
import { SettingsScreen } from '../src/features/settings/SettingsScreen';

// The OS prompts are the seam: the copy and step order stay real.
jest.mock('../src/features/onboarding/permissions', () => ({
  ...jest.requireActual('../src/features/onboarding/permissions'),
  requestPermission: jest.fn(),
  usePermissionStates: jest.fn(),
}));

const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn();
jest.mock('../src/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ maybeSingle: mockMaybeSingle }), insert: mockInsert }) },
}));

const permissions = jest.mocked(permissionsModule);

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockResolvedValue({ error: null });
});

function fillProfile(again = '213-373-4253'): void {
  fireEvent.changeText(screen.getByLabelText('Your name'), 'Ana');
  fireEvent.changeText(screen.getByLabelText('Your mobile number'), '(213) 373-4253');
  fireEvent.changeText(screen.getByLabelText('Type it again'), again);
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
}

describe('OnboardingScreen', () => {
  it('does not go on when the two numbers differ', () => {
    render(<OnboardingScreen />);

    fillProfile('213-373-4254');

    expect(screen.getByText('The two numbers do not match. Check both.')).toBeOnTheScreen();
    expect(screen.getByText('Step 1 of 6')).toBeOnTheScreen();
  });

  it('explains each permission before asking, then saves the profile with the dispatch choice', async () => {
    permissions.requestPermission.mockResolvedValue('granted');
    render(<OnboardingScreen />);
    fillProfile();

    // iOS (the Jest default) cannot ask for Bluetooth until pairing: explained, including force-quit, not prompted.
    expect(screen.getByText('The bangle cannot reach your phone at all.')).toBeOnTheScreen();
    expect(screen.getByText(/Do not swipe LINKD closed/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(permissions.requestPermission).not.toHaveBeenCalled();

    for (const [id, title, breaks] of [
      ['notifications', 'Allow notifications', 'An SOS can send without you seeing a warning first.'],
      ['location', 'Allow location', 'Your contacts get the SOS with no location.'],
      ['backgroundLocation', 'Allow location in the background', /only sent if LINKD is open on screen/],
    ] as const) {
      expect(await screen.findByText(breaks)).toBeOnTheScreen();
      fireEvent.press(screen.getByRole('button', { name: title }));
      await waitFor(() => expect(permissions.requestPermission).toHaveBeenLastCalledWith(id));
    }

    expect(await screen.findByText('Emergency dispatch: On')).toBeOnTheScreen();
    fireEvent(screen.getByLabelText('Emergency dispatch'), 'valueChange', false);
    expect(screen.getByText('Emergency dispatch: Off')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() =>
      expect(mockInsert).toHaveBeenCalledWith({ display_name: 'Ana', phone_e164: '+12133734253', dispatch_enabled: false }),
    );
  });

  it('skips background location when location was refused, and says so when saving fails', async () => {
    mockInsert.mockResolvedValue({ error: { code: 'PGRST000' } });
    render(<OnboardingScreen />);
    fillProfile();
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(await screen.findByRole('link', { name: 'Not now' }));
    await screen.findByText('Your contacts get the SOS with no location.');
    fireEvent.press(screen.getByRole('link', { name: 'Not now' }));

    fireEvent.press(await screen.findByRole('button', { name: 'Finish' }));

    expect(await screen.findByText("Couldn't save. Check your connection and try again.")).toBeOnTheScreen();
  });
});

describe('useNeedsOnboarding', () => {
  it('sends a signed-in user with no profile to onboarding, until the profile is saved', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => profileModule.useNeedsOnboarding(true));

    await waitFor(() => expect(result.current).toBe(true));
    await act(async () => {
      await profileModule.createProfile('Ana', '+12133734253', true);
    });

    expect(result.current).toBe(false);
  });

  it('never keeps a user from home when the profile check fails', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const { result } = renderHook(() => profileModule.useNeedsOnboarding(true));

    await act(async () => {});

    expect(result.current).toBe(false);
  });
});

describe('SettingsScreen', () => {
  it('shows a permission that is off, what is not working, and opens system settings when the OS will not ask', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const reload = jest.fn(async () => {});
    permissions.usePermissionStates.mockReturnValue({
      states: { bluetooth: 'later', notifications: 'granted', location: 'off', backgroundLocation: 'off' },
      reload,
    });
    permissions.requestPermission.mockResolvedValue('off');
    render(<SettingsScreen />);

    expect(screen.getByText('Bluetooth: Not asked yet')).toBeOnTheScreen();
    expect(screen.getByText('Notifications: On')).toBeOnTheScreen();
    expect(screen.getByText('Location: Off')).toBeOnTheScreen();
    expect(screen.getByText('Your contacts get the SOS with no location.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Turn on Location' }));

    await waitFor(() => expect(openSettings).toHaveBeenCalled());
    expect(permissions.requestPermission).toHaveBeenCalledWith('location');
    expect(reload).toHaveBeenCalled();
  });
});
