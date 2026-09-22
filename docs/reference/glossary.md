# Glossary

Term + one-line definition + link to the canonical spec. No inline spec content.

---

## Product Terms

| Term              | Definition                                                                           | Spec                                                  |
|-------------------|--------------------------------------------------------------------------------------|-------------------------------------------------------|
| LINKD             | The product: a safety bangle plus its companion app.                                 | [README](../../README.md)                             |
| Bangle            | The wearable: BLE SoC, coin cell, one button.                                        | [firmware_protocol.md](../protocol/firmware_protocol.md) |
| SOS / alert       | The emergency event that notifies contacts and/or dispatch.                          | [sos_alert_flow.md](../design/sos_alert_flow.md)      |
| Trigger           | What starts an SOS: button press/hold or link loss.                                  | [sos_alert_flow.md](../design/sos_alert_flow.md)      |
| Link / link loss  | The BLE connection between phone and bangle / its unexpected drop.                   | [ble_link_spec.md](../design/ble_link_spec.md)        |
| Grace period      | Wait after link loss before treating it as an emergency; a reconnect cancels it.     | [sos_alert_flow.md](../design/sos_alert_flow.md)      |
| Cancel window     | Countdown during which the user can cancel an SOS before it is sent.                 | [sos_alert_flow.md](../design/sos_alert_flow.md)      |
| Battery critical  | Bangle message sent just before shutdown so the next disconnect is not an SOS.       | [ble_link_spec.md](../design/ble_link_spec.md)        |
| Emergency contact | A person the user chose to receive SOS texts.                                        | [sos_alert_flow.md](../design/sos_alert_flow.md)      |
| Dispatch          | Professional emergency dispatch via Noonlight or RapidSOS.                           | [supabase_protocol.md](../protocol/supabase_protocol.md) |
| False alert       | An SOS sent when the user was not in danger.                                         | [sos_alert_flow.md](../design/sos_alert_flow.md)      |
| Missed alert      | An SOS that should have been sent and was not. The worse failure.                    | [sos_alert_flow.md](../design/sos_alert_flow.md)      |

## Technical Terms

| Term              | Definition                                                     | Code equivalent                 |
|-------------------|----------------------------------------------------------------|---------------------------------|
| Dev build         | Expo app build with native modules (needed for BLE).           | `expo run:*` / EAS Build        |
| Config plugin     | Expo mechanism for native config without editing `ios/`/`android/`. | `app.config.ts` plugins     |
| GATT              | BLE services/characteristics structure the bangle exposes.     | `packages/ble-protocol`         |
| RLS               | Postgres row-level security; per-user data isolation.          | policies in migrations          |
| Edge Function     | Server-side Deno function on Supabase; holds secrets.          | `supabase/functions/<name>/`    |
| Foreground service| Android mechanism to keep the BLE link alive in background.    | app native config               |
| State restoration | iOS CoreBluetooth relaunch of the app for BLE events.          | BLE manager restore identifier  |

## Workflow Terms

| Term            | Definition                                         | Code equivalent                   |
|-----------------|----------------------------------------------------|-----------------------------------|
| Tracked session | Has an issue + branch, ends in a PR.               | `feature/<n>-<slug>` branch       |
| Sandbox session | Exploration; no commits to `main`.                 | no branch                         |
| Locked decision | A decision that needs the unlock process to change.| [locked_decisions.md](locked_decisions.md) |
