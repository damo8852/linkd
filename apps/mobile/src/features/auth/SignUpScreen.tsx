import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { theme } from '../../lib/theme';
import { signUp } from './auth';
import { AUTH_FAILURE_MESSAGE, MIN_PASSWORD_LENGTH } from './authErrors';
import { Body, Button, EmailField, ErrorText, PasswordField, Screen, TextLink } from './ui';

/**
 * Create-account form. Locally the new account is signed in at once and the root
 * layout's guard takes over; hosted projects confirm the email first, so the
 * screen says to check the inbox.
 */
export function SignUpScreen(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function submit(): Promise<void> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(AUTH_FAILURE_MESSAGE.weak_password);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await signUp(email.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(AUTH_FAILURE_MESSAGE[result.failure]);
    } else if (result.needsConfirmation) {
      setConfirmSent(true);
    }
  }

  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.wordmark}>
        LINKD
      </Text>
      <Body>One press. Your people know.</Body>
      {confirmSent ? (
        <Body>Check your email and open the link to confirm your account. Then sign in.</Body>
      ) : (
        <>
          <EmailField value={email} onChangeText={setEmail} />
          <PasswordField
            isNew
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            onChangeText={setPassword}
          />
          {error !== null && <ErrorText>{error}</ErrorText>}
          <Button
            label="Create account"
            disabled={busy || email.trim() === '' || password === ''}
            onPress={() => void submit()}
          />
        </>
      )}
      <TextLink label="I already have an account" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}

// Dark-only theme is constant, so StyleSheet can read it at module load.
const styles = StyleSheet.create({
  wordmark: {
    color: theme.color.accent,
    fontFamily: theme.font.display,
    fontSize: theme.fontSize['3xl'],
  },
});
