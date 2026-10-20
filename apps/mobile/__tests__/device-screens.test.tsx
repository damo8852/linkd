import { act, fireEvent, render, screen } from '@testing-library/react-native';

import * as deviceModule from '../src/features/device/device';
import { DevicesCard } from '../src/features/device/DevicesCard';
import { SignedOutBanner } from '../src/features/device/SignedOutBanner';

// A factory, so the real module (and the native storage behind the client) is never loaded.
jest.mock('../src/features/device/device', () => ({
  listDevices: jest.fn(),
  removeOtherDevice: jest.fn(),
  removeThisPhone: jest.fn(),
  useArmed: jest.fn(),
}));

const mockHold = jest.fn();
jest.mock('../src/features/sos/sos', () => ({ useSos: () => ({ hold: mockHold }) }));

const device = jest.mocked(deviceModule);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DevicesCard', () => {
  const phones = [
    { id: 'd1', name: 'iPhone', thisPhone: true },
    { id: 'd2', name: 'Android phone', thisPhone: false },
  ];

  it('lists the armed phones and removes another phone from here', async () => {
    device.listDevices.mockResolvedValue(phones);
    device.removeOtherDevice.mockResolvedValue(true);
    render(<DevicesCard />);

    fireEvent.press(await screen.findByRole('button', { name: 'Remove Android phone' }));

    expect(device.removeOtherDevice).toHaveBeenCalledWith('d2');
    expect(await screen.findByRole('button', { name: 'Remove this device' })).toBeOnTheScreen();
    expect(device.removeThisPhone).not.toHaveBeenCalled();
  });

  it('says so when another phone could not be removed, because it is still armed', async () => {
    device.listDevices.mockResolvedValue(phones);
    device.removeOtherDevice.mockResolvedValue(false);
    render(<DevicesCard />);

    fireEvent.press(await screen.findByRole('button', { name: 'Remove Android phone' }));

    expect(await screen.findByText('Could not remove that device. It can still send an SOS for your account.')).toBeOnTheScreen();
  });

  it('removes this phone only after an unlock', async () => {
    device.listDevices.mockResolvedValue(phones);
    device.removeThisPhone.mockResolvedValue('locked');
    render(<DevicesCard />);

    fireEvent.press(await screen.findByRole('button', { name: 'Remove this device' }));

    expect(await screen.findByText('Unlock your phone to remove this device.')).toBeOnTheScreen();
  });

  it('says so when the list cannot be loaded', async () => {
    device.listDevices.mockRejectedValue(new Error('network down'));
    render(<DevicesCard />);

    expect(await screen.findByText('Could not load your devices. Check your connection.')).toBeOnTheScreen();
  });
});

describe('SignedOutBanner', () => {
  const banner = 'Signed out, your bangle still works. An SOS will still reach your contacts.';

  it('says a signed-out phone is still armed and offers to remove it', async () => {
    const recheck = jest.fn();
    device.useArmed.mockReturnValue({ armed: true, recheck });
    device.removeThisPhone.mockResolvedValue('removed');
    render(<SignedOutBanner />);

    expect(screen.getByText(banner)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Remove this device' }));

    expect(device.removeThisPhone).toHaveBeenCalledTimes(1);
    await screen.findByText(banner);
    expect(recheck).toHaveBeenCalledTimes(1);
  });

  it.each([false, null])('shows nothing when the phone is not armed (%s)', (armed) => {
    device.useArmed.mockReturnValue({ armed, recheck: jest.fn() });
    render(<SignedOutBanner />);

    expect(screen.queryByText(banner)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove this device' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'SOS' })).toBeNull();
  });

  it('keeps the SOS button within reach while signed out, and a full hold triggers it', () => {
    jest.useFakeTimers();
    device.useArmed.mockReturnValue({ armed: true, recheck: jest.fn() });
    render(<SignedOutBanner />);

    fireEvent(screen.getByRole('button', { name: 'SOS' }), 'pressIn');
    expect(mockHold).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(3000));

    expect(mockHold).toHaveBeenCalledWith('inApp');
    jest.useRealTimers();
  });

  it('says the server still lists the phone when it was removed offline', async () => {
    device.useArmed.mockReturnValue({ armed: true, recheck: jest.fn() });
    device.removeThisPhone.mockResolvedValue('removedOffline');
    render(<SignedOutBanner />);

    fireEvent.press(screen.getByRole('button', { name: 'Remove this device' }));

    expect(await screen.findByText(/It is still listed in your account/)).toBeOnTheScreen();
  });
});
