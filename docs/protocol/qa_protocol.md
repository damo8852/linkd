# QA Protocol

Automated checks (lint, typecheck, tests) run on every PR. On top of that, **anything BLE, background, permission, or alert-path related is tested on real phones** - simulators cannot do Bluetooth or realistic backgrounding.

---

## When on-device QA is required

| Change                                                                 | On-device QA           |
|------------------------------------------------------------------------|------------------------|
| Alert path, BLE, background behavior, permissions, notifications       | **Required, iOS + Android** |
| Other user-facing screens                                              | Required, one platform |
| Supabase-only change covered by pgTAP / Deno tests                     | Not required           |
| Docs, tooling, refactors with no behavior change                       | Not required           |

## Flow

1. Claude gets the branch green and posts the **QA checklist** (acceptance criteria as checkboxes) in the PR.
2. A developer runs it on devices and notes the device next to each box.
3. All boxes ticked -> the developer merges.

## Safety scenarios (run for any alert-path change)

Use a dev bangle (or the BLE simulator once one exists) and **sandbox SMS/dispatch only**.

- [ ] Button press/hold -> cancel window -> alert sent to contacts (sandbox)
- [ ] Cancel inside the cancel window -> nothing sent
- [ ] Walk out of range / power off bangle -> grace period -> cancel window -> alert
- [ ] Reconnect inside the grace period -> no alert
- [ ] Battery-critical message then disconnect -> **no alert**, battery warning shown
- [ ] App in background, phone locked -> trigger still works
- [ ] App force-quit (iOS) -> the documented warning/limitation behaves as designed
- [ ] No network at trigger time -> failure shown immediately, fallback offered
- [ ] Bluetooth turned off on the phone -> user warned, behaves per [sos_alert_flow.md](../design/sos_alert_flow.md)

## Device matrix

| Tester   | Device / OS version | Build type      |
|----------|---------------------|-----------------|
| `<name>` | `<iPhone, iOS xx>`  | dev build / EAS |
| `<name>` | `<Pixel, Android xx>` | dev build / EAS |

## Test data

Test accounts and synthetic contacts only (team members' own numbers, with consent). **Never trigger a live dispatch outside production, and never from a test.**
