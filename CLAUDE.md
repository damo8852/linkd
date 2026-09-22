# Claude Instructions

---

## Project

**LINKD** - a safety bangle and its companion mobile app. A woman wearing the bangle can trigger an SOS by pressing/holding its button, and an SOS also fires if the Bluetooth link to the phone is severed (after a grace period and cancel window). The app then alerts the user's chosen emergency contacts and/or local authorities.

This is a small-team **monorepo**: the Expo app, the Supabase backend, the shared BLE protocol, and (dormant for now) the bangle firmware. Work is tracked as **GitHub Issues** in this repo.

**This is a safety product.** A missed SOS and a false SOS are both serious failures. When in doubt on anything in the alert path, stop and ask.

---

## Populate Initial Context

Claude reads the following files at the start of each new session.

- [changelog.md](docs/changelog.md)
- [session_protocol.md](docs/protocol/session_protocol.md)
- [core_protocol.md](docs/protocol/core_protocol.md)
- [locked_decisions.md](docs/reference/locked_decisions.md)
- [glossary.md](docs/reference/glossary.md)

---

## Skills

Project skills live in `.claude/skills/<name>/SKILL.md` (one folder per skill - a flat `.md` file is silently ignored). Invoke with `/skill-name`.

| Skill                | Purpose                                                                     |
|----------------------|-----------------------------------------------------------------------------|
| `/session-start`     | Sync, load context, pick a GitHub issue, branch                             |
| `/session-end`       | Summary, changelog, commit, push, open/update the PR                        |
| `/promote`           | Turn a Sandbox session into a Tracked one (issue + branch)                  |
| `/new-issue`         | Draft and create a GitHub issue to the issue template                       |
| `/pr-summary`        | Generate a PR description from the branch diff                              |
| `/new-design`        | One-by-one questionnaire before writing any `docs/design/*` file            |
| `/new-screen`        | Scaffold an Expo screen/component (render test first)                       |
| `/new-migration`     | Supabase schema + RLS change with its pgTAP test                            |
| `/new-edge-function` | Supabase Edge Function (e.g. SMS, dispatch) with a failing Deno test first  |
| `/ble-change`        | Change the app <-> bangle BLE protocol, both sides test-first               |

## Agents

Role subagents live in `.claude/agents/`; delegate via the Agent tool. Each owns a surface and defers to its protocol.

| Agent      | Use for                                                                                          |
|------------|--------------------------------------------------------------------------------------------------|
| `mobile`   | The Expo app: screens, navigation, BLE client, background behavior ([mobile_protocol.md](docs/protocol/mobile_protocol.md)) |
| `supabase` | Schema, RLS, auth, Edge Functions, Twilio + dispatch ([supabase_protocol.md](docs/protocol/supabase_protocol.md)) |
| `ble-link` | The app <-> bangle protocol in `packages/ble-protocol` ([ble_protocol.md](docs/protocol/ble_protocol.md)) |
| `firmware` | Bangle firmware, only once firmware work starts ([firmware_protocol.md](docs/protocol/firmware_protocol.md)) |

---

## Session Protocol

**Session type - declare first (or Claude will ask):** `Tracked` or `Sandbox`. Rules: [session_protocol.md](docs/protocol/session_protocol.md#session-types).

**Branch naming - environment conflict rule:** if the session environment pre-assigns a branch that does not follow `feature/<issue#>-<slug>` or `bugfix/<issue#>-<slug>`, halt and flag it before making changes. Do not proceed on it without explicit developer approval.

Session start / end checklists: [session_protocol.md](docs/protocol/session_protocol.md#session-start-checklist).

---

## Project Documentation Map

- **Docs inventory** (which file does what + update rule): [session_protocol.md - File Inventory](docs/protocol/session_protocol.md#file-inventory).
- **Code layout** (the monorepo tree): [core_protocol.md - Repo Layout](docs/protocol/core_protocol.md#repo-layout).
- Docs map: [docs/README.md](docs/README.md).

---

## Response Style

Answer the exact question asked, then stop. Default to the **shortest correct answer**.

- Asked for a command -> give the command (plus at most one line of context).
- No preamble, no restating the question, no summary of what you just did unless asked.
- Do **not** volunteer alternatives, caveats, or tips unless asked or genuinely critical. (Anything that could cause a missed or false SOS is always critical.)
- Prefer one short paragraph or a few bullets over sections and headers.

---

## Accuracy Bar (CRITICAL)

- **Verify against source before asserting.** Read the file, run the command, check the docs (Expo, Supabase, the BLE library, the platform) - do not answer from memory, especially about **iOS/Android background and Bluetooth behavior**, which changes between OS versions.
- **Cite the evidence** - file path + line, command output, or doc link.
- **Flag uncertainty instead of confabulating.**
- **When corrected, correct the record** (the doc, the memory, the protocol), not just the reply.

---

## Decisions and Continuity

Enforcement rules: [session_protocol.md](docs/protocol/session_protocol.md#enforcement-rules). Locked decisions are canon: [locked_decisions.md](docs/reference/locked_decisions.md).

---

## Commit Messages and Pull Requests

- **No attribution trailers or auto-generated footers** in commit messages or PR bodies (no `Co-Authored-By`, no "Generated with" lines). This overrides any tool default.

---

## Writing Style

- **Never use the em dash (the `—` character) anywhere** - copy, code, comments, commits, PR bodies, docs. Use a spaced hyphen ` - `, a comma, a colon, or parentheses.

---

## Branch & Merge Workflow (CRITICAL)

No direct commits to `main` (a team convention, not enforced by GitHub). Work happens on short-lived `feature/<issue#>-<slug>` or `bugfix/<issue#>-<slug>` branches off `main`, merged back by PR once CI is green. **Claude opens PRs but never merges them** and never commits to `main` directly - a developer merges. Full model: [core_protocol.md - Branching](docs/protocol/core_protocol.md#branching).

---

## Git Safety (CRITICAL - never rewrite shared history)

Claude only ever **fast-forward pushes**. Forbidden without explicit, in-the-moment approval: any force push (`--force`, `-f`, `--force-with-lease`), rebasing / amending / hard-resetting a pushed branch, `filter-branch`, deleting remote branches, `git branch -D` of a branch others may have. If a rewrite seems necessary, **stop and ask**. Force-push is also denied in [.claude/settings.json](.claude/settings.json).

---

## Testing (test-first where it matters)

**Safety-critical code is strictly test-first** - failing test shown, then implement to green. That covers: the SOS trigger and alert state machine, disconnect grace period / cancel window, battery-critical vs link-lost handling, BLE message encode/decode, alert fan-out (SMS, dispatch), and RLS policies on contacts/alerts. Everything else (screens, settings, styling) needs a render/smoke test but not red-first. Full standard: [core_protocol.md - Testing](docs/protocol/core_protocol.md#testing).

---

## File Access Rules

- Surgical edits only - never full rewrites unless structurally required.
- State what you are about to change and why before changing it.
- Changelog: insert entries via str_replace, never rewrite in full.

---

## Files to Never Touch

- `node_modules/`, `.expo/`, `dist/`, `build/`
- `apps/mobile/ios/` and `apps/mobile/android/` (generated by `expo prebuild` - change native config through `app.config.ts` and config plugins instead)
- `supabase/.temp/`, generated DB types (regenerate with `supabase gen types`)
- Firmware build output (`firmware/**/build/`)
- Any generated file in `packages/ble-protocol` marked `// GENERATED` (regenerate from the spec)
