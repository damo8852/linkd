# Changelog

Rolling log of session outcomes. Newest at the top. Max 20 entries - drop the oldest when a 21st is added. Insert via str_replace, never rewrite the file.

<!-- New entries go here, directly below this line and above the format section. -->

2026-10-26 17:12 MDT
damo8852

## Verify the user's own phone number by SMS

[feature] Added phone verification with our own 6-digit code over the existing Twilio sender (about $0.012-0.013 per US text, against $0.055 for Twilio Verify): `verify-phone` texts a code that `start_phone_code` makes, rate-limits, and stores only as a hash, and the app confirms it with `confirm_phone_code`, which verifies only the number the code was sent to. Settings shows the number as Verified or Not verified with a way to verify it, home shows a banner until it is, and an unverified number never blocks an SOS.

Issues: #18
2026-10-26 17:20 MDT
damo8852

## Dispatch off needs a device unlock

[internal] Decided that turning emergency dispatch off in Settings needs a device unlock, like cancel and "I'm safe": a failed unlock leaves it on, a phone with no screen lock uses a plain tap, and turning it on stays a plain tap. Recorded in locked_decisions.md and sos_alert_flow.md, and filed the implementation.

Issues: #54, #75

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

2026-10-11 18:26 MDT
damo8852

## Alert token for a signed-out SOS

[feature] Added the per-install alert token: an `alert_devices` table that stores only the token's hash, `send-alert` and `end-alert` accepting the token when there is no valid session, and the app issuing it at sign-in, keeping it through sign-out, and sending it with every SOS. A signed-out phone now shows a banner with the SOS button and "Remove this device" (device unlock required), Settings lists the account's devices, and the token was decided to act for its user rather than one device; built test-first with pgTAP, Deno, and Jest suites and a local end-to-end run.

Issues: #22
2026-10-19 22:45 MDT
damo8852

## ESP32-C6 as the bangle SoC

[docs] Locked the Espressif ESP32-C6 as the bangle SoC and replaced the Nordic nRF52/nRF54 references in the README, firmware protocol, and firmware agent; the toolchain question now assumes ESP-IDF. The coin cell stays, and whether it can supply the ESP32-C6's peak BLE current was filed as an open question, since a brown-out could cause a false or missed SOS.

Issues: #61
2026-10-20 10:30 MDT
damo8852

## Landing page with early-bird waitlist

[feature] Added `apps/web`, a static landing page in the "Pink drink" style that explains LINKD and offers early-bird pricing ($37.99, regular $59.99) through a waitlist form; holding the bangle button in the hero for 3 s plays a demo of the alert going out (nothing is sent). Signups go to a new `waitlist` table that anyone can add an email to but no client can read, update, or delete, with one row per address regardless of case; a repeat signup gets the same success message so the page does not reveal who is on the list. The repo-shape lock now includes `apps/web`. The page is live on Cloudflare Workers at linkd.linkdjewelery.workers.dev against the new hosted Supabase project, which now has every migration; signups go through a `join-waitlist` Edge Function that checks a Cloudflare Turnstile token before inserting with the service role, and clients can no longer insert into the table directly. Confirmation emails are not done yet.

Issues: #63, #65

---

2026-10-11 13:52 MDT
damo8852

## Dispatch setting in Settings

[feature] Added the emergency dispatch switch to Settings, built test-first: it shows only what the server has saved, moves only once a change is confirmed, names the setting still in force when a save fails, and shows no switch at all when the setting cannot be read. Onboarding now shares the same switch and says the choice can be changed in Settings; whether turning dispatch off should need a device unlock was filed as a decision.

Issues: #52, #54

---

2026-10-07 12:10 MDT
damo8852

## End an alert with "I'm safe"

[feature] Added the `end-alert` Edge Function and its migration: an alert ends once, and every contact whose SOS text was sent gets one end text, "confirmed safe" for a user end or "ended automatically, NOT confirmed safe" for the 60 min auto-end. An ended alert now sends no further SOS texts, and the changelog heading lost a URL pasted into it during an earlier merge.

Issues: #36
2026-10-11 13:40 MDT
damo8852

## Onboarding permission screens

[feature] Added first-run onboarding that collects the user's name, number (entered twice), and dispatch choice, with one explained screen per permission (Bluetooth, notifications, location, background location) saying what it enables and what breaks without it, and a Settings screen that lists each permission's state in words with a way to turn it on. The profile is saved only on Finish and a slow or failed profile check never keeps a user from the home screen; the Android battery-optimization step and changing dispatch in Settings were filed as follow-ups.

Issues: #35, #51, #52

---

2026-10-07 12:08 MDT
damo8852

## In-app SOS: hold button, countdown, active alert

[feature] Added the hold-to-trigger SOS button on home, a full-screen cancel countdown and active alert that cover any route, and a controller that runs the state machine, calls `send-alert` for real with retries on one alert id, and gates cancel and "I'm safe" on a device unlock via `expo-local-authentication`. Built test-first and mutation-checked; decided that a phone with no screen lock cancels with a plain tap plus a warning, and filed the background-countdown and location follow-ups.

Issues: #33, #48, #49

---

2026-10-05 17:01 MDT
damo8852

## Emergency contacts screen with offline cache

[feature] Added the contacts list and add-contact screens with numbers normalized to E.164, the limit of 5 and opted-out contacts shown in words, and an encrypted on-device cache, built test-first, that survives sign-out, never empties on a failed fetch, and is replaced when a different account signs in. Also fixed the stored session and cache being unreadable on a locked iPhone by storing the Keychain key as readable after first unlock.

Issues: #32
## Twilio delivery status for SOS texts

[feature] Added the `sms-status` Edge Function, which verifies Twilio's request signature and records whether each SOS text was delivered, undelivered, or failed, in new `delivery_status` and `delivery_error` columns the owner can read. `send-alert` now passes the callback URL to Twilio in live mode; built test-first with pgTAP and Deno suites and a local end-to-end run with signed, forged, and unsigned requests.

Issues: #38

---

2026-10-05 16:32 MDT
damo8852

## Supabase client and auth screens

[feature] Added the single Supabase client with the session stored encrypted on the phone, plus sign-in, sign-up, and password-reset screens with signed-in vs signed-out routing and a sign-out button on the placeholder home. Password reset is by a 6-digit emailed code instead of a link, the minimum password length is now 8, and the flows were checked against the local Supabase stack.

Issues: #30

---

2026-10-05 16:40 MDT
damo8852

## Profiles: dispatch setting and verified flag

[feature] Added `dispatch_enabled` (default on) and a server-only `phone_verified` to `profiles`, with a trigger that clears the verified flag whenever the number changes. Built test-first with 23 pgTAP tests covering owner, other user, anon, and server, and decided the profile row is created by the app at onboarding rather than by a sign-up trigger.

Issues: #31

---

2026-10-04 14:19 MDT
damo8852

## Living wireframes, first pass

[internal] Added `docs/design/wireframes.html`, a self-contained page of themed mid-fi phone frames covering the SOS core, emergency contacts, and sign-in and onboarding screens, drawn from the style guide tokens. It is a living doc updated in the same PR as any screen layout change, and is listed in the docs inventory.

Issues: #40

---

2026-10-01 21:35 MDT
damo8852

## Theme tokens and style guide

[feature] Filled the style guide with the dark-only "Pink drink" palette (hot pink on midnight, butter and tangerine accents), every pair contrast-checked to WCAG AA, with a red-plus-label SOS so it never relies on hue next to the pink accent. Added the theme module and `useTheme` hook, moved the home route and header onto it, and bundled the deck's Bagel Fat One at build time for headings while body and SOS text stay on the system font.

Issues: #11
2026-10-01 22:09 MDT
damo8852

## send-alert: record alerts and text contacts

[feature] Added `profiles`, `alerts`, and `alert_recipients` with owner-only RLS and server-only SQL functions that record an alert once per client id, snapshot active contacts, and claim recipients atomically so no contact is texted twice. Added the `send-alert` Edge Function with Twilio behind a fake / sandbox / live provider, Deno pinned as an npm dev dependency, test-first pgTAP and Deno suites checked against deliberate safety mutations, and a local end-to-end run.

Issues: #29, #36, #37, #38

---

2026-10-01 21:40 MDT
damo8852

## SOS alert state machine

[feature] Added the platform-free SOS state machine in `apps/mobile/src/features/sos/`, a pure reducer with injected time that catches up on overdue deadlines so a late timer can never skip or postpone a send. Built test-first with 35 Jest tests checked against deliberate safety mutations, and wrote the newly decided transitions (holds during countdowns and grace, Bluetooth off during grace, cancel vs "I'm safe") into the alert flow.

Issues: #25

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
