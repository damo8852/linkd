import { act, renderHook } from '@testing-library/react-native';

import { RECIPIENTS_POLL_MS, recipientStatus, useAlertRecipients, type Recipient } from './recipients';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const row = (status: string, delivery_status: string | null = null): Recipient => ({
  name: 'Maya',
  phone_e164: '+15555550101',
  status,
  delivery_status,
});

describe('recipientStatus', () => {
  it('says Sending until the provider accepted the text', () => {
    expect(recipientStatus(row('pending'))).toBe('Sending');
    expect(recipientStatus(row('sending'))).toBe('Sending');
  });

  it('says Texted once accepted, and Delivered only when the phone confirmed it', () => {
    expect(recipientStatus(row('sent'))).toBe('Texted');
    expect(recipientStatus(row('sent', 'delivered'))).toBe('Delivered');
  });

  it('says Failed for a failed send or an undelivered or failed delivery report', () => {
    expect(recipientStatus(row('failed'))).toBe('Failed');
    expect(recipientStatus(row('sent', 'undelivered'))).toBe('Failed');
    expect(recipientStatus(row('sent', 'failed'))).toBe('Failed');
  });
});

describe('useAlertRecipients', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('reads the alert recipients, polls while active, and stops when there is no alert', async () => {
    const fetch = jest.fn(async (_id: string) => [row('sent')]);
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useAlertRecipients(id, fetch), {
      initialProps: { id: 'alert-1' as string | null },
    });

    await act(async () => undefined);
    expect(result.current).toEqual([row('sent')]);
    expect(fetch).toHaveBeenCalledWith('alert-1');

    await act(async () => void jest.advanceTimersByTime(RECIPIENTS_POLL_MS));
    expect(fetch).toHaveBeenCalledTimes(2);

    rerender({ id: null });
    expect(result.current).toBeNull();
    await act(async () => void jest.advanceTimersByTime(5 * RECIPIENTS_POLL_MS));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shows nothing when the rows cannot be read, for example signed out', async () => {
    const fetch = jest.fn(async () => Promise.reject(new Error('JWT expired')));
    const { result } = renderHook(() => useAlertRecipients('alert-1', fetch));
    await act(async () => undefined);
    expect(result.current).toBeNull();
  });
});
