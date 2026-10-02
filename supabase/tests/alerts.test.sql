-- profiles, alerts, alert_recipients, and the server-only alert functions.
-- These decide who is texted in an SOS and guarantee nobody is texted twice.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.test');

-- u1: two active contacts and one opted out (status is server-only, so seed as postgres)
insert into public.emergency_contacts (user_id, name, phone_e164, status) values
  ('11111111-1111-1111-1111-111111111111', 'A', '+15555550101', 'active'),
  ('11111111-1111-1111-1111-111111111111', 'B', '+15555550102', 'active'),
  ('11111111-1111-1111-1111-111111111111', 'Gone', '+15555550103', 'opted_out');

-- ---------- profiles ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.profiles (display_name, phone_e164) values ('Test User', '+15555550199') $$,
  'user can create their profile'
);
select is((select user_id from public.profiles), '11111111-1111-1111-1111-111111111111'::uuid, 'profile user_id defaults to the caller');
select throws_ok(
  $$ insert into public.profiles (user_id, display_name, phone_e164)
     values ('22222222-2222-2222-2222-222222222222', 'Sneaky', '+15555550198') $$,
  '42501', null, 'user cannot create a profile for another user'
);
select lives_ok($$ update public.profiles set display_name = 'Test User 2' $$, 'user can update their profile');
select throws_ok(
  $$ update public.profiles set phone_e164 = 'not-a-phone' $$,
  '23514', null, 'profile phone must be E.164'
);
select throws_ok(
  $$ update public.profiles set display_name = '   ' $$,
  '23514', null, 'profile name cannot be blank'
);

-- ---------- users cannot write alerts or call the server functions ----------
select throws_ok(
  $$ insert into public.alerts (id, user_id, trigger, triggered_at)
     values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'button', now()) $$,
  '42501', null, 'user cannot insert an alert directly'
);
select throws_ok(
  $$ select public.start_alert('11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'button', now(),
                               null, null, null, null) $$,
  '42501', null, 'user cannot call start_alert'
);
select throws_ok(
  $$ select public.claim_alert_recipients(gen_random_uuid()) $$,
  '42501', null, 'user cannot call claim_alert_recipients'
);
select throws_ok(
  $$ select public.record_alert_recipient(gen_random_uuid(), '+15555550101', 'sent', null, null) $$,
  '42501', null, 'user cannot call record_alert_recipient'
);

-- ---------- server: start_alert ----------
reset role;
set local role service_role;

select is(
  (select display_name from public.start_alert(
     '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'linkLoss',
     '2026-10-01 12:00:00+00', 40.0, -105.0, 12, '2026-10-01 11:59:58+00')),
  'Test User 2',
  'start_alert returns the sender''s profile'
);
select is(
  (select recipient_count from public.start_alert(
     '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'linkLoss',
     '2026-10-01 12:00:00+00', 40.0, -105.0, 12, '2026-10-01 11:59:58+00')),
  2,
  'start_alert reports the recipient count'
);
select is((select count(*)::int from public.alerts), 1, 'retrying start_alert creates the alert once');
select results_eq(
  $$ select phone_e164, status from public.alert_recipients order by phone_e164 $$,
  $$ values ('+15555550101', 'pending'), ('+15555550102', 'pending') $$,
  'recipients are the active contacts only, snapshotted once'
);
select throws_ok(
  $$ select public.start_alert('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001',
                               'button', now(), null, null, null, null) $$,
  '42501', 'alert id belongs to another user',
  'an alert id owned by another user is rejected'
);
select throws_ok(
  $$ select public.start_alert('11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'nope', now(),
                               null, null, null, null) $$,
  '23514', null, 'trigger must be a known value'
);
select throws_ok(
  $$ select public.start_alert('11111111-1111-1111-1111-111111111111', gen_random_uuid(), 'button', now(),
                               40.0, null, null, null) $$,
  '23514', null, 'latitude and longitude come together'
);
select is(
  (select recipient_count from public.start_alert(
     '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'button', now(),
     null, null, null, null)),
  0,
  'a user with no contacts still gets an alert row, with zero recipients'
);
select is(
  (select display_name from public.start_alert(
     '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000001', 'button', now(),
     null, null, null, null)),
  null,
  'a user without a profile gets null profile fields, not an error'
);

-- ---------- server: claim and record ----------
select is(
  (select count(*)::int from public.claim_alert_recipients('aaaaaaaa-0000-0000-0000-000000000001')),
  2, 'first claim returns every pending recipient'
);
select is(
  (select count(*)::int from public.claim_alert_recipients('aaaaaaaa-0000-0000-0000-000000000001')),
  0, 'a second claim returns nothing while they are being sent'
);
select lives_ok(
  $$ select public.record_alert_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550101', 'sent', 'SM123', null) $$,
  'record a sent recipient'
);
select lives_ok(
  $$ select public.record_alert_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550102', 'failed', null, 'carrier error') $$,
  'record a failed recipient'
);
select results_eq(
  $$ select phone_e164 from public.claim_alert_recipients('aaaaaaaa-0000-0000-0000-000000000001') $$,
  $$ values ('+15555550102') $$,
  'a retry claims only the failed recipient, never the sent one'
);
select throws_ok(
  $$ select public.record_alert_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550102', 'pending', null, null) $$,
  '22023', null, 'record only accepts sent or failed'
);

-- A send that crashed mid-flight leaves 'sending'; after 60 s it is retried (missed alert is worse than duplicate).
update public.alert_recipients set updated_at = now() - interval '61 seconds'
 where alert_id = 'aaaaaaaa-0000-0000-0000-000000000001' and phone_e164 = '+15555550102';
select results_eq(
  $$ select phone_e164 from public.claim_alert_recipients('aaaaaaaa-0000-0000-0000-000000000001') $$,
  $$ values ('+15555550102') $$,
  'a recipient stuck in sending for over 60 s is reclaimed'
);
select is(
  (select count(*)::int from public.claim_alert_recipients('aaaaaaaa-0000-0000-0000-000000000001')),
  0, 'a fresh sending recipient is not reclaimed'
);

-- ---------- reads: owner only ----------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from public.alerts), 1, 'owner sees their alert');
select is((select count(*)::int from public.alert_recipients), 2, 'owner sees their alert recipients');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.alerts where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'other user cannot see the alert'
);
select is(
  (select count(*)::int from public.alert_recipients where alert_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0, 'other user cannot see the recipients'
);
select is((select count(*)::int from public.profiles), 0, 'other user cannot see the profile');

reset role;
set local role anon;
select throws_ok($$ select * from public.alerts $$, '42501', null, 'anon cannot read alerts');

select * from finish();
rollback;
