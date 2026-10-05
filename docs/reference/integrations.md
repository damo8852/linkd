# External Service Integrations

Setup runbook per service. Shape: **Purpose -> Setup -> Env vars -> Verification**. Record variable **names** only; never commit values.

---

## Services

| Service               | Purpose                                     | Environments            |
|-----------------------|---------------------------------------------|-------------------------|
| Supabase              | Auth, Postgres, Edge Functions              | local, staging, prod    |
| Twilio                | SMS to emergency contacts                   | test creds in dev, live in prod |
| Resend                | SMTP for Supabase Auth email                | staging, prod           |
| Noonlight / RapidSOS  | Emergency dispatch (vendor not chosen)      | sandbox in dev, live in prod |
| Expo / EAS            | Dev builds, store builds, OTA updates       | all                     |

---

## Supabase

**Purpose:** backend for accounts, contacts, devices, alerts; Edge Functions send alerts.

**Setup:** install the Supabase CLI; `supabase start` for local; link the hosted project with `supabase link`. Hosted Auth settings must mirror `supabase/config.toml`: minimum password length 8, and the reset-password email template set to `supabase/templates/recovery.html` (it shows the 6-digit `{{ .Token }}`, not a link).

| Variable                        | Holds                                  | Used by          |
|---------------------------------|----------------------------------------|------------------|
| `EXPO_PUBLIC_SUPABASE_URL`      | Project URL (public)                   | app              |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key (public, RLS-protected)       | app              |
| `SUPABASE_SERVICE_ROLE_KEY`     | Service-role key (secret)              | Edge Functions only |

**Verification:** `supabase status` locally; app signs in against local stack.

## Twilio

**Purpose:** SMS alerts to emergency contacts.

**Setup:** `<account, messaging service / sender number>`. `SMS_PROVIDER` picks the provider in `send-alert`: `fake` (no network; tests and local dev), `sandbox` (Twilio test credentials: validated, never delivered, sender fixed to Twilio's test number), `live` (production only). Unset or unknown makes `send-alert` fail loud rather than skip texting. Locally, put `SMS_PROVIDER=fake` in `supabase/functions/.env` (gitignored) and run `npx supabase functions serve send-alert --env-file supabase/functions/.env`.

| Variable                  | Holds                                  | Used by        |
|---------------------------|----------------------------------------|----------------|
| `SMS_PROVIDER`            | `fake` / `sandbox` / `live`            | Edge Functions |
| `TWILIO_ACCOUNT_SID`      | Live account SID (`live` only)         | Edge Functions |
| `TWILIO_AUTH_TOKEN`       | Live auth token (secret, `live` only)  | Edge Functions |
| `TWILIO_FROM_NUMBER`      | Live sender number (`live` only)       | Edge Functions |
| `TWILIO_TEST_ACCOUNT_SID` | Test account SID (`sandbox` only)      | Edge Functions |
| `TWILIO_TEST_AUTH_TOKEN`  | Test auth token (secret, `sandbox`)    | Edge Functions |
| `SMS_STATUS_CALLBACK_URL` | Public URL of `sms-status` (`live`)    | Edge Functions |

**Rule:** `live` is set only in production.

**Verification:** with `SMS_PROVIDER=sandbox`, an alert to a contact on `+15005550001` is recorded as failed with Twilio error 21211; any other contact is recorded as sent.

**Delivery status:** `sent` only means Twilio accepted the text. In `live`, `send-alert` passes `SMS_STATUS_CALLBACK_URL` to Twilio as the message's `StatusCallback`, and Twilio then calls the `sms-status` function with the final result (`delivered`, `undelivered`, or `failed`). Set it to the function's exact public URL (`https://<project-ref>.supabase.co/functions/v1/sms-status`): `sms-status` checks Twilio's request signature against that same string and `TWILIO_AUTH_TOKEN`, and refuses everything if either is unset. If the variable is unset, SOS texts still send but no delivery status is recorded. Twilio test credentials never send status callbacks, so this path can only be exercised end to end with a live account.

## Resend

**Purpose:** SMTP for Supabase Auth email (sign-up confirmation, password reset). Free tier: 3,000 emails/month, 100/day.

**Setup:** create a Resend account, verify a sending domain, create an API key; in the hosted Supabase project set Auth -> SMTP to `smtp.resend.com`, port 465, user `resend`, password = the API key. Local dev keeps confirmations off and needs no SMTP.

| Variable         | Holds                                       | Used by                |
|------------------|---------------------------------------------|------------------------|
| `RESEND_API_KEY` | API key, used as the SMTP password (secret) | Supabase Auth (hosted) |

**Verification:** trigger a password reset for a team address on staging and receive it.

## Emergency dispatch (Noonlight or RapidSOS)

**Purpose:** professional dispatch to local authorities. **Vendor not chosen** - fill in once decided.

| Variable              | Holds                                  | Used by        |
|-----------------------|----------------------------------------|----------------|
| `DISPATCH_PROVIDER`   | `fake` / `sandbox` / `live`            | Edge Functions |
| `DISPATCH_API_TOKEN`  | Vendor API token (secret)              | Edge Functions |

**Rule:** `live` is set only in production.

## Expo / EAS

**Purpose:** dev builds (required for BLE), store builds, OTA updates.

**Setup:** `<EAS project id, Apple + Google credentials>`.

**Verification:** a dev build installs on a physical phone and connects to a bangle.
