import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '../src/features/auth/auth';
import { refreshContacts } from '../src/features/emergency-contacts/contacts';
import { SosOverlay } from '../src/features/sos/SosOverlay';
import { theme } from '../src/lib/theme';

export default function RootLayout(): React.JSX.Element | null {
  const { loading, signedIn } = useSession();

  // Keep the offline contacts cache current from app start and sign-in, not only when the
  // contacts screen is opened. Signing in as another account replaces the cache here.
  useEffect(() => {
    if (signedIn) {
      void refreshContacts();
    }
  }, [signedIn]);

  // Render nothing until the stored session is read, so a signed-in user never sees the sign-in screen flash.
  if (loading) {
    return null;
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.color.bg },
          headerTintColor: theme.color.text,
          contentStyle: { backgroundColor: theme.color.bg },
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" options={{ title: 'LINKD' }} />
          <Stack.Screen name="contacts/index" options={{ title: 'Contacts' }} />
          <Stack.Screen name="contacts/add" options={{ title: 'Add a contact' }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
          <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
        </Stack.Protected>
        {/* Outside both guards: verifying the reset code signs the user in mid-flow. */}
        <Stack.Screen name="reset-password" options={{ title: 'Reset password' }} />
      </Stack>
      {/* Above every route: a countdown or live alert takes over the screen from anywhere. */}
      <SosOverlay />
    </>
  );
}
