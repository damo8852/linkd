# Firmware Protocol

> **Status: dormant.** No firmware lives in this repo yet. The toolchain (MicroPython) and test approach are locked; the first firmware issue fills in the rest of this file.

Rules for `firmware/` - the bangle firmware, written in **MicroPython** (v1.29.0 on the prototype board) on an Espressif ESP32-C6 running on a coin cell. BLE message shapes come from the generated MicroPython module in `packages/ble-protocol` ([ble_protocol.md](ble_protocol.md)).

---

## Power budget first

The bangle runs on a user-replaceable coin cell (CR2025/CR2032 class). Every change is judged against battery life.

- Deep sleep by default; **wake on the button interrupt**.
- Long BLE connection intervals (around 1 s or more) while idle.
- No constant-current peripherals (mechanical button, not capacitive touch).
- Load bursts (radio TX) are why the board has a bulk capacitor; firmware must not stack high-current actions at the moment an alert fires.
- **Unverified risk:** ESP32-C6 BLE TX peaks are reportedly around 100 mA, far above a coin cell's rated pulse current. Until measured on the real board (see Open Questions in [locked_decisions.md](../reference/locked_decisions.md)), assume a TX burst can brown out the SoC.

## Safety behavior the firmware owns

- **Button press / hold** sends the SOS trigger message defined in [ble_link_spec.md](../design/ble_link_spec.md), retried until acknowledged.
- **Battery reporting**: measure battery voltage periodically and report it so the app can warn early.
- **Battery critical**: before brown-out, send the "battery critical, shutting down" message so the app does **not** treat the coming disconnect as an emergency.
- Reverse-polarity protection is hardware; firmware still handles low-voltage resets gracefully.

## Scope of v1 hardware

In: BLE SoC, coin cell + holder + sealed hatch, reverse-polarity protection, bulk capacitor, sealed tactile button, antenna, flex/rigid-flex PCB.
Out for now: haptic motor, status LED, accelerometer.

## Testing

- **Pure logic lives in modules that import no hardware** (`machine`, `bluetooth`): button debounce and hold timing, frame building. They run unchanged under CPython and MicroPython, with the clock passed in.
- **Host tests:** `python -m unittest` in `firmware/` on the PC (standard library only, so no extra tooling and CI can run them). Safety-critical logic (anything that leads to `SOS_TRIGGER`) is strictly test-first: failing test shown, then implement.
- **Board checks:** the thin glue (`Pin`, `bluetooth`) is checked on the ESP32-C6 with `mpremote`, and from a central (laptop or phone) for BLE behavior.
- Minimum bar before any release: protocol frames tested against the generated module, and the trigger/battery-critical paths tested on hardware.
