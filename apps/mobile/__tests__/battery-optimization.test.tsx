import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Battery from 'expo-battery';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import { OnboardingScreen } from '../src/features/onboarding/OnboardingScreen';
import * as permissionsModule from '../src/features/onboarding/permissions';
import { SettingsScreen } from '../src/features/settings/SettingsScreen';

jest.mock('expo-battery', () => ({ isBatteryOptimizationEnabledAsync: jest.fn() }));
jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(),
  ActivityAction: {
    REQUEST_IGNORE_BATTERY_OPTIMIZATIONS: 'android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    IGNORE_BATTERY_OPTIMIZATION_SETTINGS: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
  },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { android: { package: 'com.linkd.app' } } } }));
// Screens: the OS prompts are the seam, as in onboarding-screens.test.tsx; the logic tests use the real functions.
jest.mock('../src/features/onboarding/permissions', () => {
  const actual = jest.requireActual('../src/features/onboarding/permissions');
  return { ...actual, requestPermission: jest.fn(actual.requestPermission), usePermissionStates: jest.fn() };
});
jest.mock('../src/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ maybeSingle: jest.fn() }), insert: jest.fn() }) },
}));
jest.mock('../src/features/device/DevicesCard', () => ({ DevicesCard: () => null }));
jest.mock('../src/features/settings/PhoneCard', () => ({ PhoneCard: () => null }));
jest.mock('../src/features/settings/dispatchSetting', () => ({
  useDispatchSetting: () => ({ enabled: true, loading: false, saving: false, unlockFailed: false, saveFailed: false }),
}));

const battery = jest.mocked(Battery);
const intents = jest.mocked(IntentLauncher);
const permissions = jest.mocked(permissionsModule);
const { checkPermission, permissionIdsHere } = jest.requireActual<typeof permissionsModule>(
  '../src/features/onboarding/permissions',
);
const realRequest = jest.requireActual<typeof permissionsModule>('../src/features/onboarding/permissions').requestPermission;

const originalOS = Platform.OS;
function onPlatform(os: 'ios' | 'android'): void {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  permissions.requestPermission.mockImplementation(realRequest);
});
afterEach(() => onPlatform(originalOS as 'ios' | 'android'));

describe('battery optimization permission', () => {
  beforeEach(() => onPlatform('android'));

  it('is on (exempt) only when Android is not optimizing LINKD', async () => {
    battery.isBatteryOptimizationEnabledAsync.mockResolvedValue(true);
    expect(await checkPermission('batteryOptimization')).toBe('off');

    battery.isBatteryOptimizationEnabledAsync.mockResolvedValue(false);
    expect(await checkPermission('batteryOptimization')).toBe('granted');
  });

  it('reads as off, never on, when the state cannot be read', async () => {
    battery.isBatteryOptimizationEnabledAsync.mockRejectedValue(new Error('unavailable'));
    expect(await checkPermission('batteryOptimization')).toBe('off');
  });

  it("asks with Android's one-tap prompt for this package, then reports the real state", async () => {
    battery.isBatteryOptimizationEnabledAsync.mockResolvedValue(false);
    intents.startActivityAsync.mockResolvedValue({ resultCode: IntentLauncher.ResultCode?.Success ?? -1 });

    expect(await realRequest('batteryOptimization')).toBe('granted');
    expect(intents.startActivityAsync).toHaveBeenCalledTimes(1);
    expect(intents.startActivityAsync).toHaveBeenCalledWith('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', {
      data: 'package:com.linkd.app',
    });
  });

  it('a refused prompt reads as off, whatever the prompt returned', async () => {
    battery.isBatteryOptimizationEnabledAsync.mockResolvedValue(true);
    intents.startActivityAsync.mockResolvedValue({ resultCode: -1 });

    expect(await realRequest('batteryOptimization')).toBe('off');
  });

  it('falls back to the battery optimization list when the prompt cannot open', async () => {
    battery.isBatteryOptimizationEnabledAsync.mockResolvedValue(true);
    intents.startActivityAsync.mockRejectedValueOnce(new Error('no activity')).mockResolvedValueOnce({ resultCode: 0 });

    expect(await realRequest('batteryOptimization')).toBe('off');
    expect(intents.startActivityAsync).toHaveBeenLastCalledWith('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS');
  });

  it('is part of the Android permission list, after background location', () => {
    expect(permissionIdsHere()).toEqual(['bluetooth', 'notifications', 'location', 'backgroundLocation', 'batteryOptimization']);
  });

  it('does not exist on iOS', async () => {
    onPlatform('ios');
    expect(permissionIdsHere()).not.toContain('batteryOptimization');
    expect(await checkPermission('batteryOptimization')).toBe('granted');
    expect(battery.isBatteryOptimizationEnabledAsync).not.toHaveBeenCalled();
  });
});

describe('screens', () => {
  function fillProfile(): void {
    fireEvent.changeText(screen.getByLabelText('Your name'), 'Ana');
    fireEvent.changeText(screen.getByLabelText('Your mobile number'), '(213) 373-4253');
    fireEvent.changeText(screen.getByLabelText('Type it again'), '213-373-4253');
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  }

  it('Android onboarding explains background running as its own step and asks for it', async () => {
    onPlatform('android');
    permissions.requestPermission.mockResolvedValue('granted');
    render(<OnboardingScreen />);
    expect(screen.getByText('Step 1 of 7')).toBeOnTheScreen();
    fillProfile();

    for (const label of ['Allow Bluetooth', 'Allow notifications', 'Allow location', 'Allow location in the background']) {
      fireEvent.press(await screen.findByRole('button', { name: label }));
    }

    expect(await screen.findByText('Step 6 of 7')).toBeOnTheScreen();
    expect(screen.getByText('Android can pause LINKD while your phone sits idle.')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Let LINKD run in the background' }));

    await waitFor(() => expect(permissions.requestPermission).toHaveBeenLastCalledWith('batteryOptimization'));
    expect(await screen.findByText('Step 7 of 7')).toBeOnTheScreen();
    // Six screens rendered and awaited in turn: 0.5 s locally, over 5 s on the Windows CI runner.
  }, 30_000);

  it('iOS onboarding has no background running step', () => {
    onPlatform('ios');
    render(<OnboardingScreen />);
    expect(screen.getByText('Step 1 of 6')).toBeOnTheScreen();
  });

  it('Android Settings lists background running when off, and turning it on asks without opening app settings', async () => {
    onPlatform('android');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const reload = jest.fn(async () => {});
    permissions.usePermissionStates.mockReturnValue({
      states: { bluetooth: 'granted', notifications: 'granted', location: 'granted', backgroundLocation: 'granted', batteryOptimization: 'off' },
      reload,
    });
    permissions.requestPermission.mockResolvedValue('off');
    render(<SettingsScreen />);

    expect(screen.getByText('Background running: Off')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Turn on Background running' }));

    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(permissions.requestPermission).toHaveBeenCalledWith('batteryOptimization');
    expect(openSettings).not.toHaveBeenCalled();
  });

  it('iOS Settings does not list it', () => {
    onPlatform('ios');
    permissions.usePermissionStates.mockReturnValue({
      states: { bluetooth: 'later', notifications: 'granted', location: 'granted', backgroundLocation: 'granted', batteryOptimization: 'granted' },
      reload: jest.fn(async () => {}),
    });
    render(<SettingsScreen />);

    expect(screen.queryByText(/Background running/)).toBeNull();
  });
});
