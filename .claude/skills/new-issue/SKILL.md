---
name: new-issue
description: Draft a GitHub issue to the LINKD issue template (story or bug, acceptance criteria, safety impact) with labels and priority, then create it with gh.
---

Use to capture any new unit of work, open question, or follow-up. Template: [authoring.md](../../../docs/reference/authoring.md).

## Step 1 - Draft

From the session context, draft:
- **Title:** `Feature: <outcome>` or `Bug: <symptom>`.
- **Body:** story (or observed/expected/repro), context with links, acceptance criteria as checkboxes, out of scope, **safety impact**.
- **Labels:** one surface label (`mobile`, `supabase`, `ble`, `firmware`, `docs`), a priority (`P0`/`P1`/`P2`), `safety-critical` if it touches the alert path, `decision` if it is an open question, `ready` if it can be picked up now.

Flag anything too big to demo in one sitting and propose a split.

## Step 2 - Confirm

Show the draft. Do not create it until the developer confirms (and sets priority if not obvious).

## Step 3 - Create

```bash
gh issue create --title "<title>" --body-file <tmpfile> --label "<labels>"
```

Report the issue number and URL.
