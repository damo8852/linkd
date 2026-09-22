# BLE Protocol (the app <-> bangle seam)

Rules for changing how the app and the bangle talk. The *content* of the protocol (services, characteristics, messages, timing) is specified in [ble_link_spec.md](../design/ble_link_spec.md); this file is the **process** for changing it.

---

## One source of truth

- `packages/ble-protocol` is the single source of truth in code: UUIDs, message types, byte layouts, the protocol version, and the TS encoder/decoder the app uses.
- The firmware consumes a **generated C header** (`packages/ble-protocol/generated/`), never a hand-copied one. CI fails if the generated header is stale.
- [ble_link_spec.md](../design/ble_link_spec.md) describes meaning and timing; it must agree with the package. Change both in the same PR.

## Compatibility

Bangles in the field cannot be force-updated as easily as the app, so:

- Every message carries (or the device exposes) a **protocol version**. The app must handle every version still in the field.
- Changes are **additive by default**: new message types or new trailing fields. Never repurpose an existing type or byte.
- A breaking change bumps the major version and the app keeps support for the old one until no shipped bangle uses it.
- **Unknown or malformed frames never trigger an SOS and never crash the app** - they are logged and ignored. An SOS fires only on a well-formed trigger message or on link loss per [sos_alert_flow.md](../design/sos_alert_flow.md).

## Changing the protocol (`/ble-change`)

1. Update the spec doc and the package definitions together.
2. **Test-first in the package:** encode/decode round-trip, boundary values, malformed frames, old-version frames. Show red, then green.
3. Regenerate the C header.
4. App side: update the event mapping in `apps/mobile/src/lib/ble/` with a test against the new frames.
5. Firmware side (once active): update and test against the regenerated header.
6. PR Risk section states the version impact.
