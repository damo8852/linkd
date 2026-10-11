import { Linking } from 'react-native';

import { Button, Card, ErrorText, Heading, Screen } from '../../components/ui';
import {
  PERMISSION_COPY,
  PERMISSION_IDS,
  requestPermission,
  usePermissionStates,
  type PermissionId,
} from '../onboarding/permissions';
import { DispatchSwitch } from './DispatchSwitch';
import { useDispatchSetting } from './dispatchSetting';

/** Settings: who gets the SOS, then each permission's state in words, what is not working while it is off, and a way to turn it on. */
export function SettingsScreen(): React.JSX.Element {
  const { states, reload } = usePermissionStates();
  const dispatch = useDispatchSetting();

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
      {dispatch.enabled !== null ? (
        <Card title="Who gets your SOS" lines={['Your contacts: always.']}>
          <DispatchSwitch value={dispatch.enabled} disabled={dispatch.saving} onChange={(next) => void dispatch.change(next)} />
          {dispatch.saveFailed && (
            <ErrorText>
              {`Couldn't save. Emergency dispatch is still ${dispatch.enabled ? 'on' : 'off'}. Check your connection and try again.`}
            </ErrorText>
          )}
        </Card>
      ) : (
        !dispatch.loading && (
          <Card title="Who gets your SOS" lines={["Couldn't load your dispatch setting. Check your connection."]}>
            <Button label="Try again" onPress={() => void dispatch.reload()} />
          </Card>
        )
      )}
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
