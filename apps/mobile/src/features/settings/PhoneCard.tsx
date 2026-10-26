import { useState } from 'react';

import { Button, Card, ErrorText, Field } from '../../components/ui';
import { formatPhone } from '../emergency-contacts/phone';
import { usePhoneVerification, type ConfirmResult, type SendCodeResult } from './phoneVerification';

const WHY = 'Your contacts and dispatch call you back on this number. Verify it so you know it reaches you.';

const SEND_PROBLEM: Partial<Record<SendCodeResult, string>> = {
  tooSoon: 'A code was just sent. Wait a minute before asking for another.',
  tooMany: 'Too many codes today. Try again tomorrow.',
  failed: "Couldn't send a code. Check your connection and try again.",
};

const CONFIRM_PROBLEM: Partial<Record<ConfirmResult, string>> = {
  wrong: "That code isn't right. Check the text and try again.",
  expired: 'That code has expired. Ask for a new one.',
  tooManyAttempts: 'Too many wrong tries. Ask for a new code.',
  noCode: 'That code is no longer valid. Ask for a new one.',
  failed: "Couldn't check the code. Check your connection and try again.",
};

/** Settings: the user's own number, whether it is verified, and a way to verify it by text. */
export function PhoneCard(): React.JSX.Element | null {
  const { phone, verified, sendCode, confirm } = usePhoneVerification();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Unknown is shown as nothing rather than a guess either way.
  if (phone === null || verified === null) {
    return null;
  }
  if (verified) {
    return <Card title="Your number: Verified" lines={[formatPhone(phone)]} />;
  }

  async function send(): Promise<void> {
    setBusy(true);
    setProblem(null);
    const result = await sendCode();
    if (result === 'sent') setCodeSent(true);
    setProblem(SEND_PROBLEM[result] ?? null);
    setBusy(false);
  }

  async function check(): Promise<void> {
    setBusy(true);
    setProblem(null);
    const result = await confirm(code);
    setProblem(CONFIRM_PROBLEM[result] ?? null);
    setBusy(false);
  }

  return (
    <Card title="Your number: Not verified" lines={[formatPhone(phone), WHY]}>
      {codeSent && (
        <>
          <Field
            label="Code"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
          <Button label="Verify" disabled={busy || code.trim().length !== 6} onPress={() => void check()} />
        </>
      )}
      <Button
        label={codeSent ? 'Send a new code' : 'Text me a code'}
        variant={codeSent ? 'ghost' : 'primary'}
        disabled={busy}
        onPress={() => void send()}
      />
      {problem !== null && <ErrorText>{problem}</ErrorText>}
    </Card>
  );
}
