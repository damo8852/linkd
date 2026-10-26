import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as permissionsModule from '../src/features/onboarding/permissions';
import { SettingsScreen } from '../src/features/settings/SettingsScreen';

jest.mock('../src/features/onboarding/permissions', () => ({
  ...jest.requireActual('../src/features/onboarding/permissions'),
  usePermissionStates: jest.fn(),
}));

const mockLoad = jest.fn();
const mockSave = jest.fn();
const mockEq = jest.fn(() => ({ select: () => ({ maybeSingle: mockSave }) }));
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockGetSession = jest.fn();
// Covered in device-screens.test.tsx; mocked so the native storage behind it is never loaded.
jest.mock('../src/features/device/DevicesCard', () => ({ DevicesCard: () => null }));
// Covered in phone-verification.test.tsx.
jest.mock('../src/features/settings/PhoneCard', () => ({ PhoneCard: () => null }));
jest.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    from: () => ({ select: () => ({ maybeSingle: mockLoad }), update: mockUpdate }),
  },
}));

const SAVE_FAILED = "Couldn't save. Emergency dispatch is still on. Check your connection and try again.";

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(permissionsModule.usePermissionStates).mockReturnValue({ states: null, reload: async () => {} });
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  mockLoad.mockResolvedValue({ data: { dispatch_enabled: true }, error: null });
});

function flipSwitch(next: boolean): void {
  fireEvent(screen.getByLabelText('Emergency dispatch'), 'valueChange', next);
}

describe('dispatch setting in Settings', () => {
  it('shows the saved setting in words, with what it means', async () => {
    mockLoad.mockResolvedValue({ data: { dispatch_enabled: false }, error: null });
    render(<SettingsScreen />);

    expect(await screen.findByText('Emergency dispatch: Off')).toBeOnTheScreen();
    expect(screen.getByText('Off: only your contacts are told. No dispatcher is asked to send help.')).toBeOnTheScreen();
  });

  it("saves a change to the user's own profile and shows what the server saved", async () => {
    mockSave.mockResolvedValue({ data: { dispatch_enabled: false }, error: null });
    render(<SettingsScreen />);
    await screen.findByText('Emergency dispatch: On');

    flipSwitch(false);

    expect(await screen.findByText('Emergency dispatch: Off')).toBeOnTheScreen();
    expect(mockUpdate).toHaveBeenCalledWith({ dispatch_enabled: false });
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('keeps showing the saved value and says so when the save fails', async () => {
    mockSave.mockResolvedValue({ data: null, error: { message: 'offline' } });
    render(<SettingsScreen />);
    await screen.findByText('Emergency dispatch: On');

    flipSwitch(false);

    expect(await screen.findByText(SAVE_FAILED)).toBeOnTheScreen();
    expect(screen.getByText('Emergency dispatch: On')).toBeOnTheScreen();
    expect(screen.queryByText('Emergency dispatch: Off')).not.toBeOnTheScreen();
  });

  it('treats a save that changed no row as failed', async () => {
    mockSave.mockResolvedValue({ data: null, error: null });
    render(<SettingsScreen />);
    await screen.findByText('Emergency dispatch: On');

    flipSwitch(false);

    expect(await screen.findByText(SAVE_FAILED)).toBeOnTheScreen();
    expect(screen.getByText('Emergency dispatch: On')).toBeOnTheScreen();
  });

  it('treats a save that throws as failed', async () => {
    mockSave.mockRejectedValue(new Error('network'));
    render(<SettingsScreen />);
    await screen.findByText('Emergency dispatch: On');

    flipSwitch(false);

    expect(await screen.findByText(SAVE_FAILED)).toBeOnTheScreen();
    expect(screen.getByText('Emergency dispatch: On')).toBeOnTheScreen();
  });

  it('does not save when signed out', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(<SettingsScreen />);
    await screen.findByText('Emergency dispatch: On');

    flipSwitch(false);

    expect(await screen.findByText(SAVE_FAILED)).toBeOnTheScreen();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('shows no switch, never a guessed value, when the setting cannot be read', async () => {
    mockLoad.mockResolvedValue({ data: null, error: { message: 'offline' } });
    render(<SettingsScreen />);

    expect(await screen.findByText("Couldn't load your dispatch setting. Check your connection.")).toBeOnTheScreen();
    expect(screen.queryByLabelText('Emergency dispatch')).not.toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2));
  });
});
