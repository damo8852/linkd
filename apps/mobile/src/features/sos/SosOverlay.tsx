import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { theme } from '../../lib/theme';
import { ActiveAlertScreen } from './ActiveAlertScreen';
import { CountdownScreen } from './CountdownScreen';
import { useAlertRecipients } from './recipients';
import { useSos } from './sos';

/**
 * Covers whatever route is showing while a countdown or an alert is live, so the user never
 * has to navigate to cancel. Renders nothing otherwise.
 */
export function SosOverlay(): React.JSX.Element | null {
  const { snapshot, cancel, imSafe, textContacts } = useSos();
  const { state } = snapshot;
  const recipients = useAlertRecipients(snapshot.alertId);

  if (state.kind !== 'cancelWindow' && state.kind !== 'active') {
    return null;
  }

  return (
    <SafeAreaView accessibilityViewIsModal style={[StyleSheet.absoluteFill, styles.overlay]}>
      {state.kind === 'cancelWindow' ? (
        <CountdownScreen state={state} onCancel={cancel} />
      ) : (
        <ActiveAlertScreen
          delivery={state.delivery}
          noContacts={snapshot.noContacts}
          endsAt={state.endsAt}
          onImSafe={imSafe}
          fallback={snapshot.fallback}
          onTextContacts={textContacts}
          recipients={recipients}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: theme.color.bg },
});
