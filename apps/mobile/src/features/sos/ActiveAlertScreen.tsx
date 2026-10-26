import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Body, Button, ErrorText, Heading } from '../../components/ui';
import { theme } from '../../lib/theme';
import type { SosState } from './alertMachine';
import { recipientStatus, type Recipient } from './recipients';
import type { FallbackResult } from './smsFallback';

type Delivery = Extract<SosState, { kind: 'active' }>['delivery'];

const FALLBACK_PROBLEM: Partial<Record<FallbackResult, string>> = {
  unavailable: "This phone can't open a text message. Call for help another way.",
  noContacts: 'No contacts are saved on this phone to text. Call for help another way.',
};

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
  fallback,
  onTextContacts,
  recipients,
  now = Date.now,
}: {
  delivery: Delivery;
  noContacts: boolean;
  endsAt: number;
  /** Resolves false when the unlock failed. */
  onImSafe: () => Promise<boolean>;
  /** What the SMS composer fallback did, or null if it has not run. */
  fallback: FallbackResult | null;
  /** Opens the native SMS composer to the cached contacts again. */
  onTextContacts: () => Promise<void>;
  /** Each contact's status, or null when it cannot be read (then only the overall status shows). */
  recipients: Recipient[] | null;
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
      {recipients?.map((recipient) => {
        const status = recipientStatus(recipient);
        return (
          <View
            key={recipient.phone_e164}
            accessible
            accessibilityLabel={`${recipient.name}: ${status}`}
            style={styles.row}
          >
            <Text style={styles.name}>{recipient.name}</Text>
            <Text style={styles.badge}>{status}</Text>
          </View>
        );
      })}
      {delivery === 'failed' && fallback !== null && FALLBACK_PROBLEM[fallback] !== undefined && (
        <ErrorText>{FALLBACK_PROBLEM[fallback]}</ErrorText>
      )}
      {delivery === 'failed' && !noContacts && (
        <Button label="Text my contacts" variant="ghost" onPress={() => void onTextContacts()} />
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.sm },
  name: { flex: 1, color: theme.color.text, fontSize: theme.fontSize.base, fontWeight: '600' },
  badge: {
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space.xs,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.color.border,
    color: theme.color.text,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  small: { color: theme.color.textMuted, fontSize: theme.fontSize.xs, textAlign: 'center' },
});
