---
name: new-screen
description: Scaffold an Expo (expo-router) screen or component in apps/mobile with a render test first, theme tokens, and an on-device smoke check.
---

Rules: [mobile_protocol.md](../../../docs/protocol/mobile_protocol.md). Tokens: [style_guide.md](../../../docs/design/style_guide.md).

1. **Test first:** a Jest + RNTL render/behavior test mocking the feature hook with typed fixtures. Run it red. (Mandatory red-first if the screen is on the alert path, like the cancel window.)
2. **Build:** route file in `app/` stays thin; UI + hooks in `src/features/<name>/`. Tokens only, safe-area insets, 44pt+ touch targets, scroll where content can overflow.
3. **Green**, then lint + typecheck.
4. **Smoke check** on a dev build (smallest supported phone if possible). If no device is available, say so; the test in step 1 is the hard requirement.
5. Needs new data -> `/new-migration` first. Needs new BLE data -> `/ble-change` first.

## Checks
- [ ] test shown red before implementation
- [ ] tokens only, safe area, touch targets
- [ ] lint + typecheck + tests green
- [ ] smoke-checked on device (or noted why not)
