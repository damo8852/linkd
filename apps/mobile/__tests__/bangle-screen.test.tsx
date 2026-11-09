import { decodeFrame, encodeBatteryCritical, encodeButtonEvent, encodeSosTrigger, type Frame } from '@linkd/ble-protocol';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as bangleModule from '../src/features/device/bangle';
import { BangleScreen } from '../src/features/device/BangleScreen';
import type { SessionSnapshot } from '../src/lib/ble/bangleSession';

// The feature seam: the session itself is covered in bangle-device.test.ts and bangleSession.test.ts.
jest.mock('../src/features/device/bangle', () => ({ useBangle: jest.fn(), pairBangle: jest.fn() }));

const bangle = jest.mocked(bangleModule);
const frame = (bytes: Uint8Array): Frame => decodeFrame(bytes) as Frame;

function show(snapshot: SessionSnapshot): void {
  bangle.useBangle.mockReturnValue(snapshot);
  render(<BangleScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
  bangle.pairBangle.mockResolvedValue(true);
});

describe('BangleScreen', () => {
  it('not connected: says the bangle cannot send an SOS, and Connect pairs it', async () => {
    show({ link: 'idle', frames: [] });

    expect(screen.getByText('Your bangle cannot send an SOS until it is connected.')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Connect'));
    await waitFor(() => expect(bangle.pairBangle).toHaveBeenCalledTimes(1));
  });

  it('says a 3 s hold starts an SOS, and lists frames newest first', () => {
    show({
      link: 'connected',
      frames: [
        frame(encodeBatteryCritical()),
        frame(encodeSosTrigger(7)),
        frame(encodeButtonEvent(false)),
        frame(encodeButtonEvent(true)),
      ],
    });

    expect(screen.getByText('Connected')).toBeOnTheScreen();
    expect(screen.getByText(/Holding the bangle button for 3 seconds starts an SOS countdown/)).toBeOnTheScreen();
    expect(screen.getAllByText(/^(Battery critical|SOS hold received|Button)/).map((node) => node.props.children)).toEqual([
      'Battery critical',
      'SOS hold received (7)',
      'Button released',
      'Button pressed',
    ]);
    expect(screen.queryByText('Connect')).toBeNull();
  });

  it('a dropped link says it is reconnecting and that an SOS countdown follows if it does not come back', () => {
    show({ link: 'disconnected', frames: [] });

    expect(screen.getByText('Link lost, reconnecting')).toBeOnTheScreen();
    expect(screen.getByText('If it does not come back, LINKD starts an SOS countdown.')).toBeOnTheScreen();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('a bangle that cannot be found yet is still being looked for', () => {
    show({ link: 'failed', frames: [] });
    expect(screen.getByText("Can't find your bangle yet")).toBeOnTheScreen();
  });

  it('a bangle on another protocol version cannot be used', () => {
    show({ link: 'unsupported', frames: [] });
    expect(screen.getByText("This bangle can't be used")).toBeOnTheScreen();
  });

  it('says so when Bluetooth is refused, and offers to try again', async () => {
    bangle.pairBangle.mockResolvedValue(false);
    show({ link: 'idle', frames: [] });

    fireEvent.press(screen.getByText('Connect'));

    expect(await screen.findByText('Bluetooth is off for LINKD')).toBeOnTheScreen();
    expect(screen.getByText('Try again')).toBeOnTheScreen();
  });
});
