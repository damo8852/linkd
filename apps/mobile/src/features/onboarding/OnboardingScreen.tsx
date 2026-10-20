import { useState } from 'react';
import { Platform } from 'react-native';

import { Banner, Body, Button, Card, ErrorText, Field, Heading, Screen, TextLink } from '../../components/ui';
import { normalizePhone } from '../emergency-contacts/phone';
import { DispatchSwitch } from '../settings/DispatchSwitch';
import { asksLater, PERMISSION_COPY, PERMISSION_IDS, requestPermission, type PermissionId } from './permissions';
import { createProfile } from './profile';

const STEPS = ['profile', ...PERMISSION_IDS, 'dispatch'] as const;

/**
 * First-run flow: who you are, one explained screen per permission, then who gets the SOS.
 * Nothing is saved until Finish, so a profile row means onboarding was completed.
 */
export function OnboardingScreen(): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneAgain, setPhoneAgain] = useState('');
  const [phoneE164, setPhoneE164] = useState('');
  const [dispatch, setDispatch] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const step = STEPS[index] ?? 'dispatch';

  function confirmProfile(): void {
    const normalized = normalizePhone(phone);
    if (normalized === null) {
      setError('Enter your full number, with area code. Outside the US or Canada, start with + and the country code.');
      return;
    }
    if (normalizePhone(phoneAgain) !== normalized) {
      setError('The two numbers do not match. Check both.');
      return;
    }
    setError(null);
    setPhoneE164(normalized);
    setIndex(index + 1);
  }

  async function allow(id: PermissionId, ask: boolean): Promise<void> {
    const state = ask ? await requestPermission(id) : 'off';
    // Background location cannot be granted without location, so that step is not offered.
    setIndex(index + (id === 'location' && state !== 'granted' ? 2 : 1));
  }

  async function finish(): Promise<void> {
    setError(null);
    setBusy(true);
    const saved = await createProfile(name, phoneE164, dispatch);
    setBusy(false);
    if (!saved) {
      setError("Couldn't save. Check your connection and try again.");
    }
  }

  return (
    <Screen>
      <Body>{`Step ${index + 1} of ${STEPS.length}`}</Body>

      {step === 'profile' && (
        <>
          <Heading>About you</Heading>
          <Body>Your contacts see this in the SOS text so they know who needs help and how to call you.</Body>
          <Field label="Your name" autoCapitalize="words" autoComplete="name" maxLength={100} value={name} onChangeText={setName} />
          <Field
            label="Your mobile number"
            autoComplete="tel"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            value={phone}
            onChangeText={setPhone}
          />
          <Field label="Type it again" keyboardType="phone-pad" value={phoneAgain} onChangeText={setPhoneAgain} />
          {error !== null && <ErrorText>{error}</ErrorText>}
          <Button
            label="Continue"
            disabled={name.trim() === '' || phone.trim() === '' || phoneAgain.trim() === ''}
            onPress={confirmProfile}
          />
        </>
      )}

      {step !== 'profile' && step !== 'dispatch' && (
        <>
          <Heading>{PERMISSION_COPY[step].title}</Heading>
          <Card title="With it" lines={PERMISSION_COPY[step].withIt} />
          <Card title="Without it" lines={PERMISSION_COPY[step].withoutIt} />
          {step === 'bluetooth' && Platform.OS === 'ios' && (
            <Banner tone="info">
              Do not swipe LINKD closed. Your iPhone will not reopen it, and your bangle cannot send an SOS until you open
              LINKD again.
            </Banner>
          )}
          {asksLater(step) ? (
            <>
              <Body>Your phone will ask for this when you pair your bangle.</Body>
              <Button label="Continue" onPress={() => void allow(step, false)} />
            </>
          ) : (
            <>
              <Button label={PERMISSION_COPY[step].title} onPress={() => void allow(step, true)} />
              <TextLink label="Not now" onPress={() => void allow(step, false)} />
            </>
          )}
        </>
      )}

      {step === 'dispatch' && (
        <>
          <Heading>Who gets your SOS</Heading>
          <Card title="Your contacts: always" lines={['A text with your location, every time.']} />
          <DispatchSwitch value={dispatch} onChange={setDispatch} />
          <Card
            title="Signing out does not turn LINKD off"
            lines={['This phone keeps sending SOS alerts for your account until you remove it in Settings.']}
          />
          {error !== null && <ErrorText>{error}</ErrorText>}
          <Button label="Finish" disabled={busy} onPress={() => void finish()} />
          <Body>You can change this in Settings.</Body>
        </>
      )}
    </Screen>
  );
}
