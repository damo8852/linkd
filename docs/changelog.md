# Changelog

Rolling log of session outcomes. Newest at the top. Max 20 entries - drop the oldest when a 21st is added. Insert via str_replace, never rewrite the file.

<!-- New entries go here, directly below this line and above the format section. -->

2026-11-09 16:21 MST
damo8852

## SDK 57 patch baseline and BLE library findings

[internal] Moved the 8 Expo packages that were behind to SDK 57's expected patch versions (`expo-doctor` 21/21), keeping `expo-modules-core` hoisted so `jest-expo` still resolves it. Recorded the `react-native-ble-plx` 3.5.1 New Architecture findings in the mobile protocol (interop-layer module, open iOS release crash, Android GATT-timeout disconnect crash fixed in 3.5.1 but only user-confirmed) and added that disconnect to the device safety checklist.

Issues: #96

---

2026-11-08 23:00 MST
damo8852

## Bangle events reach the SOS controller

[feature] Added the app-wide bangle session: a connect is a link up, an unexpected drop is a link loss followed by automatic reconnects, each `SOS_TRIGGER` is acked and starts one bangle SOS per sequence number, and battery-critical reaches the controller. A paired bangle reconnects from launch, signed in or not, and the Bangle screen now says a 3 s hold starts an SOS; built test-first against a fake transport and mutation-checked.

Issues: #91

---

2026-11-08 18:34 MST
damo8852

## BLE protocol v2: SOS_TRIGGER with ack

[feature] Moved the bangle protocol to version 2: the firmware now measures the 3 s hold itself and sends `SOS_TRIGGER` with a sequence number, resent every second until the app writes an `ACK` on a new characteristic and dropped after 5 minutes, and `BATTERY_CRITICAL` is defined for when the battery can be read. Built test-first in the package and the firmware, mutation-checked, and flashed to the ESP32-C6; the app's handling of the new messages is the next issue.

Issues: #90, #91, #92

---

2026-11-08 18:02 MST
damo8852

## Locked-phone Bluetooth off in the state machine

[feature] The SOS state machine's `bluetoothOff` event now carries the lock state: locked or unknown starts a link loss (grace, server arm, countdown) and keeps a running grace going, while unlocked stays the benign warning. Built test-first, shown failing against the old machine, and mutation-checked; reading the lock state and feeding Bluetooth changes into the controller are filed separately.

Issues: #86, #88

---

2026-11-08 17:50 MST
damo8852

## Bluetooth off on a locked phone is a link loss

[internal] Decided that switching phone Bluetooth off on a locked phone, or when the lock state cannot be read, is a link loss with the usual grace and unlock-to-cancel countdown, while on an unlocked phone it stays a warning; airplane mode follows the same rule. Recorded it in the alert flow, locked decisions, and glossary with the iOS behavior still to verify on a device, and filed the implementation.

Issues: #15, #86

---

2026-11-08 16:06 MST
damo8852

## Background running (battery optimization) on Android

[feature] Added an Android-only "Background running" step to onboarding and Settings that asks for the battery optimization exemption with Android's one-tap prompt (falling back to the system list) and reads the real state back with `expo-battery`. Added `expo-battery`, `expo-intent-launcher`, and the `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` permission, which Google Play allows for safety apps.

Issues: #51

---

2026-11-08 15:45 MST
damo8852

## Countdowns survive the app being killed

[feature] A running countdown is now saved with its id and send time and restored at app start: still counting, it resumes with the time left and is re-armed on the same id; past its send time, it comes back as the active alert from that time and is resent on the same id in case its arm never reached the server. Built test-first and mutation-checked.

Issues: #82

---

2026-11-08 15:38 MST
damo8852

## Alerts and pending ends survive the app being killed

[feature] The SOS controller now saves the active alert, unconfirmed ends, and unanswered disarms to encrypted storage on every change and restores them at app start, resuming with the same ids and reasons and ending as `timeout` any alert whose 60 min passed while the app was dead. Built test-first and mutation-checked; a countdown running at the moment of the kill is filed as a follow-up.

Issues: #70, #82
2026-10-28 10:00 MDT
damo8852

## Battery bench test

[feature] Added an instrument-free battery bench test for the bangle: `firmware/bench.py` temporarily replaces the product firmware and logs boots, run starts, and minute heartbeats to the board, in a stress mode (radio bursts every 20 ms) and an idle mode (the real 500 ms advertising, connected, until the cell dies). Because MicroPython reports a brown-out as a power-on reset, the host-tested `bench_log.py` flags any reset during a run as unexpected. The firmware protocol has the run steps; the measurements and the battery decision itself are still open.

Issues: #59
2026-10-26 17:29 MDT
damo8852

## Cancel and "I'm safe" signed off as separate actions

[internal] Signed off that cancel and "I'm safe" stay separate: a cancel unlock that finishes after the window does nothing, so a late or coerced cancel can never end an SOS that just went out, and only "I'm safe" ends a sent alert. Recorded in locked_decisions.md; the state machine already behaves this way, so no code changed.

Issues: #28
## App connects to the bangle and shows button presses

[feature] Added the app side of the bangle link: `connectBangle` scans for the LINKD service, accepts only a bangle on this app's protocol version, and passes well-formed button frames to a new Bangle debug screen, dropping malformed, unknown, early, and post-disconnect frames; nothing reaches the SOS state machine. `react-native-ble-plx` 3.5.1 is behind a single transport file and its config plugin now declares the Bluetooth permissions; built test-first against a fake transport, with the whole link (including the library on the New Architecture) still to be verified on a phone.

Issues: #60

---

2026-10-26 17:23 MDT
damo8852

## Dispatch off gated on a device unlock

[feature] Turning emergency dispatch off in Settings now asks for a device unlock first: a failed or thrown unlock saves nothing and says dispatch is still on, a phone with no screen lock goes through with a tap, and turning it on never asks. Built test-first on the existing dispatch switch; onboarding is unchanged since it saves only at Finish.

Issues: #75

---

2026-10-26 17:20 MDT
damo8852

## Dispatch off needs a device unlock

[internal] Decided that turning emergency dispatch off in Settings needs a device unlock, like cancel and "I'm safe": a failed unlock leaves it on, a phone with no screen lock uses a plain tap, and turning it on stays a plain tap. Recorded in locked_decisions.md and sos_alert_flow.md, and filed the implementation.

Issues: #54, #75

---

2026-10-26 17:12 MDT
damo8852

## Verify the user's own phone number by SMS

[feature] Added phone verification with our own 6-digit code over the existing Twilio sender (about $0.012-0.013 per US text, against $0.055 for Twilio Verify): `verify-phone` texts a code that `start_phone_code` makes, rate-limits, and stores only as a hash, and the app confirms it with `confirm_phone_code`, which verifies only the number the code was sent to. Settings shows the number as Verified or Not verified with a way to verify it, home shows a banner until it is, and an unverified number never blocks an SOS.

Issues: #18

---

2026-10-26 17:05 MDT
damo8852

## Location in the SOS and per-contact status

[feature] Every SOS now carries the phone's last known location, capped at one second so no permission, no fix, or a slow lookup sends `location: null` instead of failing or delaying the send, and the SMS fallback uses the same lookup. The active alert screen lists each contact as Sending, Texted, Delivered, or Failed from the owner's `alert_recipients` rows, hidden when they cannot be read; built test-first.

Issues: #49

---

2026-10-26 16:53 MDT
damo8852

## Offline SOS fallback via the SMS composer

[feature] The first failed send of an alert now opens the native SMS composer once, prefilled with the cached active contacts and a first-person SOS with the last known location, while server retries continue on the same id; the alert screen offers "Text my contacts" to reopen it and says when the phone cannot text. Built test-first with `expo-sms`, and the signed-out spec now opens the composer only when the token send fails.

Issues: #34

---

2026-10-26 16:44 MDT
damo8852

## SOS countdowns armed on the server

[feature] Every cancel window and grace period is now also armed on the server (`armed_alerts`, the `countdown` and `fire-armed-alerts` Edge Functions, and a per-second `pg_cron` job), so an SOS still goes out on time when the OS suspends or kills the app; the phone sends on the same id, a disarm that loses the race warns and ends the alert as safe, and a discreet notification opens the countdown. Built test-first across pgTAP, Deno, and Jest, verified end to end locally, and the phone-dying lock was amended to accept a send when the phone dies before disarming.

Issues: #48

---

2026-10-26 16:08 MDT
damo8852

## "I'm safe" ends the alert on the server

[feature] "I'm safe" and the 60 min auto-end now call `end-alert` with the alert id, reason `user` or `timeout`, and the alert token, built test-first in the state machine, controller, and request. A failed end, 404 included, is retried with the same id until the server confirms, even after a new alert starts, with a home banner until then; surviving an app kill was filed as a follow-up.

Issues: #56, #70

---

2026-10-21 11:15 MDT
damo8852

## Bangle button over BLE (firmware + protocol package)

[feature] Added `packages/ble-protocol`: the LINKD GATT service, a readable protocol version, and a display-only `BUTTON_EVENT` frame with a TS codec built test-first (malformed, short, unknown-version, and unknown-type frames all decode to nothing), plus a generated MicroPython module with a staleness test and the encoder's frames as test vectors. Added `firmware/` for the ESP32-C6: a host-tested debouncer and frame builder and a thin `main.py` that advertises the service and notifies every debounced press and release; it boots and advertises on the board. Locked the firmware test approach (CPython `unittest` on the host, `mpremote` on the board), and CI now runs the firmware tests and the `join-waitlist` function. The app side of the link and a phone-side check of the notifications are not done yet.

Issues: #60

---

2026-10-21 09:30 MDT
damo8852

## MicroPython firmware toolchain

[docs] Locked MicroPython (v1.29.0 on the prototype board) as the ESP32-C6 firmware toolchain and unlocked the Hard BLE source-of-truth decision so the firmware consumes a generated MicroPython module instead of a C header, since MicroPython cannot use one. The firmware and BLE protocols, the firmware and ble-link agents, the ble-change skill, the repo layout, the README, and CLAUDE.md now say so; firmware testing is locked as host-side CPython `unittest` for pure modules plus `mpremote` board checks, and the coin cell question points at its decision issue.

Issues: #58

---

2026-10-19 22:45 MDT
damo8852

## ESP32-C6 as the bangle SoC

[docs] Locked the Espressif ESP32-C6 as the bangle SoC and replaced the Nordic nRF52/nRF54 references in the README, firmware protocol, and firmware agent; the toolchain question now assumes ESP-IDF. The coin cell stays, and whether it can supply the ESP32-C6's peak BLE current was filed as an open question, since a brown-out could cause a false or missed SOS.

Issues: #61

---

## Changelog format

```
YYYY-MM-DD HH:MM TZ
<Person>

## <Title>

[<category>] <Two sentences describing what happened.>

Issues: #<n>, PR #<n>
```

- Category: `[feature]` · `[enhancement]` · `[bug]` · `[internal]` (tooling / docs / process).
- Two sentences; detail lives in the PR. No em dashes. No session numbers.
