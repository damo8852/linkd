import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut } from '../src/features/auth/auth';
import { Banner, Button } from '../src/components/ui';
import { useContacts } from '../src/features/emergency-contacts/contacts';
import { useHasScreenLock, useSos } from '../src/features/sos/sos';
import { SosButton } from '../src/features/sos/SosButton';
import { theme } from '../src/lib/theme';

/** Placeholder home route. The real home screen shows link and battery status. */
export default function HomeScreen(): React.JSX.Element {
  const router = useRouter();
  const { contacts, loading } = useContacts();
  const hasActiveContact = contacts.some((contact) => contact.status === 'active');
  const { hold } = useSos();
  const hasScreenLock = useHasScreenLock();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>LINKD</Text>
        <Text style={styles.tagline}>One press. Your people know.</Text>
        {!loading && !hasActiveContact && <Banner tone="warn">No one will be texted if you send an SOS.</Banner>}
        {hasScreenLock === false && (
          <Banner tone="warn">Set a screen lock on this phone. Without one, anyone holding it can cancel your SOS.</Banner>
        )}
        <SosButton onHold={() => hold('inApp')} />
        <Button label="Contacts" onPress={() => router.push('/contacts')} />
        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      </View>
    </SafeAreaView>
  );
}

// Dark-only theme is constant, so StyleSheet can read it at module load.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.sm,
    padding: theme.space.lg,
  },
  title: {
    color: theme.color.accent,
    fontFamily: theme.font.display,
    fontSize: theme.fontSize['3xl'],
  },
  tagline: {
    color: theme.color.text,
    fontSize: theme.fontSize.base,
  },
});
