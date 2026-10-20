-- alert_devices: the per-install alert token that lets a signed-out phone still send an SOS.
-- A token that fails to resolve is a missed alert; one that leaks or outlives removal lets
-- someone else send or end alerts as the user.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.test');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.alert_devices'::regclass),
  'RLS is enabled'
);

-- ---------- owner: issuing ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- Tokens are kept in settings so later roles in this test can present them.
select lives_ok(
  $$ select set_config('test.token_a', (select token from public.issue_alert_token('Pixel 8')), true) $$,
  'owner can issue a token for this install'
);
select matches(current_setting('test.token_a'), '^[0-9a-f]{64}$', 'the token is 256 random bits in hex');
select lives_ok(
  $$ select set_config('test.token_b', (select token from public.issue_alert_token('iPhone 15')), true) $$,
  'owner can issue a token for a second install'
);
select isnt(current_setting('test.token_a'), current_setting('test.token_b'), 'every token is different');

select is((select count(*)::int from public.alert_devices), 2, 'owner can list their devices');
select is(
  (select string_agg(name, ', ' order by name collate "C") from public.alert_devices), 'Pixel 8, iPhone 15',
  'the device names are saved'
);
select throws_ok(
  $$ select token_hash from public.alert_devices $$,
  '42501', null, 'owner cannot read a token hash'
);
select throws_ok(
  $$ insert into public.alert_devices (user_id, name, token_hash)
     values ('11111111-1111-1111-1111-111111111111', 'Forged', '\x00') $$,
  '42501', null, 'owner cannot create a device row directly'
);
select throws_ok(
  $$ update public.alert_devices set name = 'Renamed' $$,
  '42501', null, 'owner cannot change a device row'
);
select throws_ok(
  $$ select public.issue_alert_token('   ') $$,
  '23514', null, 'a device needs a name'
);
select throws_ok(
  $$ select public.alert_token_user(current_setting('test.token_a')) $$,
  '42501', null, 'user cannot resolve a token to a user'
);

-- ---------- only the hash is stored ----------
reset role;
select is(
  (select count(*)::int from public.alert_devices
    where token_hash = sha256(convert_to(current_setting('test.token_a'), 'UTF8'))),
  1, 'the SHA-256 hash of the token is stored'
);
select is(
  (select count(*)::int from public.alert_devices
    where token_hash = convert_to(current_setting('test.token_a'), 'UTF8')
       or encode(token_hash, 'hex') = current_setting('test.token_a')),
  0, 'the token itself is never stored'
);

-- ---------- other user ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.alert_devices), 0, 'other user cannot see the devices');
select lives_ok(
  $$ delete from public.alert_devices where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'a delete aimed at another user''s devices matches no rows'
);
select lives_ok(
  $$ select set_config('test.token_c', (select token from public.issue_alert_token('Other phone')), true) $$,
  'other user can issue their own token'
);

-- ---------- anon ----------
reset role;
set local role anon;
select throws_ok($$ select id from public.alert_devices $$, '42501', null, 'anon cannot read devices');
select throws_ok(
  $$ select public.issue_alert_token('Anon phone') $$,
  '42501', null, 'anon cannot issue a token'
);
select throws_ok(
  $$ select public.alert_token_user(current_setting('test.token_a')) $$,
  '42501', null, 'anon cannot resolve a token to a user'
);

-- ---------- server: resolving a token ----------
reset role;
select is((select count(*)::int from public.alert_devices), 3, 'another user''s delete removed nothing');

set local role service_role;
select is(
  public.alert_token_user(current_setting('test.token_a')),
  '11111111-1111-1111-1111-111111111111'::uuid, 'a token resolves to its own user'
);
select is(
  public.alert_token_user(current_setting('test.token_c')),
  '22222222-2222-2222-2222-222222222222'::uuid, 'another user''s token resolves to that user, never this one'
);
select is(public.alert_token_user(repeat('0', 64)), null, 'an unknown token resolves to nobody');
select is(public.alert_token_user(''), null, 'an empty token resolves to nobody');
select is(public.alert_token_user(null), null, 'a missing token resolves to nobody');

-- ---------- remove this device, on the phone (signed out: the token is the only proof) ----------
reset role;
set local role anon;
select is(public.revoke_alert_token(repeat('0', 64)), false, 'revoking an unknown token removes nothing');
select is(public.revoke_alert_token(current_setting('test.token_a')), true, 'a phone can remove itself with its token');
select is(public.revoke_alert_token(current_setting('test.token_a')), false, 'a removed token cannot be removed twice');

reset role;
set local role service_role;
select is(public.alert_token_user(current_setting('test.token_a')), null, 'a removed token no longer resolves');
select is(
  public.alert_token_user(current_setting('test.token_b')),
  '11111111-1111-1111-1111-111111111111'::uuid, 'removing one device leaves the user''s other device armed'
);

-- ---------- remove this device, from another signed-in device ----------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok($$ delete from public.alert_devices $$, 'owner can remove a device from another device');

reset role;
set local role service_role;
select is(public.alert_token_user(current_setting('test.token_b')), null, 'a device removed remotely no longer resolves');
select is(
  public.alert_token_user(current_setting('test.token_c')),
  '22222222-2222-2222-2222-222222222222'::uuid, 'the owner''s delete left the other user''s device armed'
);

select * from finish();
rollback;
