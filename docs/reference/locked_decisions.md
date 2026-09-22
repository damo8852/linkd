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
| SMS provider       | Twilio, called only from Edge Functions                                     | Soft      |
| Emergency dispatch | Noonlight or RapidSOS (vendor open), behind a provider interface            | Soft      |
| Package manager    | npm workspaces                                                              | Hard      |
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
| SOS triggers       | Bangle button press/hold, and BLE link loss (after grace period + cancel window)             | Hard      |
| Battery            | User-replaceable coin cell; bangle reports battery and sends battery-critical before shutdown | Hard      |
| Alert recipients   | SMS to chosen emergency contacts + emergency dispatch                                        | Hard      |
| v1 hardware scope  | No haptic motor, no status LED, no accelerometer                                             | Soft      |

## Workflow

| Item          | Locked Value / State                                                                              | Lock Type |
|---------------|---------------------------------------------------------------------------------------------------|-----------|
| Issue tracker | GitHub Issues in this repo, with labels ([authoring.md](authoring.md#labels))                     | Hard      |
| Branching     | Protected `main`; `feature/<issue#>-<slug>` / `bugfix/<issue#>-<slug>`; PR + CI; developer merges | Hard      |
| Session types | Tracked and Sandbox                                                                               | Hard      |
| Testing bar   | Strict test-first for safety-critical code; tested-in-same-PR for the rest                         | Hard      |

---

## Open Questions

Turn each into a GitHub issue (label `decision`) before working on it.

- Alert timings, trigger gesture, offline fallback, iOS force-quit handling - see [sos_alert_flow.md](../design/sos_alert_flow.md#open-questions).
- BLE UUIDs, byte layouts, bonding/security - see [ble_link_spec.md](../design/ble_link_spec.md#open-questions).
- Dispatch vendor: Noonlight vs RapidSOS.
- Auth method: phone OTP, email, or both.
- Android foreground-service implementation (library or custom Expo module).
- Server-state library for the app (e.g. TanStack Query) or plain hooks.
- Firmware toolchain (nRF Connect SDK / Zephyr assumed) and test approach; target SoC (nRF52832 / nRF52840 / nRF54L15).
