# Firmware Protocol

> **Status: dormant.** No firmware lives in this repo yet. When firmware work starts, the first Tracked issue locks the toolchain and test approach (see Open Questions in [locked_decisions.md](../reference/locked_decisions.md)) and fills in this file.

Rules for `firmware/` - the bangle firmware on a Nordic nRF52/nRF54 SoC running on a coin cell. BLE message shapes come from the generated header in `packages/ble-protocol` ([ble_protocol.md](ble_protocol.md)).

---

## Power budget first

The bangle runs on a user-replaceable coin cell (CR2025/CR2032 class). Every change is judged against battery life.

- Deep sleep by default; **wake on the button interrupt**.
- Long BLE connection intervals (around 1 s or more) while idle.
- No constant-current peripherals (mechanical button, not capacitive touch).
- Load bursts (radio TX) are why the board has a bulk capacitor; firmware must not stack high-current actions at the moment an alert fires.

## Safety behavior the firmware owns

- **Button press / hold** sends the SOS trigger message defined in [ble_link_spec.md](../design/ble_link_spec.md), retried until acknowledged.
- **Battery reporting**: measure battery voltage periodically and report it so the app can warn early.
- **Battery critical**: before brown-out, send the "battery critical, shutting down" message so the app does **not** treat the coming disconnect as an emergency.
- Reverse-polarity protection is hardware; firmware still handles low-voltage resets gracefully.

## Scope of v1 hardware

In: BLE SoC, coin cell + holder + sealed hatch, reverse-polarity protection, bulk capacitor, sealed tactile button, antenna, flex/rigid-flex PCB.
Out for now: haptic motor, status LED, accelerometer.

## Testing

To be decided with the toolchain. Minimum bar: protocol encoding tested against the generated header, and the trigger/battery-critical paths tested on hardware before any release.
