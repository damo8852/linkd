-- Alert tokens: one per app install, so a signed-out phone can still send and end an SOS.
-- Spec: docs/design/sos_alert_flow.md (Signed out), docs/protocol/supabase_protocol.md (Auth).

create table public.alert_devices (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- Shown in the device list so the user can tell which phone to remove
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  -- SHA-256 of the token; the token itself exists only on the phone
  token_hash bytea not null unique,
  created_at timestamptz not null default now()
);

create index alert_devices_user_id_idx on public.alert_devices (user_id);

alter table public.alert_devices enable row level security;
revoke all on public.alert_devices from anon, authenticated;
-- No token_hash, no insert, no update: rows are created only by issue_alert_token.
grant select (id, user_id, name, created_at), delete on public.alert_devices to authenticated;

create policy "own alert devices: select" on public.alert_devices
  for select to authenticated using (user_id = (select auth.uid()));
-- "Remove this device" from another signed-in device.
create policy "own alert devices: delete" on public.alert_devices
  for delete to authenticated using (user_id = (select auth.uid()));

/**
 * Issues an alert token for the signed-in user's install and returns it once; only its hash is
 * kept. Never replaces an earlier token: the app stores the new one first and then revokes the
 * old, so a lost response cannot leave a phone holding a dead token.
 */
create function public.issue_alert_token(p_device_name text)
returns table (device_id uuid, token text)
language plpgsql security definer set search_path = '' as $$
declare
  new_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;
  return query
    insert into public.alert_devices as d (user_id, name, token_hash)
    values (auth.uid(), btrim(p_device_name), sha256(convert_to(new_token, 'UTF8')))
    returning d.id, new_token;
end $$;

/**
 * "Remove this device" on the phone itself: holding the token is the proof, so it works signed
 * out. Returns whether a device was removed. An unknown token removes nothing.
 */
create function public.revoke_alert_token(p_token text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.alert_devices where token_hash = sha256(convert_to(p_token, 'UTF8'));
  return found;
end $$;

/** Server only: the user an alert token belongs to, or null if it is unknown or removed. */
create function public.alert_token_user(p_token text)
returns uuid
language sql stable set search_path = '' as $$
  select d.user_id from public.alert_devices d where d.token_hash = sha256(convert_to(p_token, 'UTF8'));
$$;

revoke execute on function public.issue_alert_token, public.revoke_alert_token, public.alert_token_user
  from public, anon, authenticated;
grant execute on function public.issue_alert_token to authenticated;
grant execute on function public.revoke_alert_token to anon, authenticated;
grant execute on function public.alert_token_user to service_role;
