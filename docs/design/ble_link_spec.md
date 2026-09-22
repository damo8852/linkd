# BLE Link Spec (draft)

> **Status: draft - no values are final.** UUIDs, byte layouts, and timings are placeholders until locked through `/ble-change`. Code source of truth: `packages/ble-protocol` ([ble_protocol.md](../protocol/ble_protocol.md)).

What the bangle and the app exchange, and when.

---

## Messages (bangle -> app)

| Message            | Purpose                                                       | Delivery                    |
|--------------------|---------------------------------------------------------------|-----------------------------|
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

- Custom GATT service UUIDs (to be generated).
- Byte layout and versioning field for each message.
- Bonding/encryption requirements (prevent a spoofed bangle from sending triggers or suppressing alerts).
- Battery estimate: raw millivolts or firmware-computed percentage/days remaining?
