-- Phone verification: a 6-digit code texted to the user's own number proves it reaches them.
-- Spec: docs/protocol/supabase_protocol.md (Auth).
-- The verify-phone Edge Function starts a code (service role) and texts it; the app confirms it.

create table public.phone_codes (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  -- The number the code was sent to; a code proves only that number
  phone_e164        text not null,
  -- SHA-256 of the code; the code itself exists only in the text
  code_hash         bytea not null,
  expires_at        timestamptz not null,
  attempts          int not null default 0,
  sent_at           timestamptz not null,
  -- Sends in the current 24 h window, which caps what one account can cost in SMS
  window_started_at timestamptz not null,
  window_sends      int not null
);

alter table public.phone_codes enable row level security;
-- No client reads or writes it; only the functions below touch it.
revoke all on public.phone_codes from anon, authenticated;

/**
 * Server only: starts a code for the user's current number and returns it to be texted.
 * `status` is `sent` (code and phone set), `no_profile`, `already_verified`, `too_soon`
 * (under 60 s since the last send) or `too_many` (5 sends in 24 h). A new code replaces the
 * previous one and resets its attempts.
 */
create function public.start_phone_code(p_user_id uuid)
returns table (status text, code text, phone_e164 text)
language plpgsql security definer set search_path = '' as $$
declare
  profile record;
  existing public.phone_codes;
  new_code text;
begin
  select p.phone_e164, p.phone_verified into profile from public.profiles p where p.user_id = p_user_id;
  if not found then
    return query select 'no_profile', null::text, null::text;
    return;
  end if;
  if profile.phone_verified then
    return query select 'already_verified', null::text, null::text;
    return;
  end if;

  select * into existing from public.phone_codes c where c.user_id = p_user_id for update;
  if found and existing.sent_at > now() - interval '60 seconds' then
    return query select 'too_soon', null::text, null::text;
    return;
  end if;
  if found and existing.window_started_at > now() - interval '24 hours' and existing.window_sends >= 5 then
    return query select 'too_many', null::text, null::text;
    return;
  end if;

  -- Modulo bias over 2^32 is about 1 in 4000 and does not help a guesser.
  new_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');

  insert into public.phone_codes as c
    (user_id, phone_e164, code_hash, expires_at, sent_at, window_started_at, window_sends)
  values
    (p_user_id, profile.phone_e164, sha256(convert_to(new_code, 'UTF8')), now() + interval '10 minutes', now(), now(), 1)
  on conflict (user_id) do update set
    phone_e164 = excluded.phone_e164,
    code_hash = excluded.code_hash,
    expires_at = excluded.expires_at,
    attempts = 0,
    sent_at = excluded.sent_at,
    window_started_at = case when c.window_started_at > now() - interval '24 hours'
                             then c.window_started_at else excluded.window_started_at end,
    window_sends = case when c.window_started_at > now() - interval '24 hours'
                        then c.window_sends + 1 else 1 end;

  return query select 'sent', new_code, profile.phone_e164;
end $$;

/**
 * The signed-in user confirms the code they were texted. Returns `verified`, `wrong`,
 * `expired`, `too_many_attempts` (5 wrong tries end the code) or `no_code` (none pending, or
 * the number changed since it was sent). Only `verified` sets profiles.phone_verified.
 */
create function public.confirm_phone_code(p_code text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  pending public.phone_codes;
  current_phone text;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = 'insufficient_privilege';
  end if;

  select * into pending from public.phone_codes c where c.user_id = auth.uid() for update;
  if not found then
    return 'no_code';
  end if;
  select p.phone_e164 into current_phone from public.profiles p where p.user_id = auth.uid();
  if current_phone is distinct from pending.phone_e164 then
    delete from public.phone_codes c where c.user_id = auth.uid();
    return 'no_code';
  end if;
  if pending.expires_at <= now() then
    return 'expired';
  end if;
  if pending.attempts >= 5 then
    return 'too_many_attempts';
  end if;

  if sha256(convert_to(btrim(coalesce(p_code, '')), 'UTF8')) = pending.code_hash then
    update public.profiles p set phone_verified = true where p.user_id = auth.uid();
    delete from public.phone_codes c where c.user_id = auth.uid();
    return 'verified';
  end if;

  update public.phone_codes c set attempts = c.attempts + 1 where c.user_id = auth.uid();
  return case when pending.attempts + 1 >= 5 then 'too_many_attempts' else 'wrong' end;
end $$;

revoke execute on function public.start_phone_code, public.confirm_phone_code from public, anon, authenticated;
grant execute on function public.start_phone_code to service_role;
grant execute on function public.confirm_phone_code to authenticated;
