import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Body, Button, ErrorText, Heading } from '../../components/ui';
import { theme } from '../../lib/theme';
import type { SosState } from './alertMachine';

type Delivery = Extract<SosState, { kind: 'active' }>['delivery'];

const HEADING: Record<Delivery, string> = {
  pending: 'Sending SOS',
  delivered: 'SOS sent',
  failed: 'SOS not sent yet',
};

/**
 * Shown while an alert is active. Says only what actually happened: it never claims contacts
 * were texted unless the server confirmed it, and a failure is always visible.
 */
export function ActiveAlertScreen({
  delivery,
  noContacts,
  endsAt,
  onImSafe,
  now = Date.now,
}: {
  delivery: Delivery;
  noContacts: boolean;
  endsAt: number;
  /** Resolves false when the unlock failed. */
  onImSafe: () => Promise<boolean>;
  now?: () => number;
}): React.JSX.Element {
  const [, redraw] = useState(0);
  const [stillActive, setStillActive] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => redraw((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.max(1, Math.ceil((endsAt - now()) / 60_000));

  return (
    <View style={styles.screen}>
      <Heading>{HEADING[delivery]}</Heading>
      {delivery === 'pending' && <Body>Texting your contacts now.</Body>}
      {delivery === 'delivered' && <Body>Your contacts were texted.</Body>}
      {delivery === 'failed' && (
        <Banner tone="warn">
          {noContacts
            ? 'You have no emergency contacts, so no one was texted. Call for help another way.'
            : 'Could not reach LINKD. Trying again every few seconds. Call or text someone yourself if you can.'}
        </Banner>
      )}

      <View style={styles.spacer} />

      {stillActive && <ErrorText>Still active. Unlock your phone to end the alert.</ErrorText>}
      <Button
        label="I'm safe"
        onPress={() => {
          setStillActive(false);
          void onImSafe().then((ended) => setStillActive(!ended));
        }}
      />
      <Text style={styles.small}>{`Ends by itself in ${minutes} min.`}</Text>
    </View>
  );
}

// Dark-only theme is constant, so StyleSheet can read it at module load.
const styles = StyleSheet.create({
  screen: { flex: 1, gap: theme.space.md, padding: theme.space.lg },
  spacer: { flex: 1 },
  small: { color: theme.color.textMuted, fontSize: theme.fontSize.xs, textAlign: 'center' },
});
