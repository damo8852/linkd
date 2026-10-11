import { Linking } from 'react-native';

import { Button, Card, Heading, Screen } from '../../components/ui';
import {
  PERMISSION_COPY,
  PERMISSION_IDS,
  requestPermission,
  usePermissionStates,
  type PermissionId,
} from '../onboarding/permissions';

/** Settings: each permission's state in words, what is not working while it is off, and a way to turn it on. */
export function SettingsScreen(): React.JSX.Element {
  const { states, reload } = usePermissionStates();

  async function turnOn(id: PermissionId): Promise<void> {
    // Once refused, the OS no longer prompts; the only way left is the system settings.
    if ((await requestPermission(id)) !== 'granted') {
      await Linking.openSettings();
    }
    await reload();
  }

  return (
    <Screen>
      <Heading>Settings</Heading>
      {states !== null &&
        PERMISSION_IDS.map((id) => {
          const { name, withoutIt } = PERMISSION_COPY[id];
          const state = states[id];
          if (state === 'granted') {
            return <Card key={id} title={`${name}: On`} lines={[]} />;
          }
          if (state === 'later') {
            return <Card key={id} title={`${name}: Not asked yet`} lines={['Your phone will ask when you pair your bangle.']} />;
          }
          return (
            <Card key={id} title={`${name}: Off`} lines={withoutIt}>
              <Button label={`Turn on ${name}`} onPress={() => void turnOn(id)} />
            </Card>
          );
        })}
    </Screen>
  );
}
