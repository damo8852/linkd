# BLE Link Spec (draft)

> **Status: draft.** The service, characteristics, frame header, and `BUTTON_EVENT` below are implemented (protocol version 1); everything else is a placeholder until locked through `/ble-change`. Code source of truth: `packages/ble-protocol` ([ble_protocol.md](../protocol/ble_protocol.md)).

What the bangle and the app exchange, and when.

---

## GATT layout (protocol version 1)

One custom service, advertised by name (`LINKD`) and service UUID. Values live in `packages/ble-protocol/src/index.ts`; the firmware gets them from the generated `linkd_ble.py`.

| Item                  | UUID                                   | Properties | Value                          |
|-----------------------|----------------------------------------|------------|--------------------------------|
| Service               | `c5cda5a1-c726-4ff0-a4e4-baf8f26d1e63` | -          | -                              |
| Version characteristic | `c5cda5a2-c726-4ff0-a4e4-baf8f26d1e63` | Read       | 1 byte: the bangle's protocol version |
| Events characteristic | `c5cda5a3-c726-4ff0-a4e4-baf8f26d1e63` | Notify     | One frame per event            |

**Frame:** `[version u8, type u8, ...payload]`. A frame with an unknown version or type, a wrong length, or an out-of-range value is ignored: it never becomes an event and never triggers anything.

| Type   | Message        | Payload                             | Total |
|--------|----------------|-------------------------------------|-------|
| `0x01` | `BUTTON_EVENT` | `state u8`: 1 = pressed, 0 = released (debounced, 30 ms) | 3 bytes |

`BUTTON_EVENT` is display-only (the link is not yet bonded or encrypted, so it could be spoofed). It never reaches the SOS state machine; `SOS_TRIGGER` is a separate, later message.

## Messages (bangle -> app)

| Message            | Purpose                                                       | Delivery                    |
|--------------------|---------------------------------------------------------------|-----------------------------|
| `BUTTON_EVENT`     | Raw debounced press / release, display only (implemented, v1) | Notify                      |
| `SOS_TRIGGER`      | Button press/hold detected                                    | Notify, retried until acked |
| `BATTERY_LEVEL`    | Battery voltage / estimate for early replacement warnings     | Periodic + on connect       |
| `BATTERY_CRITICAL` | "Shutting down" - the next disconnect is not an emergency     | Notify, best effort         |
| `DEVICE_INFO`      | Protocol version, firmware version, hardware revision         | Read on connect             |

## Messages (app -> bangle)

| Message       | Purpose                                     |
|---------------|---------------------------------------------|
| `ACK`         | Confirms receipt of `SOS_TRIGGER`           |
| `CONFIG`      | Future: connection interval, gesture config |

## Link and timing

- Connection interval: long (around 1 s or more) while idle, to save the coin cell.
- Link-loss detection: via the BLE supervision timeout + app-side reconnect; the grace period is defined in [sos_alert_flow.md](sos_alert_flow.md).
- Pairing/bonding and security level: open.

## Open questions

- Byte layout of the messages not yet implemented (`SOS_TRIGGER`, `ACK`, battery, `DEVICE_INFO`).
- Bonding/encryption requirements (prevent a spoofed bangle from sending triggers or suppressing alerts).
- Battery estimate: raw millivolts or firmware-computed percentage/days remaining?
