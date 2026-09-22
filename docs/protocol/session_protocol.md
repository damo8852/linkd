# Session Protocol

---

## Session Types

**Tracked** - produces commits and a PR.

- A **GitHub issue** must exist before a branch is created. Create one with `/new-issue` if needed.
- Confirm the issue with the developer, then branch off `main`: `feature/<issue#>-<slug>` or `bugfix/<issue#>-<slug>`.
- At session end: changelog entry, commit, push, open/update the PR (`Closes #<n>`). Claude does not merge.
- Design work (a new `docs/design/*` file) is a Tracked session whose output is the doc; it uses `/new-design`.

**Sandbox** - exploration, spikes, questions.

- No issue, no branch, no PR, no commits to `main`. Changelog note only if asked.
- Promote any time: the developer says "promote to Tracked" -> `/promote`.

---

## Session Start Checklist

1. **Sync (guarded)** - on a clean tree not mid-feature: `git checkout main && git pull --ff-only && git fetch --prune`, then delete local branches whose PRs have merged. Skip if resuming a branch or the tree is dirty.
2. **Session type** - the developer declares Tracked or Sandbox (or Claude asks).
3. **Select the work** - list open issues labeled `ready`, highest priority first (`gh issue list --label ready`). The developer picks.
4. **Read relevant docs** - the protocol(s) for the surfaces the issue touches, plus any `docs/design/*` it depends on (always [sos_alert_flow.md](../design/sos_alert_flow.md) for alert-path work, [ble_link_spec.md](../design/ble_link_spec.md) for BLE work).
5. **Confirm** - state which docs were read; after confirmation, create the branch (Tracked).

---

## Session End Checklist

1. **Summary** - what was decided, built, opened, closed.
2. **File list** - each changed file with a one-line why.
3. **Tracked:** changelog entry -> commit -> push -> open/update PR.
4. **Sandbox:** brief summary only.
5. **Unresolved items** become GitHub issues (`/new-issue`) - no loose prose left in docs.
6. **Up Next** - top 3-5 `ready` issues by priority from GitHub.
7. **Docs check** - any decision affecting locked decisions, protocols, glossary, or design docs is written down before close.

---

## Working with Agents + Skills

- One session per task. Claude delegates to a role agent (`mobile`, `supabase`, `ble-link`, `firmware`) with a **grounded** brief: real file paths, the test to write, the doc to honor.
- `ble-link` runs **before** `mobile` or `firmware` whenever the BLE messages change. `supabase` runs before `mobile` when a screen needs new data.
- The orchestrating session **re-runs tests itself** before claiming done. Never merge on an agent's word.
- A hook or generic nudge never outranks an explicit task instruction.

---

## File Inventory

| File                                   | Purpose                                                          | Update rule                                   |
|----------------------------------------|------------------------------------------------------------------|-----------------------------------------------|
| CLAUDE.md                              | Auto-loaded behavior rules.                                      | Surgical edits only.                          |
| README.md                              | Product overview, repo map, getting started.                     | When scope, stack, or setup changes.          |
| .claude/agents/                        | Role subagents.                                                  | When a surface or its rules change.           |
| .claude/skills/<name>/SKILL.md         | `/skill-name` checklists.                                        | When a workflow changes.                      |
| .github/                               | Issue + PR templates, CI workflows.                              | When the issue/PR format or CI gates change.  |
| docs/README.md                         | Map of the docs tree.                                            | When a doc is added, moved, or removed.       |
| docs/changelog.md                      | Rolling session log, 20-entry max.                               | Insert at top via str_replace.                |
| docs/protocol/session_protocol.md      | This file.                                                       | When the workflow changes.                    |
| docs/protocol/core_protocol.md         | Testing, branching, layout, naming, quality, commits, PR list.   | When a cross-cutting convention changes.      |
| docs/protocol/mobile_protocol.md       | Expo app rules.                                                  | When an app convention changes.               |
| docs/protocol/supabase_protocol.md     | DB, RLS, auth, Edge Functions, SMS, dispatch.                    | When a backend convention changes.            |
| docs/protocol/ble_protocol.md          | Rules for changing the app <-> bangle protocol.                  | When the BLE change process changes.          |
| docs/protocol/firmware_protocol.md     | Firmware rules (dormant).                                        | When firmware work starts or changes.         |
| docs/protocol/qa_protocol.md           | On-device QA, safety scenarios, device matrix.                   | When the QA workflow or devices change.       |
| docs/reference/locked_decisions.md     | Settled decisions + open questions.                              | Every Tracked session that decides something. |
| docs/reference/glossary.md             | Shared vocabulary.                                               | When a term is added or renamed.              |
| docs/reference/integrations.md         | External services + env vars.                                    | When a service or env var is added.           |
| docs/reference/authoring.md            | Issue + PR templates and labels.                                 | When the format changes.                      |
| docs/design/sos_alert_flow.md          | The alert state machine: triggers, timers, recipients.           | When alert behavior changes.                  |
| docs/design/ble_link_spec.md           | BLE services, messages, timing, battery reporting.               | Via `/ble-change` only.                       |
| docs/design/style_guide.md             | Visual language and tokens.                                      | When a token or UX rule changes.              |

---

## Enforcement Rules

1. **Locked decisions** - work that contradicts one halts until it is unlocked: the developer states why -> Claude flags downstream impact -> change made, documented, re-locked.
2. **Conflicts and vague requirements** are flagged before proceeding. Agreement is not a valid response to a conflict - push back.
3. **No speculative choices** - if the docs do not name the library or approach, ask before adding it. New dependencies need a reason.
4. **Docs stay current** - a decision that affects a guiding doc is written into it in the same session. No issue numbers or session numbers in docs (changelog excepted).
5. **Safety-critical test-first** - see [core_protocol.md - Testing](core_protocol.md#testing). No exceptions without a stated reason.
6. **Alert-path changes need sign-off** - any change to [sos_alert_flow.md](../design/sos_alert_flow.md) behavior (timers, triggers, recipients, fallbacks) is confirmed by the developer before implementation and noted in the PR's Risk section.
7. **No dead code on replacement** - grep, remove, stay green.
8. **PR only after confirmation** - confirm the session's work is complete before opening the PR. Claude never merges and never commits to `main`.
9. **Tables** - preserve column alignment when editing markdown tables.
