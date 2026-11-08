import type { Frame } from '@linkd/ble-protocol';
import { useEffect, useState } from 'react';

import { Body, Button, Card, Heading, Screen } from '../../components/ui';
import { connectBangle, type LinkState } from '../../lib/ble/bangleLink';
import { createBlePlxTransport } from '../../lib/ble/blePlxTransport';
import { requestPermission } from '../onboarding/permissions';

const transport = createBlePlxTransport();

const MAX_EVENTS_SHOWN = 20;

/** `noPermission`: the OS refused Bluetooth, so no connection was attempted. */
type ScreenState = LinkState | 'idle' | 'noPermission';

const STATUS: Record<ScreenState, { title: string; lines: readonly string[]; canConnect: boolean }> = {
  idle: { title: 'Not connected', lines: [], canConnect: true },
  connecting: { title: 'Looking for your bangle...', lines: [], canConnect: false },
  connected: { title: 'Connected', lines: [], canConnect: false },
  disconnected: { title: 'Disconnected', lines: ['The link to your bangle dropped.'], canConnect: true },
  unsupported: { title: "This bangle can't be used", lines: ['It needs a newer version of LINKD.'], canConnect: false },
  failed: {
    title: "Couldn't find your bangle",
    lines: ['Check that Bluetooth is on and the bangle is nearby.'],
    canConnect: true,
  },
  noPermission: {
    title: 'Bluetooth is off for LINKD',
    lines: ['Turn it on in Settings, then try again.'],
    canConnect: true,
  },
};

/** Test screen for the bangle link: connects, shows link state, and lists button presses. Sends nothing. */
export function BangleScreen(): React.JSX.Element {
  const [state, setState] = useState<ScreenState>('idle');
  const [events, setEvents] = useState<readonly Frame[]>([]);

  useEffect(() => () => void transport.disconnect().catch(() => {}), []);

  async function connect(): Promise<void> {
    if ((await requestPermission('bluetooth')) === 'off') {
      setState('noPermission');
      return;
    }
    await connectBangle(transport, {
      state: setState,
      event: (event) => setEvents((shown) => [event, ...shown].slice(0, MAX_EVENTS_SHOWN)),
    });
  }

  const status = STATUS[state];
  return (
    <Screen>
      <Heading>Bangle</Heading>
      <Card title={status.title} lines={status.lines}>
        {status.canConnect && <Button label={state === 'idle' ? 'Connect' : 'Try again'} onPress={() => void connect()} />}
      </Card>
      <Body>Link test only. Pressing the bangle button here does not send an SOS.</Body>
      {events.map((event, index) => (
        // Newest first; the list only ever grows at the front, so position from the end is stable.
        <Body key={events.length - index}>{event.pressed ? 'Button pressed' : 'Button released'}</Body>
      ))}
    </Screen>
  );
}
