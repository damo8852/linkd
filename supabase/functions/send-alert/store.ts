/** The send-alert store over the start_alert / claim / record SQL functions. Shared with fire-armed-alerts. */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../types/database.ts';
import { AlertOwnershipError, type AlertStore } from './sendAlert.ts';

export function supabaseStore(db: SupabaseClient<Database>): AlertStore {
  return {
    async start(userId, input) {
      const { data, error } = await db.rpc('start_alert', {
        p_user_id: userId,
        p_id: input.id,
        p_trigger: input.trigger,
        p_triggered_at: input.triggeredAt,
        // Generated types mark every SQL argument non-null; these columns are nullable and
        // start_alert accepts null for a missing location.
        p_latitude: input.location?.latitude ?? (null as unknown as number),
        p_longitude: input.location?.longitude ?? (null as unknown as number),
        p_accuracy_m: input.location?.accuracyM ?? (null as unknown as number),
        p_located_at: input.location?.at ?? (null as unknown as string),
      });
      if (error?.code === '42501') throw new AlertOwnershipError();
      if (error) throw new Error(`start_alert: ${error.message}`);
      const row = data?.[0];
      if (!row) throw new Error('start_alert returned no row');
      return { displayName: row.display_name ?? null, phone: row.phone_e164 ?? null, recipientCount: row.recipient_count };
    },
    async claim(alertId) {
      const { data, error } = await db.rpc('claim_alert_recipients', { p_alert_id: alertId });
      if (error) throw new Error(`claim_alert_recipients: ${error.message}`);
      return (data ?? []).map((r) => r.phone_e164);
    },
    async record(alertId, phone, outcome) {
      const { error } = await db.rpc('record_alert_recipient', {
        p_alert_id: alertId,
        p_phone_e164: phone,
        p_status: outcome.ok ? 'sent' : 'failed',
        // Nullable in SQL; see the note in start().
        p_provider_message_id: outcome.ok ? outcome.id : (null as unknown as string),
        p_error: outcome.ok ? (null as unknown as string) : outcome.error,
      });
      if (error) throw new Error(`record_alert_recipient: ${error.message}`);
    },
  };
}
