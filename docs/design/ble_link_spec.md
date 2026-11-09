# BLE Link Spec (draft)

> **Status: draft.** The service, characteristics, frame header, `BUTTON_EVENT`, `SOS_TRIGGER`, `ACK`, and `BATTERY_CRITICAL` below are implemented (protocol version 2); everything else is a placeholder until locked through `/ble-change`. Code source of truth: `packages/ble-protocol` ([ble_protocol.md](../protocol/ble_protocol.md)).

What the bangle and the app exchange, and when.

---

## GATT layout (protocol version 2)

One custom service, advertised by name (`LINKD`) and service UUID. Values live in `packages/ble-protocol/src/index.ts`; the firmware gets them from the generated `linkd_ble.py`.

| Item                   | UUID                                   | Properties                | Value                                 |
|------------------------|----------------------------------------|---------------------------|---------------------------------------|
| Service                | `c5cda5a1-c726-4ff0-a4e4-baf8f26d1e63` | -                         | -                                     |
| Version characteristic | `c5cda5a2-c726-4ff0-a4e4-baf8f26d1e63` | Read                      | 1 byte: the bangle's protocol version |
| Events characteristic  | `c5cda5a3-c726-4ff0-a4e4-baf8f26d1e63` | Notify                    | One bangle -> app frame per event     |
| ACK characteristic     | `c5cda5a4-c726-4ff0-a4e4-baf8f26d1e63` | Write, write w/o response | One app -> bangle `ACK` frame         |

**Frame:** `[version u8, type u8, ...payload]`. A frame with an unknown version or type, a wrong length, or an out-of-range value is ignored: it never becomes an event and never triggers anything.

| Type   | Message            | Direction     | Payload                                                   | Total   |
|--------|--------------------|---------------|-----------------------------------------------------------|---------|
| `0x01` | `BUTTON_EVENT`     | bangle -> app | `state u8`: 1 = pressed, 0 = released (debounced, 30 ms)  | 3 bytes |
| `0x02` | `SOS_TRIGGER`      | bangle -> app | `seq u8`, 0..255, wrapping                                | 3 bytes |
| `0x03` | `BATTERY_CRITICAL` | bangle -> app | none                                                      | 2 bytes |
| `0x80` | `ACK`              | app -> bangle | `seq u8` of the `SOS_TRIGGER` it confirms                 | 3 bytes |

`BUTTON_EVENT` is display-only (the link is not yet bonded or encrypted, so it could be spoofed). It never reaches the SOS state machine.

**SOS trigger delivery.** The bangle measures the hold itself (`SOS_HOLD_MS`, 3 s, counted from the debounced press) and sends `SOS_TRIGGER` once per hold, while still held. It resends the same `seq` every `TRIGGER_RESEND_MS` (1 s) while connected and at once on reconnect, until the app writes an `ACK` with that `seq`. A trigger still unacked after `TRIGGER_PENDING_MS` (5 min) is dropped: by then the link loss has started its own SOS on the phone. A new hold replaces a pending trigger with the next `seq`. The app treats a repeated `seq` as the same trigger and acks it again.

**Versions.** Version 2 replaced version 1 (no version 1 bangle shipped). The app accepts only a bangle whose version characteristic equals its own `PROTOCOL_VERSION` and shows it as unsupported otherwise, so a mismatch is visible instead of triggers being silently ignored.

**Battery critical.** Defined and handled by the app; the firmware does not send it yet, because it cannot read the battery (battery budget still open).

## Messages (bangle -> app)

| Message            | Purpose                                                       | Delivery                    |
|--------------------|---------------------------------------------------------------|-----------------------------|
| `BUTTON_EVENT`     | Raw debounced press / release, display only (implemented)     | Notify                      |
| `SOS_TRIGGER`      | Button held 3 s (implemented, v2)                             | Notify, retried until acked |
| `BATTERY_LEVEL`    | Battery voltage / estimate for early replacement warnings     | Periodic + on connect       |
| `BATTERY_CRITICAL` | Shutting down: next disconnect is no emergency (v2, unsent)   | Notify, best effort         |
| `DEVICE_INFO`      | Protocol version, firmware version, hardware revision         | Read on connect             |

## Messages (app -> bangle)

| Message       | Purpose                                             |
|---------------|-----------------------------------------------------|
| `ACK`         | Confirms receipt of `SOS_TRIGGER` (implemented, v2) |
| `CONFIG`      | Future: connection interval, gesture config         |

## Link and timing

- Connection interval: long (around 1 s or more) while idle, to save the coin cell.
- Link-loss detection: via the BLE supervision timeout + app-side reconnect; the grace period is defined in [sos_alert_flow.md](sos_alert_flow.md).
- Pairing/bonding and security level: open.

## Open questions

- Byte layout of the messages not yet implemented (`BATTERY_LEVEL`, `DEVICE_INFO`, `CONFIG`).
- Bonding/encryption requirements (prevent a spoofed bangle from sending triggers or suppressing alerts).
- Battery estimate: raw millivolts or firmware-computed percentage/days remaining?
