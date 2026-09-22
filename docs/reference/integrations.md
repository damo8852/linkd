# External Service Integrations

Setup runbook per service. Shape: **Purpose -> Setup -> Env vars -> Verification**. Record variable **names** only; never commit values.

---

## Services

| Service               | Purpose                                     | Environments            |
|-----------------------|---------------------------------------------|-------------------------|
| Supabase              | Auth, Postgres, Edge Functions              | local, staging, prod    |
| Twilio                | SMS to emergency contacts                   | test creds in dev, live in prod |
| Noonlight / RapidSOS  | Emergency dispatch (vendor not chosen)      | sandbox in dev, live in prod |
| Expo / EAS            | Dev builds, store builds, OTA updates       | all                     |

---

## Supabase

**Purpose:** backend for accounts, contacts, devices, alerts; Edge Functions send alerts.

**Setup:** install the Supabase CLI; `supabase start` for local; link the hosted project with `supabase link`.

| Variable                        | Holds                                  | Used by          |
|---------------------------------|----------------------------------------|------------------|
| `EXPO_PUBLIC_SUPABASE_URL`      | Project URL (public)                   | app              |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Anon key (public, RLS-protected)       | app              |
| `SUPABASE_SERVICE_ROLE_KEY`     | Service-role key (secret)              | Edge Functions only |

**Verification:** `supabase status` locally; app signs in against local stack.

## Twilio

**Purpose:** SMS alerts to emergency contacts.

**Setup:** `<account, messaging service / sender number, test credentials for dev>`.

| Variable             | Holds                    | Used by        |
|----------------------|--------------------------|----------------|
| `TWILIO_ACCOUNT_SID` | Account SID              | Edge Functions |
| `TWILIO_AUTH_TOKEN`  | Auth token (secret)      | Edge Functions |
| `TWILIO_FROM_NUMBER` | Sender number / service  | Edge Functions |

**Verification:** `<send to a team number using test credentials>`.

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
