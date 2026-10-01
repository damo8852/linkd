# Changelog

Rolling log of session outcomes. Newest at the top. Max 20 entries - drop the oldest when a 21st is added. Insert via str_replace, never rewrite the file.

<!-- New entries go here, directly below this line and above the format section. -->

2026-10-01 14:56 MDT
damo8852

## Auth method decision

[internal] Chose email + password with Supabase Auth to stay on free tiers, with Resend's free tier as the auth SMTP, sessions that never time out, and password-reset email for recovery. The user's own phone number is required but unverified for now, and follow-up issues cover verifying it and sending an SOS while signed out.

Issues: #10, #18, #19

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
