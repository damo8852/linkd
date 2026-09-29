# Changelog

Rolling log of session outcomes. Newest at the top. Max 20 entries - drop the oldest when a 21st is added. Insert via str_replace, never rewrite the file.

<!-- New entries go here, directly below this line and above the format section. -->

2026-09-28 19:58 MDT
damo8852

## OS-agnostic setup

[internal] Pinned the toolchain (`.nvmrc`, `engines`, `engine-strict`), normalized line endings and filename casing, and extended CI to run typecheck, lint, and tests on ubuntu, windows, and macos. Rewrote the README getting-started into selectable per-OS sections for macOS, Windows, and Linux, each a complete path from clone to the app on a phone.

Issues: #1, PR #8

2026-09-28 17:52 MDT
damo8852

## Semgrep security scan and branch cleanup

[internal] Added a Semgrep job to CI on the stock `p/default` ruleset, pinned to a container image and failing on ERROR findings only, after confirming the narrower rulesets caught nothing against deliberately vulnerable code. Also made "delete the branch once its PR is merged" a written rule across the working agreement, the protocols, and both session skills.

Issues: #3, #5, PR #6, PR #7

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
