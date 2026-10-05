import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { signOut } from '../src/features/auth/auth';
import { Button } from '../src/features/auth/ui';
import { theme } from '../src/lib/theme';

/** Placeholder home route. The real home screen shows link and battery status. */
export default function HomeScreen(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>LINKD</Text>
        <Text style={styles.tagline}>One press. Your people know.</Text>
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
