import { useEffect, useState } from 'react';

import { Body, Button, Card, ErrorText } from '../../components/ui';
import { listDevices, removeOtherDevice, removeThisPhone, type Device } from './device';

/** Settings: the phones armed for this account, and the only way to disarm one. */
export function DevicesCard(): React.JSX.Element {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      setDevices(await listDevices());
    } catch {
      setError('Could not load your devices. Check your connection.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(device: Device): Promise<void> {
    setError(null);
    if (device.thisPhone) {
      // On success the phone signs out and the root layout leaves this screen.
      if ((await removeThisPhone()) === 'locked') {
        setError('Unlock your phone to remove this device.');
      }
      return;
    }
    if (!(await removeOtherDevice(device.id))) {
      setError('Could not remove that device. It can still send an SOS for your account.');
    }
    await load();
  }

  return (
    <Card
      title="Devices"
      lines={['A phone here sends SOS alerts for your account even when it is signed out. Removing it is the only way to turn that off.']}
    >
      {devices?.map((device) => (
        <Button
          key={device.id}
          variant="ghost"
          label={device.thisPhone ? 'Remove this device' : `Remove ${device.name}`}
          onPress={() => void remove(device)}
        />
      ))}
      {devices?.length === 0 && <Body>No phone is set up to send an SOS while signed out.</Body>}
      {error !== null && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}
