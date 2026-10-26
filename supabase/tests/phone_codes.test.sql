-- phone_codes: only the server starts a code, only the owner confirms it, and only the right code
-- for the current number marks the phone verified.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'u3@example.test');
insert into public.profiles (user_id, display_name, phone_e164) values
  ('11111111-1111-1111-1111-111111111111', 'One', '+15555550101'),
  ('22222222-2222-2222-2222-222222222222', 'Two', '+15555550102');

create temp table sent (code text);
grant all on sent to authenticated, service_role;

select ok(
  (select relrowsecurity from pg_class where oid = 'public.phone_codes'::regclass),
  'RLS is enabled'
);

-- ---------- clients cannot start a code or touch the table ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.start_phone_code('11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'a signed-in user cannot start a code (it would return the code)'
);
select throws_ok($$ select * from public.phone_codes $$, '42501', null, 'a signed-in user cannot read codes');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$ select public.confirm_phone_code('000000') $$, '42501', null, 'anon cannot confirm');
select throws_ok($$ select * from public.phone_codes $$, '42501', null, 'anon cannot read codes');

-- ---------- server starts a code ----------
reset role;
set local role service_role;
select is(
  (select status from public.start_phone_code('33333333-3333-3333-3333-333333333333')),
  'no_profile', 'no profile, no code'
);
insert into sent select code from public.start_phone_code('11111111-1111-1111-1111-111111111111');
select matches((select code from sent), '^[0-9]{6}$', 'a 6-digit code is returned');
select is(
  (select status from public.start_phone_code('11111111-1111-1111-1111-111111111111')),
  'too_soon', 'a resend within 60 s is refused'
);

-- ---------- owner confirms ----------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(
  public.confirm_phone_code((select code from sent)), 'no_code',
  'another user cannot use someone else''s code'
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(
  public.confirm_phone_code(case when (select code from sent) = '000000' then '000001' else '000000' end),
  'wrong', 'a wrong code is refused'
);
select is((select phone_verified from public.profiles), false, 'a wrong code does not verify');
select is(public.confirm_phone_code(' ' || (select code from sent) || ' '), 'verified', 'the right code verifies');
select is((select phone_verified from public.profiles), true, 'the phone is now verified');
select is(public.confirm_phone_code((select code from sent)), 'no_code', 'a code works once');

reset role;
set local role service_role;
select is(
  (select status from public.start_phone_code('11111111-1111-1111-1111-111111111111')),
  'already_verified', 'a verified number gets no code'
);

-- ---------- 5 wrong tries end a code ----------
reset role;
delete from sent;
set local role service_role;
insert into sent select code from public.start_phone_code('22222222-2222-2222-2222-222222222222');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.confirm_phone_code('x') from generate_series(1, 4);
select is(public.confirm_phone_code('x'), 'too_many_attempts', 'the fifth wrong try ends the code');
select is(public.confirm_phone_code((select code from sent)), 'too_many_attempts', 'even the right code is refused after that');

-- ---------- a new code resets attempts; expiry ----------
reset role;
update public.phone_codes set sent_at = now() - interval '61 seconds';
delete from sent;
set local role service_role;
insert into sent select code from public.start_phone_code('22222222-2222-2222-2222-222222222222');
reset role;
update public.phone_codes set expires_at = now() - interval '1 second';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(public.confirm_phone_code((select code from sent)), 'expired', 'an expired code is refused');

-- ---------- a code proves only the number it was sent to ----------
reset role;
update public.phone_codes set sent_at = now() - interval '61 seconds';
delete from sent;
set local role service_role;
insert into sent select code from public.start_phone_code('22222222-2222-2222-2222-222222222222');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select lives_ok($$ update public.profiles set phone_e164 = '+15555550199' $$, 'owner changes their number');
select is(public.confirm_phone_code((select code from sent)), 'no_code', 'a code for the old number does not verify the new one');
select is((select phone_verified from public.profiles), false, 'the new number stays unverified');

-- ---------- 5 sends per 24 h ----------
reset role;
-- Window already holds 4 sends; the 5th goes out, the 6th is refused.
insert into public.phone_codes (user_id, phone_e164, code_hash, expires_at, sent_at, window_started_at, window_sends)
values ('22222222-2222-2222-2222-222222222222', '+15555550199', '\x00', now(), now() - interval '61 seconds', now() - interval '1 hour', 4);
set local role service_role;
select is((select status from public.start_phone_code('22222222-2222-2222-2222-222222222222')), 'sent', 'the fifth send in 24 h goes out');
reset role;
update public.phone_codes set sent_at = now() - interval '61 seconds';
set local role service_role;
select is((select status from public.start_phone_code('22222222-2222-2222-2222-222222222222')), 'too_many', 'the sixth send in 24 h is refused');
reset role;
update public.phone_codes set sent_at = now() - interval '61 seconds', window_started_at = now() - interval '25 hours';
set local role service_role;
select is((select status from public.start_phone_code('22222222-2222-2222-2222-222222222222')), 'sent', 'a new 24 h window allows sends again');
select is((select window_sends from public.phone_codes where user_id = '22222222-2222-2222-2222-222222222222'), 1, 'the new window counts from one');

select * from finish();
rollback;
