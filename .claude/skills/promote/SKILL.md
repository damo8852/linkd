---
name: promote
description: Promote a Sandbox session to Tracked - find or create the GitHub issue, create the correctly named branch off main, and continue under Tracked rules.
---

Use when the developer says "promote to Tracked".

1. Ask which issue this is against. None yet -> run `/new-issue`, then return.
2. Propose `feature/<issue#>-<slug>` (or `bugfix/...`) and confirm with the developer.
3. Create it. If there are uncommitted Sandbox changes, they come along to the new branch:
   ```bash
   git checkout -b feature/<issue#>-<slug>
   git branch --show-current
   ```
4. State: **"Session promoted to Tracked. Branch `<name>` is active."** From now on: commits on this branch, changelog + PR at `/session-end`.
