-- waitlist: the landing page adds emails anonymously; nobody reads the list from a client.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.test');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.waitlist'::regclass),
  'RLS is enabled'
);

-- ---------- anon (the landing page) ----------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select lives_ok(
  $$ insert into public.waitlist (email) values ('early@example.test') $$,
  'anon can join the waitlist'
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

select lives_ok(
  $$ insert into public.waitlist (email) values ('u1@example.test') $$,
  'a signed-in user can join the waitlist'
);
select throws_ok(
  $$ select * from public.waitlist $$,
  '42501', null, 'a signed-in user cannot read the waitlist'
);

reset role;
select is((select count(*)::int from public.waitlist), 2, 'only the two valid signups were stored');

select * from finish();
rollback;
