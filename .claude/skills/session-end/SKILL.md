---
name: session-end
description: End a session - summary, changelog entry (Tracked), commit, push, open or update the PR, and list what is up next from GitHub Issues.
---

Run in order.

## Step 1 - Summary

What was decided, built, opened, and closed. Then every changed file with a one-line why.

## Step 2 - Docs check

Any decision affecting `locked_decisions.md`, a protocol, `glossary.md`, or `docs/design/*` must already be written down. If not, do it now; the session cannot close without it.

## Step 3 - Unresolved items

Each becomes a GitHub issue via `/new-issue`. No loose prose left in docs.

## Step 4 - Changelog (Tracked only)

Insert at the top of `docs/changelog.md` (below the header comment) via str_replace, in the format at the bottom of that file. Timestamp: `date "+%Y-%m-%d %H:%M %Z"`. Keep max 20 entries; drop the oldest.

## Step 5 - Commit and push (Tracked only)

`<type>(<scope>): <description>`, no trailer or footer. Then `git push -u origin HEAD` (fast-forward only, never force).

## Step 6 - Pull request (Tracked only)

Confirm with the developer that the session's work is complete. Then:

- `gh pr view` - if a PR exists, update its body to the template in `docs/reference/authoring.md`.
- Otherwise `gh pr create --base main` with that template, and `Closes #<n>`. Add `needs-qa` if the change is user-facing, BLE, background, or alert-path.

**Never merge.** A developer merges after CI + QA.

## Step 7 - Up Next

```bash
gh issue list --label ready --state open --limit 5
```

## Step 8 - Confirm

Docs updated, changelog inserted, committed, pushed, PR opened/updated, Up Next listed.
