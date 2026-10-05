-- profiles: the user's callback number, its verified flag, and the dispatch setting.
-- dispatch_enabled decides whether emergency dispatch is told, so every access path is checked.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.test');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is enabled'
);
select col_not_null('public', 'profiles', 'dispatch_enabled', 'dispatch_enabled is never unknown');
select col_not_null('public', 'profiles', 'phone_verified', 'phone_verified is never unknown');

-- ---------- owner ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.profiles (display_name, phone_e164) values ('Test User', '+15555550199') $$,
  'owner can create their profile'
);
select is((select dispatch_enabled from public.profiles), true, 'dispatch is on by default');
select is((select phone_verified from public.profiles), false, 'a new phone number is unverified');

select lives_ok($$ update public.profiles set dispatch_enabled = false $$, 'owner can turn dispatch off');
select is((select dispatch_enabled from public.profiles), false, 'the dispatch setting is saved');
select throws_ok(
  $$ update public.profiles set dispatch_enabled = null $$,
  '23502', null, 'dispatch setting cannot be cleared'
);
select throws_ok(
  $$ update public.profiles set phone_verified = true $$,
  '42501', null, 'owner cannot mark their own phone verified'
);

-- ---------- other user ----------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles), 0, 'other user cannot see the profile');
select lives_ok(
  $$ update public.profiles set dispatch_enabled = true
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'an update aimed at another user''s profile matches no rows'
);
select throws_ok(
  $$ insert into public.profiles (display_name, phone_e164, phone_verified)
     values ('Other User', '+15555550198', true) $$,
  '42501', null, 'a profile cannot be created already verified'
);
select lives_ok(
  $$ insert into public.profiles (display_name, phone_e164, dispatch_enabled)
     values ('Other User', '+15555550198', false) $$,
  'a profile can be created with dispatch off'
);

-- ---------- anon ----------
reset role;
set local role anon;
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok(
  $$ insert into public.profiles (user_id, display_name, phone_e164)
     values ('11111111-1111-1111-1111-111111111111', 'Anon', '+15555550197') $$,
  '42501', null, 'anon cannot create a profile'
);
select throws_ok(
  $$ update public.profiles set dispatch_enabled = false $$,
  '42501', null, 'anon cannot change a dispatch setting'
);

-- ---------- server ----------
reset role;
select is(
  (select dispatch_enabled from public.profiles where user_id = '11111111-1111-1111-1111-111111111111'),
  false, 'another user''s update did not change the owner''s dispatch setting'
);

set local role service_role;
select lives_ok(
  $$ update public.profiles set phone_verified = true
      where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'server can mark a phone verified'
);

-- ---------- a changed number is unverified again ----------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok($$ update public.profiles set display_name = 'Renamed' $$, 'owner can rename');
select is((select phone_verified from public.profiles), true, 'renaming keeps the phone verified');
select lives_ok($$ update public.profiles set phone_e164 = '+15555550196' $$, 'owner can change their phone');
select is((select phone_verified from public.profiles), false, 'a changed phone number is unverified again');

select * from finish();
rollback;
