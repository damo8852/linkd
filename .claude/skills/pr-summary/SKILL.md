---
name: pr-summary
description: Generate or refresh a PR description from the current branch diff, using the LINKD PR template.
---

Template: [authoring.md](../../../docs/reference/authoring.md#pull-requests).

1. See what ships: `git log main..HEAD --oneline` and `git diff main...HEAD --stat`.
2. Write the body: Summary (the why), `Closes #<n>`, Changes, Testing (failing-first noted for safety-critical code; QA checklist if user-facing), Risk (alert path, BLE version, migration/RLS, store build vs OTA).
3. Title: `<type>(<scope>): <description>`.
4. No trailer or footer. Output it, or apply with `gh pr edit --body-file`.
