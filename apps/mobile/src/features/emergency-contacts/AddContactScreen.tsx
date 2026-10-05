import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorText, Field, Heading, Screen } from '../../components/ui';
import { CONTACT_FAILURE_MESSAGE } from './contactErrors';
import { addContact } from './contacts';
import { normalizePhone } from './phone';

/** Add-contact form. The number is normalized to E.164 before saving; an invalid one is never sent. */
export function AddContactScreen(): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    setError(null);
    const phoneE164 = normalizePhone(phone);
    if (phoneE164 === null) {
      setPhoneError('Enter the full number, with area code. Outside the US or Canada, start with + and the country code.');
      return;
    }
    setPhoneError(null);
    setBusy(true);
    const result = await addContact(name, phoneE164);
    setBusy(false);
    if (result.ok) {
      router.back();
    } else {
      setError(CONTACT_FAILURE_MESSAGE[result.failure]);
    }
  }

  return (
    <Screen>
      <Heading>Add a contact</Heading>
      <Field label="Name" autoCapitalize="words" autoComplete="name" maxLength={100} value={name} onChangeText={setName} />
      <Field
        label="Mobile number"
        autoComplete="tel"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        value={phone}
        onChangeText={setPhone}
      />
      {phoneError !== null && <ErrorText>{phoneError}</ErrorText>}
      {error !== null && <ErrorText>{error}</ErrorText>}
      <Button
        label="Save contact"
        disabled={busy || name.trim() === '' || phone.trim() === ''}
        onPress={() => void save()}
      />
      <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
