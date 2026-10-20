-- Waitlist signups now go through the join-waitlist Edge Function, which checks a Cloudflare
-- Turnstile token and inserts with the service role. Clients lose direct insert so bots cannot
-- skip the captcha by calling the REST API with the public anon key.

drop policy "anyone: insert" on public.waitlist;
revoke insert on public.waitlist from anon, authenticated;
