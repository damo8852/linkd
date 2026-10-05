-- Profiles: the dispatch setting and the verified flag for the user's own number.
-- Spec: docs/design/sos_alert_flow.md#recipients, docs/protocol/supabase_protocol.md#auth.

alter table public.profiles
  -- Whether emergency dispatch is told in an SOS. On unless the user turned it off.
  add column dispatch_enabled boolean not null default true,
  -- Set only by the server once the number is verified by SMS
  add column phone_verified   boolean not null default false;

-- Users choose their dispatch setting; phone_verified is left out, so only the server can set it.
grant insert (dispatch_enabled), update (dispatch_enabled) on public.profiles to authenticated;

-- A changed number has not been verified, whoever changed it.
create function public.reset_phone_verified() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.phone_verified = false;
  return new;
end $$;

create trigger profiles_phone_changed
  before update of phone_e164 on public.profiles
  for each row when (new.phone_e164 is distinct from old.phone_e164)
  execute function public.reset_phone_verified();
