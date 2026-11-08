import { encodeButtonEvent, PROTOCOL_VERSION } from '@linkd/ble-protocol';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { BangleScreen } from '../src/features/device/BangleScreen';
import * as permissionsModule from '../src/features/onboarding/permissions';
import type { TransportHandlers } from '../src/lib/ble/bangleLink';

jest.mock('../src/features/onboarding/permissions', () => ({
  ...jest.requireActual('../src/features/onboarding/permissions'),
  requestPermission: jest.fn(),
}));

const mockConnect = jest.fn();
jest.mock('../src/lib/ble/blePlxTransport', () => ({
  createBlePlxTransport: () => ({
    connect: (handlers: TransportHandlers) => mockConnect(handlers),
    disconnect: async () => {},
  }),
}));

const CURRENT = Uint8Array.from([PROTOCOL_VERSION]);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(permissionsModule.requestPermission).mockResolvedValue('granted');
});

describe('BangleScreen', () => {
  it('connects, then lists button presses newest first', async () => {
    let bangle: TransportHandlers | undefined;
    mockConnect.mockImplementation(async (handlers: TransportHandlers) => {
      bangle = handlers;
      return CURRENT;
    });
    render(<BangleScreen />);
    expect(screen.getByText('Not connected')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Connect'));
    expect(await screen.findByText('Connected')).toBeOnTheScreen();

    act(() => bangle?.onNotification(encodeButtonEvent(true)));
    expect(screen.getByText('Button pressed')).toBeOnTheScreen();
    act(() => bangle?.onNotification(encodeButtonEvent(false)));
    expect(screen.getByText('Button released')).toBeOnTheScreen();

    act(() => bangle?.onDisconnect());
    expect(screen.getByText('Disconnected')).toBeOnTheScreen();
    expect(screen.getByText('Try again')).toBeOnTheScreen();
  });

  it('says so when the bangle cannot be found', async () => {
    mockConnect.mockRejectedValue(new Error('No bangle found'));
    render(<BangleScreen />);

    fireEvent.press(screen.getByText('Connect'));

    expect(await screen.findByText("Couldn't find your bangle")).toBeOnTheScreen();
  });

  it('does not try to connect when Bluetooth permission is refused', async () => {
    jest.mocked(permissionsModule.requestPermission).mockResolvedValue('off');
    render(<BangleScreen />);

    fireEvent.press(screen.getByText('Connect'));

    expect(await screen.findByText('Bluetooth is off for LINKD')).toBeOnTheScreen();
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
