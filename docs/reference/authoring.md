# Authoring: Issues & Pull Requests

The GitHub issue template drives `/new-issue`; the PR template drives `/pr-summary` and `/session-end`. The same shapes are in [.github/](../../.github).

---

## Issues

**Title:** `Feature: <outcome>` or `Bug: <symptom>` (drives `feature/` vs `bugfix/`).

**Feature body:**

```
## Story
As a <user / contact / developer>, I want <capability>, so that <benefit>.

## Context
<why; links to design docs>

## Acceptance criteria
- [ ] <observable behavior>
- [ ] <edge / failure case>

## Out of scope
<non-goals>

## Safety impact
<none | touches the alert path: how a missed or false SOS could result>
```

**Bug body:** Observed, Expected, Steps to reproduce, Environment (device, OS, app build, bangle firmware), Safety impact.

Split anything that cannot be demoed in one sitting.

## Labels

| Label           | Meaning                                                 |
|-----------------|---------------------------------------------------------|
| `ready`         | Groomed and ready to pick up                            |
| `P0` / `P1` / `P2` | Priority (P0 = do next)                              |
| `mobile` / `supabase` / `ble` / `firmware` / `docs` | Surface     |
| `safety-critical` | Touches the alert path; strict test-first + on-device QA |
| `decision`      | An open question to resolve (often via `/new-design`)   |
| `needs-qa` / `qa-passed` | PR QA state                                    |

---

## Pull requests

**Title:** `<type>(<scope>): <description>` - e.g. `feat(mobile): cancel window screen`.

```
## Summary
<1-3 sentences: what and why>

Closes #<n>

## Changes
- <notable change>

## Testing
- <tests added; failing-first shown for safety-critical code>
- QA checklist: <checkboxes for user-facing / on-device changes, or "n/a">

## Risk
- Alert path affected? yes / no - <how>
- BLE protocol version change? yes / no
- Migration / RLS change? yes / no
- Needs a store build (native change) or OTA-safe?
```

One PR per issue where practical. Never an em dash.
