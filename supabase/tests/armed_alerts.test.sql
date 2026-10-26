-- Server-armed countdowns: the server sends an armed alert when due unless it was disarmed first.
-- A bug here sends an SOS the user cancelled (false alert) or never sends one the phone could not.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.test');

-- ---------- users cannot touch armed alerts or call the server functions ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.armed_alerts $$,
  '42501', null, 'a user cannot read armed alerts'
);
select throws_ok(
  $$ insert into public.armed_alerts (id, user_id) values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'a user cannot write armed alerts'
);
select throws_ok(
  $$ select public.arm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'button', 5000) $$,
  '42501', null, 'a user cannot call arm_alert'
);
select throws_ok(
  $$ select public.disarm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', null, 'a user cannot call disarm_alert'
);
select throws_ok(
  $$ select * from public.claim_due_armed_alerts() $$,
  '42501', null, 'a user cannot call claim_due_armed_alerts'
);
reset role;

set local role anon;
select throws_ok(
  $$ select * from public.armed_alerts $$,
  '42501', null, 'anonymous cannot read armed alerts'
);
reset role;

-- ---------- arm ----------
set local role service_role;

select is(
  public.arm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'linkLoss', 50000),
  'armed', 'arming returns armed'
);
select ok(
  (select send_at between now() + interval '49 seconds' and now() + interval '51 seconds'
     from public.armed_alerts where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'send_at is the server clock plus the delay, never a phone timestamp'
);
select is(
  public.arm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'button', 5000),
  'armed', 're-arming the same id is accepted'
);
select results_eq(
  $$ select trigger, send_at < now() + interval '6 seconds' from public.armed_alerts
      where id = 'aaaaaaaa-0000-0000-0000-000000000001' $$,
  $$ values ('button', true) $$,
  'a hold during grace re-arms for the sooner button window and its trigger'
);
select public.arm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'linkLoss', 50000);
select ok(
  (select send_at < now() + interval '6 seconds' from public.armed_alerts where id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  'a later arm never postpones a send'
);
select throws_ok(
  $$ select public.arm_alert('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'button', 5000) $$,
  '42501', 'alert id belongs to another user', 'another user cannot arm or re-arm the id'
);
select throws_ok(
  $$ select public.arm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000009', 'button', 60001) $$,
  '22023', null, 'a delay over 60 s is rejected'
);
select throws_ok(
  $$ select public.arm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000009', 'nope', 5000) $$,
  '23514', null, 'an unknown trigger is rejected'
);

-- ---------- disarm ----------
select is(
  public.disarm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001'),
  'disarmed', 'disarming before the send returns disarmed'
);
select throws_ok(
  $$ select public.disarm_alert('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001') $$,
  '42501', 'alert id belongs to another user', 'another user cannot disarm the id'
);
select is(
  public.arm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'button', 0),
  'disarmed', 'an arm after a disarm does not revive it'
);

select is(
  public.disarm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002'),
  'disarmed', 'a disarm that arrives before its arm is recorded'
);
select is(
  public.arm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000002', 'button', 0),
  'disarmed', 'so the arm still in flight cannot send it'
);

-- ---------- claim: due, not disarmed, once ----------
select public.arm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003', 'inApp', 0);
select public.arm_alert('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000004', 'button', 30000);

select results_eq(
  $$ select id, user_id, trigger from public.claim_due_armed_alerts() $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, '11111111-1111-1111-1111-111111111111'::uuid, 'inApp') $$,
  'only the due, armed alert is claimed, never a disarmed or future one'
);
select is_empty(
  $$ select * from public.claim_due_armed_alerts() $$,
  'a claimed alert is not claimed again'
);
select is(
  public.disarm_alert('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000003'),
  'fired', 'a disarm after the send returns fired, so the app can warn and end it'
);

-- ---------- retry after a failed send ----------
select public.retry_armed_alert('aaaaaaaa-0000-0000-0000-000000000003', 0);
select results_eq(
  $$ select id from public.claim_due_armed_alerts() $$,
  $$ values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid) $$,
  'a fired alert whose send failed is claimed again when its retry is due'
);
select public.retry_armed_alert('aaaaaaaa-0000-0000-0000-000000000003', 5000);
select is_empty(
  $$ select * from public.claim_due_armed_alerts() $$,
  'but not before the retry delay'
);
select public.retry_armed_alert('aaaaaaaa-0000-0000-0000-000000000003', null);
update public.armed_alerts set send_at = now() - interval '1 hour' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select is_empty(
  $$ select * from public.claim_due_armed_alerts() $$,
  'a send that finished is never claimed again'
);

select * from finish();
rollback;
