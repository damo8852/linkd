-- Server-armed countdowns: the phone arms every cancel window and grace period here, and the
-- server sends the alert when due unless it was disarmed first, so an SOS still goes out when
-- the OS suspends or kills the app. Spec: docs/design/sos_alert_flow.md (Countdowns run on the server).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Written only by the server; no client can read or change it.
create table public.armed_alerts (
  -- The client-generated alert id the send will use
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- null only on a disarm that arrived before its arm
  trigger     text check (trigger in ('button', 'inApp', 'linkLoss')),
  send_at     timestamptz,
  disarmed_at timestamptz,
  -- Set when claimed for sending; once set, a disarm reports `fired`
  fired_at    timestamptz,
  -- A fired alert whose send failed is claimed again at this time
  retry_at    timestamptz,
  created_at  timestamptz not null default now(),
  check (disarmed_at is not null or (trigger is not null and send_at is not null)),
  check (not (disarmed_at is not null and fired_at is not null))
);

alter table public.armed_alerts enable row level security;
revoke all on public.armed_alerts from anon, authenticated;

create index armed_alerts_due on public.armed_alerts (send_at) where fired_at is null and disarmed_at is null;
create index armed_alerts_retry on public.armed_alerts (retry_at) where retry_at is not null;

/**
 * Arms the alert to send after `p_delay_ms` on the server clock. Safe to retry. A re-arm can only
 * bring the send sooner (a hold during grace), never postpone it. Fails with 42501 if the id
 * belongs to another user and 22023 for a delay outside 0..60 s.
 * Returns `armed`, `disarmed` (a disarm got here first; nothing will send), or `fired`.
 */
create function public.arm_alert(p_user_id uuid, p_id uuid, p_trigger text, p_delay_ms int)
returns text
language plpgsql set search_path = '' as $$
declare
  row public.armed_alerts;
begin
  if p_delay_ms is null or p_delay_ms not between 0 and 60000 then
    raise exception 'delay must be 0..60000 ms' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.armed_alerts as a (id, user_id, trigger, send_at)
  values (p_id, p_user_id, p_trigger, now() + p_delay_ms * interval '1 millisecond')
  on conflict (id) do update
     set send_at = excluded.send_at, trigger = excluded.trigger
   where a.user_id = p_user_id and a.disarmed_at is null and a.fired_at is null
     and excluded.send_at < a.send_at;

  select * into row from public.armed_alerts a where a.id = p_id;
  if row.user_id <> p_user_id then
    raise exception 'alert id belongs to another user' using errcode = 'insufficient_privilege';
  end if;
  return case when row.disarmed_at is not null then 'disarmed' when row.fired_at is not null then 'fired' else 'armed' end;
end $$;

/**
 * Disarms the alert so the server never sends it. A disarm that arrives before its arm is kept,
 * so the arm cannot revive it. Fails with 42501 if the id belongs to another user.
 * Returns `disarmed`, or `fired` when the server already sent it (the app warns and ends it).
 */
create function public.disarm_alert(p_user_id uuid, p_id uuid)
returns text
language plpgsql set search_path = '' as $$
declare
  row public.armed_alerts;
begin
  insert into public.armed_alerts as a (id, user_id, disarmed_at)
  values (p_id, p_user_id, now())
  on conflict (id) do update
     set disarmed_at = now()
   where a.user_id = p_user_id and a.disarmed_at is null and a.fired_at is null;

  select * into row from public.armed_alerts a where a.id = p_id;
  if row.user_id <> p_user_id then
    raise exception 'alert id belongs to another user' using errcode = 'insufficient_privilege';
  end if;
  return case when row.fired_at is not null then 'fired' else 'disarmed' end;
end $$;

/**
 * Claims every armed alert that is due (or whose failed send is due a retry) and marks it fired,
 * atomically, so concurrent runs never claim one twice and a disarm can no longer win.
 */
create function public.claim_due_armed_alerts()
returns table (id uuid, user_id uuid, trigger text, send_at timestamptz)
language sql set search_path = '' as $$
  update public.armed_alerts a
     set fired_at = coalesce(a.fired_at, now()), retry_at = null
   where a.id in (
     select d.id from public.armed_alerts d
      where (d.fired_at is null and d.disarmed_at is null and d.send_at <= now())
         or d.retry_at <= now()
      for update skip locked)
  returning a.id, a.user_id, a.trigger, a.send_at;
$$;

/** Schedules another send of a fired alert after `p_delay_ms`, or clears it with null. */
create function public.retry_armed_alert(p_id uuid, p_delay_ms int)
returns void
language sql set search_path = '' as $$
  update public.armed_alerts
     set retry_at = now() + p_delay_ms * interval '1 millisecond'
   where id = p_id and fired_at is not null;
$$;

revoke execute on function public.arm_alert, public.disarm_alert, public.claim_due_armed_alerts, public.retry_armed_alert
  from public, anon, authenticated;
grant execute on function public.arm_alert, public.disarm_alert, public.claim_due_armed_alerts, public.retry_armed_alert
  to service_role;

-- Every second, and only when something is due, call the fire-armed-alerts Edge Function. The URL
-- and the shared secret live in Vault (docs/reference/integrations.md); without them the call
-- fails and is logged in cron.job_run_details.
select cron.schedule('fire-armed-alerts', '1 seconds', $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/fire-armed-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'armed_alerts_cron_secret')),
    body    := '{}'::jsonb)
  where exists (
    select 1 from public.armed_alerts
     where (fired_at is null and disarmed_at is null and send_at <= now()) or retry_at <= now());
$cron$);
