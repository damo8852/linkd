# Supabase Protocol

Rules for `supabase/` - Postgres schema, row-level security (RLS), auth, and Edge Functions (Deno/TypeScript) that send alerts. Shared conventions: [core_protocol.md](core_protocol.md). Alert behavior: [sos_alert_flow.md](../design/sos_alert_flow.md). Service setup + env vars: [integrations.md](../reference/integrations.md).

---

## Schema and migrations

- Every schema change is a **SQL migration** in `supabase/migrations/` (`supabase migration new <name>`). Migrations are append-only - never edit one that has been applied to a shared environment; write a new one.
- **RLS is on for every table, no exceptions.** Each table ships with its policies in the same migration. Default posture: a user reads and writes only rows they own (`auth.uid()`).
- Regenerate TypeScript types after each migration (`supabase gen types typescript`) and commit them; the app and functions use the generated types, never hand-written row shapes.
- `seed.sql` holds **synthetic** data only. Never copy real users, contacts, or locations into dev.

## Auth

- Supabase Auth. Identity always comes from the verified JWT (`auth.uid()` in SQL, the verified user in functions) - never from a user id sent in a request body.
- The **service-role key** is used only inside Edge Functions and never ships in the app.

## Edge Functions (alert fan-out)

- One function per job (`send-alert`, `dispatch`, `battery-reminder`, ...). The handler validates input, then calls plain TS modules that do the work, so logic is testable without HTTP.
- **Providers behind interfaces.** SMS (Twilio) and emergency dispatch (Noonlight or RapidSOS, not yet chosen) are each behind a small interface with a **fake implementation** for tests and a **sandbox mode** for dev. Live providers are enabled only in production by config.
- **Idempotent alerts.** Each alert has a client-generated id; retries must not text contacts twice or open a second dispatch.
- **Record everything about an alert** (trigger, timestamps, recipients, per-recipient delivery status) in an `alerts` table so the app can show delivery status and failures are visible.
- **Fail loud.** A provider failure is returned to the app (which shows it and falls back) and recorded - never swallowed.
- Secrets via `supabase secrets set`; documented (names only) in [integrations.md](../reference/integrations.md).

## Testing

- **pgTAP** tests in `supabase/tests/` run with `supabase test db`. Every table's RLS is tested: owner can, other user cannot, anonymous cannot.
- **Deno tests** (`deno test`) for function logic with providers faked: correct recipients, message content, idempotency, and error handling - **test-first** for anything in the alert path.
- Never call live Twilio or a live dispatch API from a test.
