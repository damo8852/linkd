# docs

Map of the documentation. Per-file update rules: [File Inventory](protocol/session_protocol.md#file-inventory).

## protocol/ - how we work

| File                                                  | Purpose                                                     |
|-------------------------------------------------------|-------------------------------------------------------------|
| [session_protocol.md](protocol/session_protocol.md)   | Session types, start/end checklists, enforcement rules.     |
| [core_protocol.md](protocol/core_protocol.md)         | Testing, branching, repo layout, naming, quality, commits.  |
| [mobile_protocol.md](protocol/mobile_protocol.md)     | Expo app, BLE client, background behavior, safety UI.       |
| [supabase_protocol.md](protocol/supabase_protocol.md) | Migrations, RLS, auth, Edge Functions, SMS + dispatch.      |
| [ble_protocol.md](protocol/ble_protocol.md)           | How to change the app <-> bangle protocol.                  |
| [firmware_protocol.md](protocol/firmware_protocol.md) | Bangle firmware rules (dormant).                            |
| [qa_protocol.md](protocol/qa_protocol.md)             | On-device QA, safety scenarios, device matrix.              |

## design/ - what we are building

| File                                           | Purpose                                                  |
|------------------------------------------------|----------------------------------------------------------|
| [sos_alert_flow.md](design/sos_alert_flow.md)  | Triggers, timers, recipients, open questions (draft).    |
| [ble_link_spec.md](design/ble_link_spec.md)    | BLE messages and timing (draft).                         |
| [style_guide.md](design/style_guide.md)        | Visual language and tokens (template).                   |

## reference/

| File                                                 | Purpose                                    |
|------------------------------------------------------|--------------------------------------------|
| [locked_decisions.md](reference/locked_decisions.md) | Settled decisions + open questions.        |
| [glossary.md](reference/glossary.md)                 | Shared vocabulary.                         |
| [integrations.md](reference/integrations.md)         | External services and env vars.            |
| [authoring.md](reference/authoring.md)               | Issue + PR templates, labels.              |

## changelog

[changelog.md](changelog.md) - rolling session log (20-entry max).
