---
name: session-start
description: Start a session - sync main, read protocol context, declare Tracked or Sandbox, pick a GitHub issue, read the relevant docs, and create the branch.
---

Run in order.

## Step 0 - Sync (guarded)

Skip if resuming a feature branch or `git status --short` is non-empty. Otherwise:

```bash
git checkout main
git pull --ff-only
git fetch --prune
```

Delete local branches whose PRs have merged (squash merges: confirm with `gh pr list --state merged --head <branch>` before `git branch -D`).

## Step 1 - Read context (in parallel)

`docs/changelog.md`, `docs/protocol/session_protocol.md`, `docs/protocol/core_protocol.md`, `docs/reference/locked_decisions.md`, `docs/reference/glossary.md`.

## Step 2 - Session type

If not declared, ask: **Tracked or Sandbox?**

## Step 3 - Select the work (Tracked)

```bash
gh issue list --label ready --state open --limit 20
```

Present as a numbered list, P0 first. The developer picks. If nothing fits, offer `/new-issue`.

## Step 4 - Read relevant docs

Protocol(s) for the surfaces the issue touches (by its labels). Alert-path work: `docs/design/sos_alert_flow.md`. BLE work: `docs/design/ble_link_spec.md`. UI work: `docs/design/style_guide.md`.

## Step 5 - Confirm and branch

State which docs were read. After confirmation (Tracked):

```bash
git checkout -b feature/<issue#>-<slug>   # or bugfix/<issue#>-<slug>
```

If the issue is labeled `safety-critical`, say so: strict test-first and on-device QA apply.
