import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Banner, Body, Button, ErrorText, Heading, Screen, TextLink } from '../../components/ui';
import { theme } from '../../lib/theme';
import { CONTACT_FAILURE_MESSAGE, MAX_ACTIVE_CONTACTS } from './contactErrors';
import { removeContact, useContacts } from './contacts';
import type { Contact } from './contactsCache';
import { formatPhone } from './phone';

/** The emergency contacts list: who is texted on an SOS, who opted out, and the limit of five. */
export function ContactsScreen(): React.JSX.Element {
  const router = useRouter();
  const { contacts, loading, fresh, reload } = useContacts();
  const [error, setError] = useState<string | null>(null);

  const active = contacts.filter((contact) => contact.status === 'active');
  const optedOut = contacts.filter((contact) => contact.status !== 'active');
  const atLimit = active.length >= MAX_ACTIVE_CONTACTS;

  function confirmRemove(contact: Contact): void {
    Alert.alert(`Remove ${contact.name}?`, 'They will no longer be texted when you send an SOS.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async (): Promise<void> => {
            setError(null);
            const result = await removeContact(contact.id);
            if (!result.ok) {
              setError(CONTACT_FAILURE_MESSAGE[result.failure]);
            }
            await reload();
          })();
        },
      },
    ]);
  }

  return (
    <Screen>
      <View style={styles.row}>
        <Heading>Contacts</Heading>
        <Body>{`${active.length} of ${MAX_ACTIVE_CONTACTS}`}</Body>
      </View>

      {!loading && !fresh && (
        <Banner tone="info">{"Showing your saved contacts. Can't reach LINKD to check for changes."}</Banner>
      )}
      {!loading && active.length === 0 && <Banner tone="warn">No one will be texted if you send an SOS.</Banner>}
      {!loading && contacts.length === 0 && (
        <Body>Add the people you trust to come for you. They get a text when you send an SOS.</Body>
      )}

      {active.map((contact) => (
        <View key={contact.id} style={[styles.card, styles.row]}>
          <ContactLabel contact={contact} />
          <TextLink label="Remove" accessibilityLabel={`Remove ${contact.name}`} onPress={() => confirmRemove(contact)} />
        </View>
      ))}

      {optedOut.map((contact) => (
        <View key={contact.id} style={styles.card}>
          <View style={styles.row}>
            <ContactLabel contact={contact} />
            <Text style={styles.badge}>Opted out</Text>
          </View>
          <Text style={styles.small}>{`${contact.name} replied STOP and will not be texted.`}</Text>
        </View>
      ))}

      {error !== null && <ErrorText>{error}</ErrorText>}
      <Button
        label={contacts.length === 0 ? 'Add your first contact' : 'Add a contact'}
        disabled={atLimit}
        onPress={() => router.push('/contacts/add')}
      />
      {atLimit && <Text style={styles.small}>{CONTACT_FAILURE_MESSAGE.limit}</Text>}
    </Screen>
  );
}

function ContactLabel({ contact }: { contact: Contact }): React.JSX.Element {
  return (
    <View style={styles.who}>
      <Text style={styles.name}>{contact.name}</Text>
      <Text style={styles.small}>{formatPhone(contact.phone_e164)}</Text>
    </View>
  );
}

// Dark-only theme is constant, so StyleSheet can read it at module load.
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.sm },
  card: {
    padding: theme.space.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.color.surface,
    gap: theme.space.xs,
  },
  who: { flex: 1, gap: theme.space.xs },
  name: { color: theme.color.text, fontSize: theme.fontSize.base, fontWeight: '600' },
  small: { color: theme.color.textMuted, fontSize: theme.fontSize.sm },
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
});
