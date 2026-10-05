# Supabase Protocol

Rules for `supabase/` - Postgres schema, row-level security (RLS), auth, and Edge Functions (Deno/TypeScript) that send alerts. Shared conventions: [core_protocol.md](core_protocol.md). Alert behavior: [sos_alert_flow.md](../design/sos_alert_flow.md). Service setup + env vars: [integrations.md](../reference/integrations.md).

---

## Schema and migrations

- Every schema change is a **SQL migration** in `supabase/migrations/` (`supabase migration new <name>`). Migrations are append-only - never edit one that has been applied to a shared environment; write a new one.
- **RLS is on for every table, no exceptions.** Each table ships with its policies in the same migration. Default posture: a user reads and writes only rows they own (`auth.uid()`).
- Regenerate TypeScript types after each migration (`npx supabase gen types typescript --local > supabase/types/database.ts`) and commit them (CI fails if they are stale); the app and functions use the generated types, never hand-written row shapes.
- `seed.sql` holds **synthetic** data only. Never copy real users, contacts, or locations into dev.

## Auth

- Supabase Auth. Identity always comes from the verified JWT (`auth.uid()` in SQL, the verified user in functions) - never from a user id sent in a request body.
- The **service-role key** is used only inside Edge Functions and never ships in the app.
- **Method: email + password.** Chosen to stay on free tiers: signing in sends no email, only sign-up confirmation and password reset do. Phone OTP was rejected for its per-SMS cost; revisit if that changes.
- **Auth email** goes through a custom SMTP (Resend free tier: 3,000/month, 100/day) on hosted projects. Supabase's built-in SMTP is for development only (2 emails/hour, team addresses only). Email confirmation is on for hosted projects so a reset email can reach the user; it is off locally (`supabase/config.toml`).
- **Sessions never time out.** No time-boxed session or inactivity timeout; refresh tokens rotate and do not expire, so a user is not signed out mid-day. Recovery is a password-reset email.
- **The user's own phone number** is required at onboarding (entered twice to catch typos) and stored unverified. It is the callback number in contact SMS and passed to dispatch. It must be verified by SMS before launch. Only the server sets `phone_verified`, and changing the number clears it.
- **The profile row is created by the app at onboarding, not by a sign-up trigger,** because the name and phone are required and only known then. It also holds `dispatch_enabled` (default on). A user with no profile row yet is treated as dispatch on.
- **Signed out never blocks an SOS.** Alert functions accept either the user's JWT or an **alert token** (per install, stored hashed, scoped to sending, updating, and ending that user's alerts only). Identity comes from the verified token, never the request body. Revoked only by removing the device. Behavior: [sos_alert_flow.md - Signed out](../design/sos_alert_flow.md#signed-out).

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
- **Deno is a pinned npm dev dependency** (`npx deno`), so every OS and CI use the same version. Each function folder has its own `deno.json` (import map, `"nodeModulesDir": "none"`) and is tested from that folder: `npx deno check index.ts && npx deno lint && npx deno test`. The local edge runtime embeds an older Deno than the CLI (check `supabase functions serve` output), so avoid Deno APIs newer than the runtime.
- Never call live Twilio or a live dispatch API from a test.
