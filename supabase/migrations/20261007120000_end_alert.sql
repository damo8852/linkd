-- Ending an alert ("I'm safe", or the 60 min auto-end) for the end-alert Edge Function.
-- Spec: docs/design/sos_alert_flow.md (Ending an alert).

alter table public.alerts
  -- null = still active
  add column ended_at     timestamptz,
  -- user = "I'm safe"; timeout = auto-end, nobody confirmed anything
  add column ended_reason text check (ended_reason in ('user', 'timeout')),
  add check ((ended_at is null) = (ended_reason is null));

-- The end text, tracked apart from the SOS text so neither send can change the other's record.
alter table public.alert_recipients
  -- null = no end text owed: the alert is active, or this recipient's SOS was never sent
  add column end_status              text check (end_status in ('pending', 'sending', 'sent', 'failed')),
  add column end_provider_message_id text,
  add column end_error               text,
  add column end_updated_at          timestamptz;

/**
 * Ends the alert once and queues the end text for every recipient whose SOS text was sent.
 * Safe to retry: the first end wins, so a later call never changes when or how the alert ended,
 * and a recipient already queued or texted is never queued again.
 * Fails with 42501 if the alert belongs to another user, P0002 if it does not exist.
 * Returns the sender's profile (null fields if none), the recorded end, and how many recipients
 * are owed the end text.
 */
create function public.end_alert(p_user_id uuid, p_id uuid, p_reason text)
returns table (display_name text, phone_e164 text, ended_reason text, ended_at timestamptz, recipient_count int)
language plpgsql set search_path = '' as $$
declare
  owner uuid;
begin
  if p_reason not in ('user', 'timeout') then
    raise exception 'reason must be user or timeout' using errcode = 'invalid_parameter_value';
  end if;

  select a.user_id into owner from public.alerts a where a.id = p_id for update;
  if not found then
    raise exception 'alert not found' using errcode = 'no_data_found';
  end if;
  if owner <> p_user_id then
    raise exception 'alert id belongs to another user' using errcode = 'insufficient_privilege';
  end if;

  update public.alerts a
     set ended_at = now(), ended_reason = p_reason
   where a.id = p_id and a.ended_at is null;

  -- Also picks up an SOS text that was still in flight when the alert first ended.
  update public.alert_recipients r
     set end_status = 'pending', end_updated_at = now()
   where r.alert_id = p_id and r.status = 'sent' and r.end_status is null;

  return query
    select p.display_name, p.phone_e164, a.ended_reason, a.ended_at,
           (select count(*)::int from public.alert_recipients r where r.alert_id = p_id and r.end_status is not null)
      from public.alerts a
      left join public.profiles p on p.user_id = a.user_id
     where a.id = p_id;
end $$;

/**
 * Claims the recipients still owed the end text and marks them `sending`, atomically, so
 * concurrent retries never text anyone twice. A claim older than 60 s is treated as a crashed
 * send and claimed again, as for the SOS text.
 */
create function public.claim_alert_end_recipients(p_alert_id uuid)
returns table (phone_e164 text)
language sql set search_path = '' as $$
  update public.alert_recipients r
     set end_status = 'sending', end_updated_at = now()
   where r.alert_id = p_alert_id
     and (r.end_status in ('pending', 'failed')
          or (r.end_status = 'sending' and r.end_updated_at < now() - interval '60 seconds'))
  returning r.phone_e164;
$$;

/** Records one recipient's end-text outcome (`sent` or `failed`). One already sent is never downgraded. */
create function public.record_alert_end_recipient(
  p_alert_id uuid, p_phone_e164 text, p_status text, p_provider_message_id text, p_error text
) returns void
language plpgsql set search_path = '' as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'status must be sent or failed' using errcode = 'invalid_parameter_value';
  end if;
  update public.alert_recipients
     set end_status = p_status, end_provider_message_id = p_provider_message_id, end_error = p_error,
         end_updated_at = now()
   where alert_id = p_alert_id and phone_e164 = p_phone_e164 and end_status is not null and end_status <> 'sent';
end $$;

/**
 * Replaces claim_alert_recipients: once the alert has ended nobody is claimed, so a late
 * send-alert retry can never text "SOS" after the end text. Otherwise unchanged.
 */
create or replace function public.claim_alert_recipients(p_alert_id uuid)
returns table (phone_e164 text)
language sql set search_path = '' as $$
  update public.alert_recipients r
     set status = 'sending', updated_at = now()
   where r.alert_id = p_alert_id
     and (r.status in ('pending', 'failed')
          or (r.status = 'sending' and r.updated_at < now() - interval '60 seconds'))
     and exists (select 1 from public.alerts a where a.id = p_alert_id and a.ended_at is null)
  returning r.phone_e164;
$$;

revoke execute on function public.end_alert, public.claim_alert_end_recipients, public.record_alert_end_recipient
  from public, anon, authenticated;
grant execute on function public.end_alert, public.claim_alert_end_recipients, public.record_alert_end_recipient
  to service_role;
