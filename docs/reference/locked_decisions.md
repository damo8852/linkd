# Locked Decisions

The canon. Work that contradicts a decision here halts until it is unlocked ([session_protocol.md](../protocol/session_protocol.md#enforcement-rules), Rule 1).

- **Hard** - settled; changing it needs the unlock process.
- **Soft** - current default; can move with less ceremony, but record the change here.

---

## Technical Stack

| Item               | Locked Value / State                                                        | Lock Type |
|--------------------|-----------------------------------------------------------------------------|-----------|
| Language           | TypeScript (strict) for app, packages, and Edge Functions                   | Hard      |
| Mobile framework   | React Native + Expo, development builds (not Expo Go), expo-router          | Hard      |
| Platforms          | iOS + Android                                                               | Hard      |
| BLE library        | react-native-ble-plx (via its Expo config plugin)                           | Soft      |
| Backend            | Supabase: Postgres + RLS, Supabase Auth, Edge Functions (Deno)              | Hard      |
| Auth method        | Email + password, no session timeout, reset by emailed code. [supabase_protocol.md](../protocol/supabase_protocol.md#auth) | Soft      |
| Auth email         | Resend (free tier) as the custom SMTP for Supabase Auth                     | Soft      |
| SMS provider       | Twilio, called only from Edge Functions                                     | Soft      |
| Emergency dispatch | Noonlight or RapidSOS (vendor open), behind a provider interface            | Soft      |
| Package manager    | npm workspaces                                                              | Hard      |
| Phone numbers      | libphonenumber-js, E.164, US/Canada default region                          | Soft      |
| App testing        | Jest (`jest-expo`) + React Native Testing Library                           | Soft      |
| Backend testing    | pgTAP (`supabase test db`) + `deno test`                                    | Soft      |
| Builds / releases  | EAS Build + EAS Update                                                      | Soft      |

## Architecture

| Item                  | Locked Value / State                                                                                   | Lock Type |
|-----------------------|--------------------------------------------------------------------------------------------------------|-----------|
| Repo shape            | Monorepo: `apps/mobile`, `packages/ble-protocol`, `supabase/`, `firmware/` (dormant). [core_protocol.md](../protocol/core_protocol.md#repo-layout) | Hard      |
| BLE source of truth   | `packages/ble-protocol`; firmware uses a generated C header. [ble_protocol.md](../protocol/ble_protocol.md) | Hard      |
| Alert logic placement | Platform-free TS state machine in `apps/mobile/src/features/sos/`, clock injected                     | Hard      |
| Secrets               | Only in Edge Function secrets; the app ships only the Supabase URL + anon key                          | Hard      |
| Data access           | RLS on every table; identity from the verified JWT                                                    | Hard      |

## Product

| Item               | Locked Value / State                                                                         | Lock Type |
|--------------------|----------------------------------------------------------------------------------------------|-----------|
| SOS triggers       | Bangle button hold, in-app SOS hold, and BLE link loss (after grace period + cancel window)  | Hard      |
| Battery            | User-replaceable coin cell; bangle reports battery and sends battery-critical before shutdown | Hard      |
| Alert recipients   | SMS to chosen emergency contacts (always) + emergency dispatch (user setting, default on)    | Hard      |
| Alert timings      | Hold 3 s; cancel 5 s (button), 20 s grace + 30 s cancel (link loss); live location 60 min    | Soft      |
| Cancel / end auth  | Device unlock to cancel or end an alert; no input sends. No screen lock: plain tap + warning | Hard      |
| Link reconnect     | Never cancels by itself; must be up 5 s during grace; hold in link-loss window sends now     | Hard      |
| Benign link loss   | Battery-critical, phone Bluetooth off, phone dying: warn only, never an SOS                  | Hard      |
| Offline fallback   | Idempotent server retry + native SMS composer prefilled with cached contacts                 | Hard      |
| Emergency contacts | Max 5 active; intro SMS on add, active immediately; STOP opts out (kept, never texted)       | Soft      |
| Signed-out SOS     | Alert token sends as if signed in; sign-out keeps cache; only device removal disarms         | Hard      |
| Visual style       | "Pink drink", dark only; system body font, Bagel Fat One display. [style_guide.md](../design/style_guide.md) | Soft      |
| v1 hardware scope  | No haptic motor, no status LED, no accelerometer                                             | Soft      |

## Workflow

| Item          | Locked Value / State                                                                              | Lock Type |
|---------------|---------------------------------------------------------------------------------------------------|-----------|
| Issue tracker | GitHub Issues in this repo, with labels ([authoring.md](authoring.md#labels))                     | Hard      |
| Branching     | No direct commits to `main`; `feature/<issue#>-<slug>` / `bugfix/<issue#>-<slug>`; PR + CI; developer merges; branch deleted on merge | Hard      |
| Session types | Tracked and Sandbox                                                                               | Hard      |
| Testing bar   | Strict test-first for safety-critical code; tested-in-same-PR for the rest                         | Hard      |

---

## Open Questions

Turn each into a GitHub issue (label `decision`) before working on it.

- Duress PIN, Bluetooth-off as an attack - see [sos_alert_flow.md](../design/sos_alert_flow.md#open-questions).
- BLE UUIDs, byte layouts, bonding/security - see [ble_link_spec.md](../design/ble_link_spec.md#open-questions).
- Dispatch vendor: Noonlight vs RapidSOS.
- Android foreground-service implementation (library or custom Expo module).
- Server-state library for the app (e.g. TanStack Query) or plain hooks.
- Firmware toolchain (nRF Connect SDK / Zephyr assumed) and test approach; target SoC (nRF52832 / nRF52840 / nRF54L15).
