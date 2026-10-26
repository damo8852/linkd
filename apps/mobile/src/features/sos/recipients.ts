import { useEffect, useState } from 'react';

import type { Tables } from '../../../../../supabase/types/database';
import { supabase } from '../../lib/supabase';

/** One contact an alert was sent to, as the owner can read it (RLS: own alerts only). */
export type Recipient = Pick<Tables<'alert_recipients'>, 'name' | 'phone_e164' | 'status' | 'delivery_status'>;

export type RecipientStatus = 'Sending' | 'Texted' | 'Delivered' | 'Failed';

export const RECIPIENTS_POLL_MS = 5_000;

/**
 * What to tell the user about one contact. "Texted" means the provider accepted the text;
 * only a delivery report from the phone network says "Delivered" (supabase_protocol.md:
 * accepted is not delivered).
 */
export function recipientStatus(recipient: Recipient): RecipientStatus {
  if (recipient.status === 'failed' || recipient.delivery_status === 'undelivered' || recipient.delivery_status === 'failed') {
    return 'Failed';
  }
  if (recipient.delivery_status === 'delivered') return 'Delivered';
  return recipient.status === 'sent' ? 'Texted' : 'Sending';
}

async function fetchRecipients(alertId: string): Promise<Recipient[]> {
  const { data, error } = await supabase
    .from('alert_recipients')
    .select('name, phone_e164, status, delivery_status')
    .eq('alert_id', alertId)
    .order('name');
  if (error) throw error;
  return data;
}

/**
 * The active alert's recipients, refreshed every RECIPIENTS_POLL_MS while `alertId` is set.
 * On failure: null (nothing to show), e.g. signed out, where the alert token cannot read rows;
 * the screen then shows only the overall status, which never depends on this.
 */
export function useAlertRecipients(
  alertId: string | null,
  fetch: (alertId: string) => Promise<Recipient[]> = fetchRecipients,
): Recipient[] | null {
  const [recipients, setRecipients] = useState<Recipient[] | null>(null);

  useEffect(() => {
    setRecipients(null);
    if (alertId === null) return;
    let live = true;
    const load = (): void => {
      fetch(alertId).then(
        (rows) => live && setRecipients(rows),
        () => live && setRecipients(null),
      );
    };
    load();
    const interval = setInterval(load, RECIPIENTS_POLL_MS);
    return () => {
      live = false;
      clearInterval(interval);
    };
  }, [alertId, fetch]);

  return recipients;
}
