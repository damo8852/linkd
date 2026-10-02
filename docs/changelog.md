# Changelog

Rolling log of session outcomes. Newest at the top. Max 20 entries - drop the oldest when a 21st is added. Insert via str_replace, never rewrite the file.

<!-- New entries go here, directly below this line and above the format section. -->

2026-10-01 21:35 MDT
damo8852

## Theme tokens and style guide

[feature] Filled the style guide with the dark-only "Pink drink" palette (hot pink on midnight, butter and tangerine accents), every pair contrast-checked to WCAG AA, with a red-plus-label SOS so it never relies on hue next to the pink accent. Added the theme module and `useTheme` hook, moved the home route and header onto it, and bundled the deck's Bagel Fat One at build time for headings while body and SOS text stay on the system font.

Issues: #11
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

2026-09-28 17:43 MDT
damo8852

## Monorepo scaffold

[internal] Scaffolded the npm workspaces monorepo: a trimmed expo-router app in `apps/mobile` with a placeholder home route and a passing render test, `supabase/` config, a shared strict base tsconfig and ESLint config, and a GitHub Actions workflow running typecheck, lint, and Jest on PRs. Also pinned `react-dom` to stop npm installing a second, newer `react` that broke the test runner, and filed the Semgrep CI check as follow-up work.

Issues: #2, #3, PR #4

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
