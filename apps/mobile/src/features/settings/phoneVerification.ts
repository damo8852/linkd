import { FunctionsHttpError } from '@supabase/supabase-js';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { supabase } from '../../lib/supabase';

export type SendCodeResult = 'sent' | 'verified' | 'tooSoon' | 'tooMany' | 'failed';
export type ConfirmResult = 'verified' | 'wrong' | 'expired' | 'tooManyAttempts' | 'noCode' | 'failed';

const CONFIRM: Record<string, ConfirmResult> = {
  verified: 'verified',
  wrong: 'wrong',
  expired: 'expired',
  too_many_attempts: 'tooManyAttempts',
  no_code: 'noCode',
};

/** The user's own number and whether the server has verified it, or null when it could not be read. Never throws. */
async function loadPhone(): Promise<{ phone: string; verified: boolean } | null> {
  try {
    const { data, error } = await supabase.from('profiles').select('phone_e164, phone_verified').maybeSingle();
    return error || !data ? null : { phone: data.phone_e164, verified: data.phone_verified };
  } catch {
    return null;
  }
}

/** Asks verify-phone to text a code to the user's own number. Never throws: any other error is `failed`. */
async function sendCode(): Promise<SendCodeResult> {
  try {
    const { data, error } = await supabase.functions.invoke('verify-phone', { body: {} });
    if (!error) {
      // `data` is the parsed JSON body; supabase-js types it as `any`.
      return (data as { verified?: boolean } | null)?.verified ? 'verified' : 'sent';
    }
    if (error instanceof FunctionsHttpError) {
      // `context` is the fetch Response for an HTTP error; supabase-js types it as `any`.
      const body = (await (error.context as Response).json().catch(() => ({}))) as { error?: string };
      if (body.error === 'too_soon') return 'tooSoon';
      if (body.error === 'too_many') return 'tooMany';
    }
    return 'failed';
  } catch {
    return 'failed';
  }
}

/** Checks a code with the server, which alone can mark the number verified. Never throws. */
async function confirmCode(code: string): Promise<ConfirmResult> {
  try {
    const { data, error } = await supabase.rpc('confirm_phone_code', { p_code: code });
    return error ? 'failed' : (CONFIRM[data] ?? 'failed');
  } catch {
    return 'failed';
  }
}

/**
 * The user's own number and its verified flag as the server last reported them. `verified` is
 * null until read and stays null if it cannot be, so no screen claims either way. A confirmed
 * code reloads from the server rather than assuming.
 */
export function usePhoneVerification(): {
  phone: string | null;
  verified: boolean | null;
  sendCode: () => Promise<SendCodeResult>;
  confirm: (code: string) => Promise<ConfirmResult>;
} {
  const [state, setState] = useState<{ phone: string; verified: boolean } | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setState(await loadPhone());
  }, []);

  // Re-read on focus, so home drops its banner once the number is verified in Settings.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const send = useCallback(async (): Promise<SendCodeResult> => {
    const result = await sendCode();
    if (result === 'verified') await reload();
    return result;
  }, [reload]);

  const confirm = useCallback(
    async (code: string): Promise<ConfirmResult> => {
      const result = await confirmCode(code);
      if (result === 'verified') await reload();
      return result;
    },
    [reload],
  );

  return { phone: state?.phone ?? null, verified: state?.verified ?? null, sendCode: send, confirm };
}
