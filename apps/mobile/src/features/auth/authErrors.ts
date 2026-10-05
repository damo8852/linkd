import { isAuthError, isAuthRetryableFetchError, isAuthWeakPasswordError } from '@supabase/supabase-js';

export const MIN_PASSWORD_LENGTH = 8;

export type AuthFailure =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'invalid_email'
  | 'weak_password'
  | 'invalid_code'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export type AuthResult = { ok: true } | { ok: false; failure: AuthFailure };

/** Maps a Supabase auth error to the failure the screens know how to explain. Never logs the error. */
export function classifyAuthError(error: unknown): AuthFailure {
  if (isAuthRetryableFetchError(error)) {
    return 'network';
  }
  if (isAuthWeakPasswordError(error)) {
    return 'weak_password';
  }
  if (!isAuthError(error)) {
    return 'unknown';
  }
  switch (error.code) {
    case 'invalid_credentials':
      return 'invalid_credentials';
    case 'email_not_confirmed':
      return 'email_not_confirmed';
    case 'email_address_invalid':
    case 'validation_failed':
      return 'invalid_email';
    case 'weak_password':
    case 'same_password':
      return 'weak_password';
    case 'otp_expired':
      return 'invalid_code';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'rate_limited';
    default:
      return 'unknown';
  }
}

/** What to show for each failure. Every message says what to do next. */
export const AUTH_FAILURE_MESSAGE: Record<AuthFailure, string> = {
  invalid_credentials: "That email and password don't match. Try again or reset your password.",
  email_not_confirmed: 'Confirm your email first. Open the link we sent you, then sign in.',
  invalid_email: 'That email address does not look right. Check it and try again.',
  weak_password: `Choose a different password with at least ${MIN_PASSWORD_LENGTH} characters.`,
  invalid_code: 'That code is wrong or has expired. Check it or send a new one.',
  rate_limited: 'Too many tries. Wait a minute, then try again.',
  network: "Can't reach LINKD. Check your connection and try again.",
  unknown: 'Something went wrong. Try again.',
};
