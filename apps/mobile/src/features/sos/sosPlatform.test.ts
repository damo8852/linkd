import { FunctionsHttpError } from '@supabase/supabase-js';
import * as LocalAuthentication from 'expo-local-authentication';

import { supabase } from '../../lib/supabase';
import { newAlertId, sendAlertRequest } from './sendAlertRequest';
import { hasScreenLock, requestUnlock } from './unlock';

// Factories, so neither the native module nor the real client (and its storage) loads.
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));
jest.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));

const auth = jest.mocked(LocalAuthentication);
const invoke = jest.mocked(supabase.functions.invoke);

beforeEach(() => jest.clearAllMocks());

describe('requestUnlock', () => {
  it('reports noLock without prompting when the phone has no screen lock', async () => {
    auth.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);

    expect(await hasScreenLock()).toBe(false);
    expect(await requestUnlock('cancel')).toBe('noLock');
    expect(auth.authenticateAsync).not.toHaveBeenCalled();
  });

  it('is unlocked only when the prompt succeeds', async () => {
    auth.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
    auth.authenticateAsync.mockResolvedValue({ success: true });

    expect(await hasScreenLock()).toBe(true);
    expect(await requestUnlock('cancel')).toBe('unlocked');
  });

  it.each(['user_cancel', 'lockout', 'timeout', 'authentication_failed', 'unknown'] as const)(
    'is failed when the prompt ends with %s',
    async (error) => {
      auth.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);
      auth.authenticateAsync.mockResolvedValue({ success: false, error });

      expect(await requestUnlock('imSafe')).toBe('failed');
    },
  );

  it('is noLock when the lock was removed before the prompt', async () => {
    auth.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.SECRET);
    auth.authenticateAsync.mockResolvedValue({ success: false, error: 'passcode_not_set' });

    expect(await requestUnlock('cancel')).toBe('noLock');
  });
});

describe('sendAlertRequest', () => {
  const alert = { id: 'aaaaaaaa-0000-4000-8000-000000000001', trigger: 'inApp' as const, triggeredAt: 1_790_000_000_000 };
  const httpError = (status: number): FunctionsHttpError => new FunctionsHttpError({ status });

  it('posts the alert to send-alert and reports delivered', async () => {
    invoke.mockResolvedValue({ data: {}, error: null });

    expect(await sendAlertRequest(alert)).toBe('delivered');
    expect(invoke).toHaveBeenCalledWith('send-alert', {
      body: { id: alert.id, trigger: 'inApp', triggeredAt: new Date(alert.triggeredAt).toISOString(), location: null },
    });
  });

  it('reports noContacts for 422, which a retry cannot fix', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(422) });
    expect(await sendAlertRequest(alert)).toBe('noContacts');
  });

  it.each([400, 401, 500, 502])('reports failed for HTTP %i so the caller retries', async (status) => {
    invoke.mockResolvedValue({ data: null, error: httpError(status) });
    expect(await sendAlertRequest(alert)).toBe('failed');
  });

  it('reports failed for a network error', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Failed to send a request to the Edge Function') });
    expect(await sendAlertRequest(alert)).toBe('failed');
  });
});

describe('newAlertId', () => {
  it('is a UUID the send-alert function accepts, and unique', () => {
    // Same pattern as parseAlertInput in supabase/functions/send-alert/sendAlert.ts.
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const ids = new Set(Array.from({ length: 50 }, newAlertId));

    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(id).toMatch(uuid);
      expect(id[14]).toBe('4');
    }
  });
});
