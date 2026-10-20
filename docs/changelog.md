# Changelog

Rolling log of session outcomes. Newest at the top. Max 20 entries - drop the oldest when a 21st is added. Insert via str_replace, never rewrite the file.

<!-- New entries go here, directly below this line and above the format section. -->

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

[feature] Added `apps/web`, a static landing page in the "Pink drink" style that explains LINKD and offers early-bird pricing ($37.99, regular $59.99) through a waitlist form. Signups go to a new `waitlist` table that anyone can add an email to but no client can read, update, or delete, with one row per address regardless of case; a repeat signup gets the same success message so the page does not reveal who is on the list. The repo-shape lock now includes `apps/web`; hosting, rate limiting, and confirmation emails are not done yet.

Issues: #63

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

2026-10-01 21:28 MDT
damo8852

## Emergency contacts table

[feature] Added the first migration: `emergency_contacts` with RLS so users see and change only their own contacts, an E.164 check, a database-enforced limit of 5 active contacts, and an opted-out status only the server can set. Added 24 pgTAP tests written test-first, a synthetic seed, committed DB types, and a CI job that runs the database tests and fails on stale types.

Issues: #12

---

2026-10-01 15:18 MDT
damo8852

## Signed-out SOS decision

[internal] Decided that a signed-out phone still sends an SOS through the server with a per-install alert token, dispatch follows the saved setting, and sign-out keeps the cache and token so only removing the device disarms it. Recorded it in the alert flow, Supabase protocol, locked decisions, and glossary, reordered the changelog after the last merges, and filed the implementation work.

Issues: #19, #22

---

2026-10-01 15:15 MDT
damo8852

## Link-loss reconnect behavior

[internal] Decided that a bangle reconnect never cancels an alert by itself: the link-loss cancel window keeps counting down, and a reconnect during grace only counts once the link stays up 5 s. A button hold during the link-loss cancel window now sends immediately.

Issues: #13, PR #21

---

2026-10-01 14:56 MDT
damo8852

## Auth method decision

[internal] Chose email + password with Supabase Auth to stay on free tiers, with Resend's free tier as the auth SMTP, sessions that never time out, and password-reset email for recovery. The user's own phone number is required but unverified for now, and follow-up issues cover verifying it and sending an SOS while signed out.

Issues: #10, #18, #19, PR #20

---

2026-10-01 14:55 MDT
damo8852

## SOS alert flow design

[internal] Resolved the SOS alert flow open questions: 3 s hold trigger, 5 s button cancel window, 20 s link-loss grace plus 30 s cancel window, device unlock to cancel, offline retry plus native SMS fallback, and warn-only benign link loss. Recorded the decisions in the design doc, locked decisions, and glossary, and opened follow-up decision issues for what remains open.

Issues: #9, #12, #13, #14, #15, #16, PR #17

---

2026-09-28 19:58 MDT
damo8852

## OS-agnostic setup

[internal] Pinned the toolchain (`.nvmrc`, `engines`, `engine-strict`), normalized line endings and filename casing, and extended CI to run typecheck, lint, and tests on ubuntu, windows, and macos. Rewrote the README getting-started into selectable per-OS sections for macOS, Windows, and Linux, each a complete path from clone to the app on a phone.

Issues: #1, PR #8

---

2026-09-28 17:52 MDT
damo8852

## Semgrep security scan and branch cleanup

[internal] Added a Semgrep job to CI on the stock `p/default` ruleset, pinned to a container image and failing on ERROR findings only, after confirming the narrower rulesets caught nothing against deliberately vulnerable code. Also made "delete the branch once its PR is merged" a written rule across the working agreement, the protocols, and both session skills.

Issues: #3, #5, PR #6, PR #7

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
