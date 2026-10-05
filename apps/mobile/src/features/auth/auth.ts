import { useEffect, useState } from 'react';

import { supabase } from '../../lib/supabase';
import { classifyAuthError, type AuthResult } from './authErrors';

function toResult(error: unknown): AuthResult {
  return error ? { ok: false, failure: classifyAuthError(error) } : { ok: true };
}

/** Signs in with email + password. */
export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return toResult(error);
}

/**
 * Creates an account. `needsConfirmation` is true when the project requires the
 * email to be confirmed before the first sign-in (hosted), so no session exists yet.
 */
export async function signUp(
  email: string,
  password: string,
): Promise<AuthResult & { needsConfirmation?: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return error ? toResult(error) : { ok: true, needsConfirmation: data.session === null };
}

/** Emails a 6-digit reset code. Succeeds whether or not the email has an account. */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return toResult(error);
}

/** Exchanges the emailed reset code for a session. The code is single use. */
export async function verifyResetCode(email: string, code: string): Promise<AuthResult> {
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
  return toResult(error);
}

/** Sets a new password for the signed-in user (after `verifyResetCode`). */
export async function setNewPassword(password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.updateUser({ password });
  return toResult(error);
}

/**
 * Signs out. The local session is removed even when the server cannot be reached.
 * Sign-out must never clear the SOS cache or alert token; only removing the device disarms a phone.
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/** Whether a session exists. `loading` is true until the stored session has been read. */
export function useSession(): { loading: boolean; signedIn: boolean } {
  const [state, setState] = useState({ loading: true, signedIn: false });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ loading: false, signedIn: session !== null });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return state;
}
