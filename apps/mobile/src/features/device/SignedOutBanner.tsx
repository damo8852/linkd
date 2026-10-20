import { useState } from 'react';

import { Banner, Button, ErrorText } from '../../components/ui';
import { useSos } from '../sos/sos';
import { SosButton } from '../sos/SosButton';
import { removeThisPhone, useArmed } from './device';

/**
 * Shown while signed out on a phone that is still armed: says so, keeps the in-app SOS button
 * within reach (the signed-out routes have no home screen), and offers the only way to disarm it.
 */
export function SignedOutBanner(): React.JSX.Element | null {
  const { armed, recheck } = useArmed();
  const [message, setMessage] = useState<string | null>(null);
  const { hold } = useSos();

  async function remove(): Promise<void> {
    const result = await removeThisPhone();
    setMessage(
      result === 'locked'
        ? 'Unlock your phone to remove this device.'
        : result === 'removedOffline'
          ? 'This phone no longer sends SOS alerts. It is still listed in your account until you remove it in Settings.'
          : null,
    );
    recheck();
  }

  return (
    <>
      {armed === true && (
        <>
          <Banner tone="info">Signed out, your bangle still works. An SOS will still reach your contacts.</Banner>
          <SosButton onHold={() => hold('inApp')} />
          <Button variant="ghost" label="Remove this device" onPress={() => void remove()} />
        </>
      )}
      {message !== null && <ErrorText>{message}</ErrorText>}
    </>
  );
}
