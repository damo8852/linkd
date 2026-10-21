-- waitlist: only the join-waitlist Edge Function (service role, after a captcha) adds emails;
-- no client can read, add, change, or delete rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.test');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.waitlist'::regclass),
  'RLS is enabled'
);

-- ---------- service role (the Edge Function) ----------
set local role service_role;

select lives_ok(
  $$ insert into public.waitlist (email) values ('early@example.test') $$,
  'the service role can add a signup'
);
select throws_ok(
  $$ insert into public.waitlist (email) values ('EARLY@example.test') $$,
  '23505', null, 'the same email in another case is a duplicate'
);
select throws_ok(
  $$ insert into public.waitlist (email) values ('not-an-email') $$,
  '23514', null, 'a malformed email is rejected'
);
select throws_ok(
  $$ insert into public.waitlist (email) values (repeat('a', 250) || '@x.io') $$,
  '23514', null, 'an over-long email is rejected'
);

-- ---------- anon (the public anon key) ----------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$ insert into public.waitlist (email) values ('bot@example.test') $$,
  '42501', null, 'anon cannot add a signup directly (captcha would be skipped)'
);
select throws_ok(
  $$ select * from public.waitlist $$,
  '42501', null, 'anon cannot read the waitlist'
);
select throws_ok(
  $$ update public.waitlist set email = 'x@example.test' $$,
  '42501', null, 'anon cannot change the waitlist'
);
select throws_ok(
  $$ delete from public.waitlist $$,
  '42501', null, 'anon cannot delete from the waitlist'
);

-- ---------- signed-in user ----------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.waitlist (email) values ('u1@example.test') $$,
  '42501', null, 'a signed-in user cannot add a signup directly'
);
select throws_ok(
  $$ select * from public.waitlist $$,
  '42501', null, 'a signed-in user cannot read the waitlist'
);

reset role;
select is((select count(*)::int from public.waitlist), 1, 'only the one valid signup was stored');

select * from finish();
rollback;
