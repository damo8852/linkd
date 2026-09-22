---
name: new-design
description: Create or extend a design doc in docs/design/ (e.g. the SOS alert flow or BLE link spec) - runs a one-question-at-a-time questionnaire and writes nothing until every answer is confirmed.
---

## Rules

- One question at a time, with the count remaining ("3 questions remaining").
- Yes/no or multiple choice where possible; give a recommended answer and why.
- Flag contradictions with earlier answers or [locked_decisions.md](../../../docs/reference/locked_decisions.md) immediately.
- Write nothing until all answers are confirmed.

## Steps

1. Ask what the design covers. Read the related `docs/design/*` files and their Open Questions first - they seed the questionnaire.
2. Build the question list. For LINKD always cover: failure modes (**missed alert vs false alert**), timing values, offline behavior, iOS vs Android differences, battery impact, privacy, and what is deferred.
3. Run it one by one.
4. Summarize every decision; get confirmation.
5. Write or update the doc: decided items marked **Decided**, remaining open questions listed.
6. Update `locked_decisions.md` (new decisions), `glossary.md` (new terms), and the File Inventory in `session_protocol.md` if a file was added. Open questions still unresolved become `decision` issues via `/new-issue`.
