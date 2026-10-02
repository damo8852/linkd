-- RLS, constraints, and the active-contact limit on emergency_contacts.
-- This table decides who is texted in an SOS, so every access path is checked.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Synthetic users (as postgres, before switching roles)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.test');

select has_table('public', 'emergency_contacts', 'table exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.emergency_contacts'::regclass),
  'RLS is enabled'
);

-- ---------- user 1 ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.emergency_contacts (name, phone_e164) values ('Contact A', '+15555550101') $$,
  'user can add a contact'
);
select is(
  (select user_id from public.emergency_contacts where phone_e164 = '+15555550101'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'user_id defaults to the caller'
);
select is(
  (select status from public.emergency_contacts where phone_e164 = '+15555550101'),
  'active',
  'new contacts are active'
);
select throws_ok(
  $$ insert into public.emergency_contacts (user_id, name, phone_e164)
     values ('22222222-2222-2222-2222-222222222222', 'Sneaky', '+15555550199') $$,
  '42501', null,
  'user cannot add a contact for another user'
);
select throws_ok(
  $$ insert into public.emergency_contacts (name, phone_e164) values ('Bad', '5555550102') $$,
  '23514', null,
  'phone must be E.164'
);
select throws_ok(
  $$ insert into public.emergency_contacts (name, phone_e164) values ('  ', '+15555550103') $$,
  '23514', null,
  'name cannot be blank'
);
select throws_ok(
  $$ insert into public.emergency_contacts (name, phone_e164, status) values ('X', '+15555550104', 'opted_out') $$,
  '42501', null,
  'user cannot set status on insert'
);
select throws_ok(
  $$ update public.emergency_contacts set status = 'opted_out' where phone_e164 = '+15555550101' $$,
  '42501', null,
  'user cannot change status'
);
select throws_ok(
  $$ update public.emergency_contacts set phone_e164 = '+15555550105' where phone_e164 = '+15555550101' $$,
  '42501', null,
  'user cannot change a contact''s phone number (remove and re-add instead)'
);
select lives_ok(
  $$ update public.emergency_contacts set name = 'Contact A2' where phone_e164 = '+15555550101' $$,
  'user can rename a contact'
);
select throws_ok(
  $$ insert into public.emergency_contacts (name, phone_e164) values ('Dup', '+15555550101') $$,
  '23505', null,
  'same number cannot be added twice'
);
select lives_ok(
  $$ insert into public.emergency_contacts (name, phone_e164) values
       ('Contact B', '+15555550111'), ('Contact C', '+15555550112'),
       ('Contact D', '+15555550113'), ('Contact E', '+15555550114') $$,
  'user can have 5 active contacts'
);
select throws_ok(
  $$ insert into public.emergency_contacts (name, phone_e164) values ('Contact F', '+15555550115') $$,
  '23514', 'emergency contact limit reached (max 5 active)',
  'a 6th active contact is rejected'
);

-- ---------- user 2 cannot see or touch user 1's contacts ----------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.emergency_contacts),
  0,
  'other user sees none of user 1''s contacts'
);
update public.emergency_contacts set name = 'Hijacked' where phone_e164 = '+15555550101';
delete from public.emergency_contacts where phone_e164 = '+15555550111';
select lives_ok(
  $$ insert into public.emergency_contacts (name, phone_e164) values ('U2 contact', '+15555550101') $$,
  'different users can share a contact number'
);

-- ---------- anon has no access ----------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select * from public.emergency_contacts $$,
  '42501', null,
  'anon cannot read contacts'
);

-- ---------- back as postgres: user 2's attempts changed nothing ----------
reset role;
select is(
  (select name from public.emergency_contacts
    where user_id = '11111111-1111-1111-1111-111111111111' and phone_e164 = '+15555550101'),
  'Contact A2',
  'other user could not rename user 1''s contact'
);
select is(
  (select count(*)::int from public.emergency_contacts where user_id = '11111111-1111-1111-1111-111111111111'),
  5,
  'other user could not delete user 1''s contact'
);

-- STOP handler (server) opts a contact out; that frees a slot
update public.emergency_contacts set status = 'opted_out'
 where user_id = '11111111-1111-1111-1111-111111111111' and phone_e164 = '+15555550114';

-- ---------- user 1 again ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.emergency_contacts (name, phone_e164) values ('Contact F', '+15555550115') $$,
  'an opted-out contact frees a slot'
);
delete from public.emergency_contacts where phone_e164 = '+15555550114';
select is(
  (select status from public.emergency_contacts where phone_e164 = '+15555550114'),
  'opted_out',
  'user cannot delete an opted-out contact'
);
delete from public.emergency_contacts where phone_e164 = '+15555550113';
select is(
  (select count(*)::int from public.emergency_contacts where phone_e164 = '+15555550113'),
  0,
  'user can delete an active contact'
);
-- A slot is free now, so this can only fail on the opted-out number itself
select throws_ok(
  $$ insert into public.emergency_contacts (name, phone_e164) values ('Again', '+15555550114') $$,
  '23505', null,
  'user cannot re-add a number that opted out'
);

select * from finish();
rollback;
