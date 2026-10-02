-- Synthetic dev data only. Never real people, numbers, or locations.
-- 555-01xx numbers are reserved for fiction and never reach a real phone.
-- The user has no password: sign-in seeding comes with the auth UI.

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-00000000d001', 'authenticated', 'authenticated', 'dev@example.test', now(),
        '{"provider":"email","providers":["email"]}', '{}', '', '', '', '');

insert into public.profiles (user_id, display_name, phone_e164) values
  ('00000000-0000-0000-0000-00000000d001', 'Dev User', '+15555550199');

insert into public.emergency_contacts (user_id, name, phone_e164, status) values
  ('00000000-0000-0000-0000-00000000d001', 'Test Contact One',   '+15555550100', 'active'),
  ('00000000-0000-0000-0000-00000000d001', 'Test Contact Two',   '+15555550101', 'active'),
  ('00000000-0000-0000-0000-00000000d001', 'Test Contact Three', '+15555550102', 'opted_out');
