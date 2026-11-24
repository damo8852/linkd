import type { Frame } from '@linkd/ble-protocol';
import { useState } from 'react';

import { Body, Button, Card, Heading, Screen } from '../../components/ui';
import type { LinkState } from '../../lib/ble/bangleLink';
import { pairBangle, useBangle } from './bangle';

/** `noPermission`: the OS refused Bluetooth, so no connection was attempted. */
type ScreenState = LinkState | 'idle' | 'noPermission';

const STATUS: Record<ScreenState, { title: string; lines: readonly string[]; canConnect: boolean }> = {
  idle: { title: 'Not connected', lines: ['Your bangle cannot send an SOS until it is connected.'], canConnect: true },
  connecting: { title: 'Looking for your bangle...', lines: [], canConnect: false },
  connected: { title: 'Connected', lines: [], canConnect: false },
  disconnected: {
    title: 'Link lost, reconnecting',
    lines: ['If it does not come back, LINKD starts an SOS countdown.'],
    canConnect: false,
  },
  unsupported: { title: "This bangle can't be used", lines: ['It needs a newer version of LINKD.'], canConnect: false },
  failed: {
    title: "Can't find your bangle yet",
    lines: ['Still looking. Check that Bluetooth is on and the bangle is nearby.'],
    canConnect: false,
  },
  noPermission: {
    title: 'Bluetooth is off for LINKD',
    lines: ['Turn it on in Settings, then try again.'],
    canConnect: true,
  },
};

/**
 * The bangle link: connect once, and LINKD keeps it connected (and reconnects after drops and at
 * launch). Shows the link state and, for diagnostics, the latest frames from the bangle.
 */
export function BangleScreen(): React.JSX.Element {
  const { link, frames } = useBangle();
  const [refused, setRefused] = useState(false);

  async function connect(): Promise<void> {
    setRefused(!(await pairBangle()));
  }

  const state: ScreenState = refused && link === 'idle' ? 'noPermission' : link;
  const status = STATUS[state];
  return (
    <Screen>
      <Heading>Bangle</Heading>
      <Card title={status.title} lines={status.lines}>
        {status.canConnect && <Button label={state === 'idle' ? 'Connect' : 'Try again'} onPress={() => void connect()} />}
      </Card>
      <Body>Holding the bangle button for 3 seconds starts an SOS countdown, as the SOS button does.</Body>
      {frames.map((frame, index) => (
        // Newest first; the list only ever grows at the front, so position from the end is stable.
        <Body key={frames.length - index}>{describeFrame(frame)}</Body>
      ))}
    </Screen>
  );
}

/** What a frame says, for this diagnostic list only. The SOS meaning is applied by bangleSession.ts. */
function describeFrame(frame: Frame): string {
  switch (frame.type) {
    case 'button':
      return frame.pressed ? 'Button pressed' : 'Button released';
    case 'sosTrigger':
      return `SOS hold received (${frame.seq})`;
    case 'batteryCritical':
      return 'Battery critical';
  }
}
