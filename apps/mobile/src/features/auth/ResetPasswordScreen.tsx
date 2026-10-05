import { useRouter } from 'expo-router';
import { useState } from 'react';

import { requestPasswordReset, setNewPassword, verifyResetCode } from './auth';
import { AUTH_FAILURE_MESSAGE, MIN_PASSWORD_LENGTH } from './authErrors';
import { Body, Button, EmailField, ErrorText, Field, Heading, PasswordField, Screen, TextLink } from '../../components/ui';

/**
 * Password reset by emailed 6-digit code: ask for the email, then the code and a
 * new password. Verifying the code signs the user in, so this route stays
 * reachable in both auth states and leaves for home only once the password is set.
 */
export function ResetPasswordScreen(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  // The code is single use: once it is accepted, a retry must only set the password.
  const [codeVerified, setCodeVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await requestPasswordReset(email.trim());
    setBusy(false);
    if (result.ok) {
      setCodeSent(true);
    } else {
      setError(AUTH_FAILURE_MESSAGE[result.failure]);
    }
  }

  async function savePassword(): Promise<void> {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(AUTH_FAILURE_MESSAGE.weak_password);
      return;
    }
    setBusy(true);
    setError(null);
    let result = codeVerified ? ({ ok: true } as const) : await verifyResetCode(email.trim(), code.trim());
    if (result.ok) {
      setCodeVerified(true);
      result = await setNewPassword(password);
    }
    setBusy(false);
    if (result.ok) {
      router.replace('/');
    } else {
      setError(AUTH_FAILURE_MESSAGE[result.failure]);
    }
  }

  if (!codeSent) {
    return (
      <Screen>
        <Heading>Reset your password</Heading>
        <Body>We will email you a 6-digit code.</Body>
        <EmailField value={email} onChangeText={setEmail} />
        {error !== null && <ErrorText>{error}</ErrorText>}
        <Button label="Email me a code" disabled={busy || email.trim() === ''} onPress={() => void sendCode()} />
        <TextLink label="Back to sign in" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Heading>Check your email</Heading>
      <Body>If that email has an account, we sent it a 6-digit code. Enter it with your new password.</Body>
      {!codeVerified && (
        <Field
          label="6-digit code"
          autoComplete="one-time-code"
          keyboardType="number-pad"
          maxLength={6}
          textContentType="oneTimeCode"
          value={code}
          onChangeText={setCode}
        />
      )}
      <PasswordField
        isNew
        label="New password"
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
        value={password}
        onChangeText={setPassword}
      />
      {error !== null && <ErrorText>{error}</ErrorText>}
      <Button
        label="Save new password"
        disabled={busy || (!codeVerified && code.trim() === '') || password === ''}
        onPress={() => void savePassword()}
      />
      {!codeVerified && <TextLink label="Send a new code" onPress={() => void sendCode()} />}
    </Screen>
  );
}
