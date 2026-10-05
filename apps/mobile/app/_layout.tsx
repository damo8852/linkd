import { Stack } from 'expo-router';

import { useSession } from '../src/features/auth/auth';
import { theme } from '../src/lib/theme';

export default function RootLayout(): React.JSX.Element | null {
  const { loading, signedIn } = useSession();

  // Render nothing until the stored session is read, so a signed-in user never sees the sign-in screen flash.
  if (loading) {
    return null;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.color.bg },
        headerTintColor: theme.color.text,
        contentStyle: { backgroundColor: theme.color.bg },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: 'LINKD' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
        <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
      </Stack.Protected>
      {/* Outside both guards: verifying the reset code signs the user in mid-flow. */}
      <Stack.Screen name="reset-password" options={{ title: 'Reset password' }} />
    </Stack>
  );
}
