-- Emergency contacts: the people texted when an SOS fires (docs/design/sos_alert_flow.md#recipients).
-- Users manage their own contacts; only the server (STOP handler, service role) changes status.

create table public.emergency_contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  phone_e164  text not null check (phone_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  -- opted_out = the contact replied STOP; never texted, does not count toward the limit
  status      text not null default 'active' check (status in ('active', 'opted_out')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Also keeps an opted-out number from being re-added (its row cannot be deleted by the user)
  unique (user_id, phone_e164)
);

alter table public.emergency_contacts enable row level security;

-- Supabase's default privileges grant everything to anon and authenticated; narrow them.
-- Users may only rename a contact: a phone change is remove + re-add, so the new number
-- always gets the intro SMS and an opted-out row cannot be reused for a different number.
revoke all on public.emergency_contacts from anon, authenticated;
grant select, delete on public.emergency_contacts to authenticated;
grant insert (name, phone_e164) on public.emergency_contacts to authenticated;
grant update (name) on public.emergency_contacts to authenticated;

create policy "own contacts: select" on public.emergency_contacts
  for select to authenticated using (user_id = (select auth.uid()));

create policy "own contacts: insert" on public.emergency_contacts
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "own contacts: update" on public.emergency_contacts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Opted-out rows stay as the record of the contact's STOP.
create policy "own active contacts: delete" on public.emergency_contacts
  for delete to authenticated using (user_id = (select auth.uid()) and status = 'active');

-- Max 5 active contacts per user, enforced here so no client can bypass it.
-- The per-user advisory lock serializes concurrent inserts so two cannot both pass the count.
create function public.enforce_emergency_contact_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('emergency_contacts:' || new.user_id::text, 0));
  if (select count(*) from public.emergency_contacts
       where user_id = new.user_id and status = 'active' and id <> new.id) >= 5 then
    raise exception 'emergency contact limit reached (max 5 active)' using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger emergency_contacts_limit
  before insert or update of status on public.emergency_contacts
  for each row when (new.status = 'active')
  execute function public.enforce_emergency_contact_limit();

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger emergency_contacts_updated_at
  before update on public.emergency_contacts
  for each row execute function public.set_updated_at();
