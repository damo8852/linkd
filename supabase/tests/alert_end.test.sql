-- Ending an alert: who gets the end text, exactly once, and that an ended alert stops SOS texts.
-- A bug here tells contacts the user is safe when she is not, or texts "SOS" after "I'm safe".
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.test');

insert into public.profiles (user_id, display_name, phone_e164) values
  ('11111111-1111-1111-1111-111111111111', 'Test User', '+15555550199');

insert into public.emergency_contacts (user_id, name, phone_e164, status) values
  ('11111111-1111-1111-1111-111111111111', 'A', '+15555550101', 'active'),
  ('11111111-1111-1111-1111-111111111111', 'B', '+15555550102', 'active'),
  ('11111111-1111-1111-1111-111111111111', 'C', '+15555550103', 'active');

-- An alert in flight: A was texted, B failed, C is still pending.
set local role service_role;
select public.start_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
                          'button', now(), null, null, null, null);
select public.claim_alert_recipients('aaaaaaaa-0000-0000-0000-000000000001');
select public.record_alert_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550101', 'sent', 'SM1', null);
select public.record_alert_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550102', 'failed', null, 'carrier error');
reset role;
update public.alert_recipients set status = 'pending'
 where alert_id = 'aaaaaaaa-0000-0000-0000-000000000001' and phone_e164 = '+15555550103';

-- ---------- users cannot end an alert themselves or call the server functions ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ update public.alerts set ended_at = now(), ended_reason = 'user' $$,
  '42501', null, 'owner cannot mark an alert ended directly'
);
select throws_ok(
  $$ select public.end_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'user') $$,
  '42501', null, 'user cannot call end_alert'
);
select throws_ok(
  $$ select public.claim_alert_end_recipients('aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'user cannot call claim_alert_end_recipients'
);
select throws_ok(
  $$ select public.record_alert_end_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550101', 'sent', null, null) $$,
  '42501', null, 'user cannot call record_alert_end_recipient'
);

-- ---------- server: end_alert ----------
reset role;
set local role service_role;

select throws_ok(
  $$ select public.end_alert('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'user') $$,
  '42501', 'alert id belongs to another user', 'another user cannot end the alert'
);
select throws_ok(
  $$ select public.end_alert('11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000001', 'user') $$,
  'P0002', null, 'an unknown alert id is an error, not a silent success'
);
select throws_ok(
  $$ select public.end_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'safe') $$,
  '22023', null, 'the reason must be user or timeout'
);
select is(
  (select ended_at from public.alerts where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  null, 'a rejected end leaves the alert active'
);
select is(
  (select count(*)::int from public.alert_recipients where end_status is not null),
  0, 'a rejected end queues no end text'
);

select results_eq(
  $$ select display_name, phone_e164, ended_reason, recipient_count
       from public.end_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'user') $$,
  $$ values ('Test User', '+15555550199', 'user', 1) $$,
  'end_alert returns the profile, how it ended, and how many get the end text'
);
select is(
  (select ended_reason from public.alerts where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'user', 'the alert records how it ended'
);
select isnt(
  (select ended_at from public.alerts where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  null, 'the alert records when it ended'
);
select results_eq(
  $$ select phone_e164, end_status from public.alert_recipients order by phone_e164 $$,
  $$ values ('+15555550101', 'pending'), ('+15555550102', null), ('+15555550103', null) $$,
  'only the recipient whose SOS was sent is queued for the end text'
);

-- The first end wins: a later call never changes when or how the alert ended.
update public.alerts set ended_at = '2026-10-01 12:00:00+00' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select results_eq(
  $$ select ended_reason, ended_at
       from public.end_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'timeout') $$,
  $$ values ('user', '2026-10-01 12:00:00+00'::timestamptz) $$,
  'ending again returns the first end, unchanged'
);
select is(
  (select ended_reason from public.alerts where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'user', 'a later timeout never overwrites a user end'
);

-- ---------- an ended alert stops SOS texts ----------
select is(
  (select count(*)::int from public.claim_alert_recipients('aaaaaaaa-0000-0000-0000-000000000001')),
  0, 'the failed and pending SOS recipients are never claimed once the alert has ended'
);
select results_eq(
  $$ select phone_e164, status from public.alert_recipients order by phone_e164 $$,
  $$ values ('+15555550101', 'sent'), ('+15555550102', 'failed'), ('+15555550103', 'pending') $$,
  'SOS statuses are untouched by the end'
);

-- ---------- server: claim and record the end text ----------
select results_eq(
  $$ select phone_e164 from public.claim_alert_end_recipients('aaaaaaaa-0000-0000-0000-000000000001') $$,
  $$ values ('+15555550101') $$,
  'first claim returns the queued recipient'
);
select is(
  (select count(*)::int from public.claim_alert_end_recipients('aaaaaaaa-0000-0000-0000-000000000001')),
  0, 'a second claim returns nothing while the text is being sent'
);
select lives_ok(
  $$ select public.record_alert_end_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550101', 'failed', null, 'carrier error') $$,
  'record a failed end text'
);
select results_eq(
  $$ select phone_e164 from public.claim_alert_end_recipients('aaaaaaaa-0000-0000-0000-000000000001') $$,
  $$ values ('+15555550101') $$,
  'a retry claims the failed recipient'
);

-- A send that crashed mid-flight leaves 'sending'; after 60 s it is retried.
update public.alert_recipients set end_updated_at = now() - interval '61 seconds'
 where alert_id = 'aaaaaaaa-0000-0000-0000-000000000001' and phone_e164 = '+15555550101';
select results_eq(
  $$ select phone_e164 from public.claim_alert_end_recipients('aaaaaaaa-0000-0000-0000-000000000001') $$,
  $$ values ('+15555550101') $$,
  'a recipient stuck in sending for over 60 s is reclaimed'
);
select lives_ok(
  $$ select public.record_alert_end_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550101', 'sent', 'SM9', null) $$,
  'record a sent end text'
);
select lives_ok(
  $$ select public.record_alert_end_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550101', 'failed', null, 'late') $$,
  'a late failure report is accepted'
);
select results_eq(
  $$ select end_status, end_provider_message_id, provider_message_id from public.alert_recipients
      where phone_e164 = '+15555550101' $$,
  $$ values ('sent', 'SM9', 'SM1') $$,
  'a sent end text is never downgraded, and the SOS message id is kept'
);
select throws_ok(
  $$ select public.record_alert_end_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550101', 'pending', null, null) $$,
  '22023', null, 'record only accepts sent or failed'
);
select is(
  (select recipient_count
     from public.end_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'user')),
  1, 'ending again after the text was sent queues nobody new'
);
select is(
  (select count(*)::int from public.claim_alert_end_recipients('aaaaaaaa-0000-0000-0000-000000000001')),
  0, 'so a retry texts nobody twice'
);

-- ---------- reads: owner only ----------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.alerts where ended_at is not null),
  0, 'other user cannot see that the alert ended'
);

select * from finish();
rollback;
