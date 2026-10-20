-- Waitlist: emails collected by the landing page (apps/web) for early-bird pricing.
-- Clients may only add a row; the list is read with the service role (dashboard / SQL).

create table public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null check (
                char_length(email) <= 254
                and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
              ),
  created_at  timestamptz not null default now()
);

-- One signup per address, whatever its case.
create unique index waitlist_email_key on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

-- Supabase's default privileges grant everything to anon and authenticated; narrow them.
revoke all on public.waitlist from anon, authenticated;
grant insert (email) on public.waitlist to anon, authenticated;

create policy "anyone: insert" on public.waitlist
  for insert to anon, authenticated with check (true);
