-- Handset delivery of SOS texts, reported by the SMS provider after it accepted them.
-- A text the carrier dropped must never look delivered: that would be a silent missed alert.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.test');

insert into public.emergency_contacts (user_id, name, phone_e164) values
  ('11111111-1111-1111-1111-111111111111', 'A', '+15555550101'),
  ('11111111-1111-1111-1111-111111111111', 'B', '+15555550102'),
  ('11111111-1111-1111-1111-111111111111', 'C', '+15555550103');

set local role service_role;
do $$ begin
  perform public.start_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001',
                             'button', now(), null, null, null, null);
  perform public.claim_alert_recipients('aaaaaaaa-0000-0000-0000-000000000001');
  perform public.record_alert_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550101', 'sent', 'SM1', null);
  perform public.record_alert_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550102', 'sent', 'SM2', null);
  perform public.record_alert_recipient('aaaaaaaa-0000-0000-0000-000000000001', '+15555550103', 'sent', 'SM3', null);
end $$;

select is(
  (select count(*)::int from public.alert_recipients where delivery_status is not null),
  0, 'a sent text has no delivery status until the provider reports one'
);

-- ---------- server: record_alert_delivery ----------
select is(public.record_alert_delivery('SM1', 'delivered', null), true, 'a known message id is recorded');
select is(
  (select delivery_status from public.alert_recipients where provider_message_id = 'SM1'),
  'delivered', 'delivered is saved'
);
select is(public.record_alert_delivery('SM2', 'undelivered', '30003'), true, 'undelivered is recorded');
select results_eq(
  $$ select delivery_status, delivery_error from public.alert_recipients where provider_message_id = 'SM2' $$,
  $$ values ('undelivered', '30003') $$,
  'undelivered is saved with the provider error code'
);
select is(public.record_alert_delivery('SM3', 'failed', '30008'), true, 'failed is recorded');
select is(
  (select delivery_status from public.alert_recipients where provider_message_id = 'SM3'),
  'failed', 'failed is saved'
);
select is(
  (select count(*)::int from public.alert_recipients where status = 'sent'),
  3, 'a delivery report never changes the send status, so a retry texts nobody twice'
);

select is(public.record_alert_delivery('SM-unknown', 'undelivered', null), false, 'an unknown message id matches nothing');
select throws_ok(
  $$ select public.record_alert_delivery('SM1', 'sent', null) $$,
  '22023', null, 'only final delivery statuses are accepted'
);

-- A late or repeated "delivered" must never hide a failure.
select is(public.record_alert_delivery('SM2', 'delivered', null), true, 'a late delivered for a known message is acknowledged');
select results_eq(
  $$ select delivery_status, delivery_error from public.alert_recipients where provider_message_id = 'SM2' $$,
  $$ values ('undelivered', '30003') $$,
  'the undelivered record is kept'
);
select is(public.record_alert_delivery('SM1', 'undelivered', '30005'), true, 'a failure overwrites delivered');
select is(
  (select delivery_status from public.alert_recipients where provider_message_id = 'SM1'),
  'undelivered', 'the failure is what the owner sees'
);

-- ---------- users ----------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ select public.record_alert_delivery('SM3', 'delivered', null) $$,
  '42501', null, 'user cannot call record_alert_delivery'
);
select throws_ok(
  $$ update public.alert_recipients set delivery_status = 'delivered' $$,
  '42501', null, 'user cannot write a delivery status'
);
select is(
  (select count(*)::int from public.alert_recipients where delivery_status in ('undelivered', 'failed')),
  3, 'owner sees which texts did not arrive'
);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.alert_recipients),
  0, 'other user cannot see delivery status'
);

reset role;
set local role anon;
select throws_ok(
  $$ select public.record_alert_delivery('SM3', 'delivered', null) $$,
  '42501', null, 'anon cannot call record_alert_delivery'
);

select * from finish();
rollback;
