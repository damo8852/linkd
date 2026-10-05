import { useRouter } from 'expo-router';
import { useState } from 'react';

import { signIn } from './auth';
import { AUTH_FAILURE_MESSAGE } from './authErrors';
import { Button, EmailField, ErrorText, Heading, PasswordField, Screen, TextLink } from './ui';

/** Sign-in form. On success the root layout's guard swaps to the signed-in routes. */
export function SignInScreen(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await signIn(email.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setError(AUTH_FAILURE_MESSAGE[result.failure]);
    }
  }

  return (
    <Screen>
      <Heading>Welcome back</Heading>
      <EmailField value={email} onChangeText={setEmail} />
      <PasswordField value={password} onChangeText={setPassword} />
      {error !== null && <ErrorText>{error}</ErrorText>}
      <Button label="Sign in" disabled={busy || email.trim() === '' || password === ''} onPress={() => void submit()} />
      <TextLink label="Reset my password" onPress={() => router.push('/reset-password')} />
      <TextLink label="Create an account" onPress={() => router.push('/sign-up')} />
    </Screen>
  );
}
