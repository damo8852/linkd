---
name: ble-change
description: Change the app <-> bangle BLE protocol - update ble_link_spec.md and packages/ble-protocol together, codec tests first, regenerate the firmware header, then update app (and firmware) mapping.
---

Rules: [ble_protocol.md](../../../docs/protocol/ble_protocol.md). Spec: [ble_link_spec.md](../../../docs/design/ble_link_spec.md).

1. **Decide the change** with the developer: new message, new field, or breaking change (major version bump). Additive is the default.
2. **Codec tests first** in `packages/ble-protocol`: round-trip, boundaries, malformed/short frames, unknown and old versions (none of which may produce an SOS event). Run red.
3. Update the package definitions + codec to green, and update the spec doc to match.
4. Regenerate `packages/ble-protocol/generated/` (never hand-edit).
5. App: update `apps/mobile/src/lib/ble/` mapping with a test against the new frames (hand to the `mobile` agent).
6. Firmware (once active): hand to the `firmware` agent.
7. PR Risk: state the protocol version impact and which bangle firmware versions remain supported.

## Checks
- [ ] spec doc and package agree
- [ ] codec tests red then green, including malformed + old versions
- [ ] generated header current
- [ ] app mapping updated + tested
