# Changelog

Rolling log of session outcomes. Newest at the top. Max 20 entries - drop the oldest when a 21st is added. Insert via str_replace, never rewrite the file.

<!-- New entries go here, directly below this line and above the format section. -->

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
