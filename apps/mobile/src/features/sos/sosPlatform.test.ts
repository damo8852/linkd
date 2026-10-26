import { FunctionsHttpError } from '@supabase/supabase-js';
import * as LocalAuthentication from 'expo-local-authentication';

import { encryptedStorage } from '../../lib/encryptedStorage';
import { supabase } from '../../lib/supabase';
import { armRequest, disarmRequest, endAlertRequest, newAlertId, sendAlertRequest } from './sendAlertRequest';
import { hasScreenLock, requestUnlock } from './unlock';

// Factories, so neither the native module nor the real client (and its storage) loads.
jest.mock('expo-local-authentication', () => ({
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}));
jest.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('../../lib/encryptedStorage', () => ({ encryptedStorage: { getItem: jest.fn() } }));

const auth = jest.mocked(LocalAuthentication);
const invoke = jest.mocked(supabase.functions.invoke);
const getItem = jest.mocked(encryptedStorage.getItem);

beforeEach(() => {
  jest.clearAllMocks();
  getItem.mockResolvedValue(null);
});

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

  it('sends the stored alert token, so the alert goes out signed out or with a dead session', async () => {
    getItem.mockResolvedValue(JSON.stringify({ userId: 'user-a', deviceId: 'device-1', token: 'token-1' }));
    invoke.mockResolvedValue({ data: {}, error: null });

    expect(await sendAlertRequest(alert)).toBe('delivered');
    expect(invoke).toHaveBeenCalledWith('send-alert', expect.objectContaining({ headers: { 'X-Alert-Token': 'token-1' } }));
  });

  it('still sends when the stored token cannot be read', async () => {
    getItem.mockRejectedValue(new Error('keychain unavailable'));
    invoke.mockResolvedValue({ data: {}, error: null });

    expect(await sendAlertRequest(alert)).toBe('delivered');
    expect(invoke).toHaveBeenCalledTimes(1);
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

describe('endAlertRequest', () => {
  const id = 'aaaaaaaa-0000-4000-8000-000000000001';

  it.each(['user', 'timeout'] as const)('posts the id and reason %s to end-alert with the alert token', async (reason) => {
    getItem.mockResolvedValue(JSON.stringify({ userId: 'user-a', deviceId: 'device-1', token: 'token-1' }));
    invoke.mockResolvedValue({ data: {}, error: null });

    expect(await endAlertRequest(id, reason)).toBe(true);
    expect(invoke).toHaveBeenCalledWith('end-alert', { headers: { 'X-Alert-Token': 'token-1' }, body: { id, reason } });
  });

  it('still ends when the stored token cannot be read', async () => {
    getItem.mockRejectedValue(new Error('keychain unavailable'));
    invoke.mockResolvedValue({ data: {}, error: null });

    expect(await endAlertRequest(id, 'user')).toBe(true);
    expect(invoke).toHaveBeenCalledWith('end-alert', { body: { id, reason: 'user' } });
  });

  // 404: the send may still be in flight and land later, so the end is retried, not dropped.
  it.each([400, 401, 403, 404, 500, 502])('is false for HTTP %i so the caller retries', async (status) => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError({ status }) });
    expect(await endAlertRequest(id, 'user')).toBe(false);
  });

  it('is false for a network error', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Failed to send a request to the Edge Function') });
    expect(await endAlertRequest(id, 'user')).toBe(false);
  });
});

describe('armRequest and disarmRequest', () => {
  const id = 'aaaaaaaa-0000-4000-8000-000000000001';

  it('arms the countdown function with the id, trigger, delay, and alert token', async () => {
    getItem.mockResolvedValue(JSON.stringify({ userId: 'user-a', deviceId: 'device-1', token: 'token-1' }));
    invoke.mockResolvedValue({ data: { alertId: id, state: 'armed' }, error: null });

    await armRequest(id, 'linkLoss', 50_000);
    expect(invoke).toHaveBeenCalledWith('countdown', {
      headers: { 'X-Alert-Token': 'token-1' },
      body: { action: 'arm', id, trigger: 'linkLoss', delayMs: 50_000 },
    });
  });

  it('rounds the delay to whole milliseconds, which the server requires', async () => {
    invoke.mockResolvedValue({ data: { alertId: id, state: 'armed' }, error: null });
    await armRequest(id, 'button', 4999.6);
    expect(invoke).toHaveBeenCalledWith('countdown', { body: { action: 'arm', id, trigger: 'button', delayMs: 5000 } });
  });

  it('rejects a failed arm, so the caller knows only the phone is counting', async () => {
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError({ status: 500 }) });
    await expect(armRequest(id, 'button', 5000)).rejects.toThrow();
  });

  it.each(['disarmed', 'fired'] as const)('disarm reports %s from the server', async (state) => {
    invoke.mockResolvedValue({ data: { alertId: id, state }, error: null });

    expect(await disarmRequest(id)).toBe(state);
    expect(invoke).toHaveBeenCalledWith('countdown', { body: { action: 'disarm', id } });
  });

  it('rejects a disarm the server did not confirm, so the caller retries', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Failed to send a request to the Edge Function') });
    await expect(disarmRequest(id)).rejects.toThrow();

    invoke.mockResolvedValue({ data: { alertId: id, state: 'armed' }, error: null });
    await expect(disarmRequest(id)).rejects.toThrow();
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
