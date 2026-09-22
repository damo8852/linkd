# Core Protocol

The shared core: testing, branching, repo layout, naming, code quality, env vars, commits, and the PR checklist. Surface-specific rules live in:

| Protocol                                     | Owns                                                        |
|----------------------------------------------|-------------------------------------------------------------|
| [mobile_protocol.md](mobile_protocol.md)     | The Expo app (UI, navigation, BLE client, background work)  |
| [supabase_protocol.md](supabase_protocol.md) | Database, RLS, auth, Edge Functions, SMS + dispatch         |
| [ble_protocol.md](ble_protocol.md)           | The app <-> bangle protocol (`packages/ble-protocol`)       |
| [firmware_protocol.md](firmware_protocol.md) | Bangle firmware (dormant until firmware work starts)        |
| [qa_protocol.md](qa_protocol.md)             | Manual + on-device QA, safety scenarios                     |

Session lifecycle and issue selection: [session_protocol.md](session_protocol.md).

---

## Testing

### Safety-critical code is test-first (hard rule)

Red -> green -> refactor. Write the failing test, **show it failing**, then implement the minimum to pass.

Safety-critical code is anything that decides **whether, when, or to whom an SOS goes out**:

| Area                           | The test written first                                                                                          |
|--------------------------------|-----------------------------------------------------------------------------------------------------------------|
| Alert state machine            | Pure unit test over states/events with a fake clock (button press, hold, link lost, cancel, grace expiry).       |
| Disconnect handling            | Link-lost -> grace period -> cancel window -> alert; reconnect inside grace cancels; battery-critical never alerts. |
| BLE codec                      | Encode/decode round-trip + malformed/short/unknown-version frames rejected ([ble_protocol.md](ble_protocol.md)). |
| Alert fan-out (Edge Functions) | Deno test with Twilio + dispatch providers faked: right recipients, idempotent on retry, failure surfaced.        |
| RLS / data access              | pgTAP test: a user can read/write only their own contacts, devices, and alerts.                                 |

### Everything else: tested, not necessarily red-first

Screens, settings, onboarding, and styling need a render test (or a smoke check) covering the happy path, written in the same change. Pure helpers get unit tests.

### Rules that always apply

- **Time is injected.** Anything with a timer (grace period, cancel window, heartbeat, retries) takes a clock so tests never sleep.
- **No live SMS or dispatch in tests or dev.** Providers are faked in tests and point at sandbox/test credentials in dev ([supabase_protocol.md](supabase_protocol.md)).
- **Real-device QA is required** for anything touching BLE, background behavior, permissions, or the alert path ([qa_protocol.md](qa_protocol.md)). Simulators cannot do Bluetooth.

---

## Branching

- **`main`** is always releasable. No direct commits (by convention; GitHub branch protection is not enabled).
- Branch off `main` per issue: `feature/<issue#>-<slug>` (non-bug work) or `bugfix/<issue#>-<slug>` (a fix), e.g. `feature/12-contact-picker`.
- Order of operations:
  1. Get the branch green locally (lint + typecheck + tests), push (CI runs).
  2. Open a PR into `main` with `Closes #<n>`. User-facing or safety-critical changes carry the QA checklist ([qa_protocol.md](qa_protocol.md)).
  3. CI green + review/QA done -> **a developer merges** (squash). Claude never merges.
- Keep branches short-lived (days, not weeks). Sync with `git pull --ff-only` on `main`, then `git merge main` into the branch if it falls behind (no rebasing pushed branches).
- A change that replaces old code removes the old code in the same PR.

---

## Repo Layout

npm workspaces monorepo. Folders marked *(planned)* do not exist yet; create them when the first issue needs them.

```
linkd/
├── apps/
│   └── mobile/                     ← Expo app (expo-router)          [mobile_protocol.md]
│       ├── app/                    ← routes only: thin screens that compose features
│       ├── src/features/<name>/    ← feature code: components, hooks, logic (sos/, device/, contacts/, onboarding/, settings/)
│       ├── src/components/         ← shared UI primitives
│       ├── src/lib/                ← supabase client, ble transport, theme, clock
│       └── app.config.ts           ← Expo config + config plugins (native settings live here)
├── packages/
│   └── ble-protocol/               ← single source of truth for the BLE link  [ble_protocol.md]
│       ├── src/                    ← UUIDs, message types, codec (TS)
│       └── generated/              ← C header for firmware (generated, never hand-edited)
├── supabase/                                                         [supabase_protocol.md]
│   ├── migrations/                 ← SQL migrations (schema + RLS), append-only
│   ├── functions/<name>/           ← Edge Functions (Deno/TS): send-alert, dispatch, ...
│   ├── tests/                      ← pgTAP database tests
│   └── seed.sql                    ← synthetic dev data only
├── firmware/                       ← (planned) bangle firmware       [firmware_protocol.md]
├── docs/
├── .claude/
└── package.json                    ← workspaces root
```

Rules:

- **Routes are thin.** `app/` files compose a feature; logic lives in `src/features/<name>/`.
- **The SOS logic is platform-free.** The alert state machine in `src/features/sos/` is plain TS with no React Native imports, so it is unit-testable and cannot be broken by a UI change.
- **Co-location first**; promote to `src/components/` or `src/lib/` when a second feature needs it.
- **Cross-surface shapes live in one place:** BLE shapes in `packages/ble-protocol`, DB shapes in generated Supabase types. Never hand-copy them.

---

## Naming Conventions

| Item                  | Convention              | Example                    |
|-----------------------|-------------------------|----------------------------|
| Components            | PascalCase              | `ContactCard.tsx`          |
| Hooks                 | camelCase, `use` prefix | `useDeviceLink.ts`         |
| Utilities             | camelCase               | `formatBatteryLevel.ts`    |
| Feature folders       | kebab-case              | `features/emergency-contacts/` |
| Test files            | `*.test.ts(x)`          | `alertMachine.test.ts`     |
| Edge Functions        | kebab-case folder       | `supabase/functions/send-alert/` |
| DB tables / columns   | snake_case, plural tables | `emergency_contacts.phone_e164` |
| Env vars              | SCREAMING_SNAKE_CASE    | `TWILIO_ACCOUNT_SID`       |
| Constants             | SCREAMING_SNAKE_CASE    | `GRACE_PERIOD_MS`          |

---

## Code Quality

- **TypeScript strict** everywhere (app, packages, Edge Functions). No `any`; an unavoidable cast gets a comment saying why it is safe.
- **One shared base tsconfig/ESLint config** at the root; workspaces extend it.
- **Explicit return types** on exported functions.
- **Guard indexed access** - treat lookups as possibly absent.
- **Fail loud in the alert path.** Never swallow an error on the way to sending an alert; surface it to the user and to logs, and fall back (see [sos_alert_flow.md](../design/sos_alert_flow.md)).
- **No PII in logs** - no phone numbers, names, or precise locations in console/analytics output.

---

## Environment Variables

- Documented (name + one-line purpose) in [integrations.md](../reference/integrations.md) before the PR opens.
- **Client-visible** values use the `EXPO_PUBLIC_` prefix and must never be secrets (they ship inside the app binary). Only the Supabase URL and anon key belong there.
- **Secrets** (Twilio, dispatch, service-role key) live only in Supabase Edge Function secrets. Never in the app, never committed.
- Local `.env*` files are gitignored and unreadable by Claude ([.claude/settings.json](../../.claude/settings.json)).

---

## Commit Messages - Conventional Commits

`<type>(<scope>): <short description>` - types `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`. Scopes: `mobile`, `supabase`, `ble`, `firmware`, `docs`. Breaking change: `!` + a `BREAKING CHANGE:` footer. Never put issue numbers in source code or comments - only in commits and PRs.

---

## PR Checklist

- [ ] Self-audit the diff against the protocol(s) for the surfaces touched.
- [ ] PR body has `Closes #<n>`.
- [ ] Safety-critical changes were test-first (failing test shown before implementation).
- [ ] Lint, typecheck, tests green.
- [ ] BLE protocol changed? Both sides updated, version handled ([ble_protocol.md](ble_protocol.md)).
- [ ] Schema changed? Migration + RLS + pgTAP test in the same PR; DB types regenerated.
- [ ] New env vars documented; no secrets in the app bundle.
- [ ] User-facing / BLE / background / alert-path change? QA checklist in the PR, tested on a real device.

### CI gates (all blocking)

Define in `.github/workflows/` when the scaffold lands: typecheck, lint, Jest (app + packages), `deno test` (functions), `supabase test db` (pgTAP), and a check that `packages/ble-protocol/generated/` is up to date with the spec.

---

## Docstrings and Comments

- Exported functions, hooks, and components get TSDoc. Safety-critical functions document **what happens on failure**.
- Comments explain *why*, never reference issue numbers.
