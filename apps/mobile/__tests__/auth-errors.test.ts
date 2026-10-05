import { AuthApiError, AuthRetryableFetchError, AuthWeakPasswordError } from '@supabase/supabase-js';

import { classifyAuthError } from '../src/features/auth/authErrors';

describe('classifyAuthError', () => {
  it.each([
    ['invalid_credentials', 'invalid_credentials'],
    ['email_not_confirmed', 'email_not_confirmed'],
    ['otp_expired', 'invalid_code'],
    ['over_email_send_rate_limit', 'rate_limited'],
    ['unexpected_failure', 'unknown'],
  ])('maps the %s code to %s', (code, failure) => {
    expect(classifyAuthError(new AuthApiError('msg', 400, code))).toBe(failure);
  });

  it('maps a failed request to network', () => {
    expect(classifyAuthError(new AuthRetryableFetchError('Network request failed', 0))).toBe('network');
  });

  it('maps a weak password', () => {
    expect(classifyAuthError(new AuthWeakPasswordError('weak', 422, ['length']))).toBe('weak_password');
  });

  it('maps anything else to unknown', () => {
    expect(classifyAuthError(new Error('boom'))).toBe('unknown');
  });
});
