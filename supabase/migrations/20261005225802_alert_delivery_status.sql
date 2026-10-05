-- Handset delivery of SOS texts. `status = 'sent'` only means the provider accepted the text;
-- the provider reports later whether it reached the phone (sms-status Edge Function).
-- Kept apart from `status` so a delivery report never changes who a retry texts.

alter table public.alert_recipients
  -- null = no final report yet
  add column delivery_status text check (delivery_status in ('delivered', 'undelivered', 'failed')),
  -- The provider's error code for an undelivered or failed text
  add column delivery_error  text;

create index alert_recipients_provider_message_id on public.alert_recipients (provider_message_id);

/**
 * Records the provider's final delivery report for one text, found by provider message id.
 * Returns false if no recipient has that id. `delivered` never overwrites a recorded failure:
 * showing a dropped text as delivered would hide a missed alert.
 */
create function public.record_alert_delivery(p_provider_message_id text, p_status text, p_error_code text)
returns boolean
language plpgsql set search_path = '' as $$
begin
  if p_status not in ('delivered', 'undelivered', 'failed') then
    raise exception 'status must be delivered, undelivered, or failed' using errcode = 'invalid_parameter_value';
  end if;
  update public.alert_recipients
     set delivery_status = p_status, delivery_error = p_error_code
   where provider_message_id = p_provider_message_id
     and (p_status <> 'delivered' or delivery_status is null);
  return exists (select 1 from public.alert_recipients where provider_message_id = p_provider_message_id);
end $$;

revoke execute on function public.record_alert_delivery from public, anon, authenticated;
grant execute on function public.record_alert_delivery to service_role;
