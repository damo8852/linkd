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

## Layout and running on the board

- `firmware/main.py`: thin glue (Pin, BLE GATT server, advertising). `firmware/button.py` (debounce) and `firmware/frames.py` (BLE frames) are pure and host-tested in `firmware/tests/`. The protocol constants are `packages/ble-protocol/generated/linkd_ble.py`.
- Prototype board: Seeed XIAO ESP32-C6, button between D7 (GPIO17) and GND, onboard LED on GPIO15 (active-low). It shows up as a USB serial device (Espressif VID 303A).
- Host tests: `cd firmware && python -m unittest`.
- Copy to the board (`pip install mpremote`; replace COM3 with your port): `python -m mpremote connect COM3 fs cp packages/ble-protocol/generated/linkd_ble.py :linkd_ble.py + fs cp firmware/button.py :button.py + fs cp firmware/frames.py :frames.py + fs cp firmware/main.py :main.py + reset`.

## Battery bench test

For [#59](https://github.com/damo8852/linkd/issues/59): does the cell survive radio bursts, and how long does it last? Needs no instruments. `firmware/bench.py` temporarily replaces `main.py` and logs to `bench.log` on the board (format and logic in `firmware/bench_log.py`, host-tested). MicroPython reports a brown-out as a power-on reset, so any reset during a run is logged as `unexpected=1`.

Cell on the XIAO **BAT pads only** (never the 3V3 pin), and a cell with its own protection circuit: the board's charger has no over-discharge cutoff.

1. Install over USB (replace COM3): `python -m mpremote connect COM3 fs cp packages/ble-protocol/generated/linkd_ble.py :linkd_ble.py + fs cp firmware/bench_log.py :bench_log.py + fs cp firmware/bench.py :bench.py + exec "open('main.py','w').write('import bench\nbench.main()\n'); open('bench_mode','w').write('stress')"`. Use `idle` instead of `stress` for the run-down test.
2. Unplug USB so the board runs on the cell only.
   - **stress:** fully charged cell, connect with nRF Connect and enable notifications on the events characteristic, leave it 30 minutes.
   - **idle:** fully charged cell, connect with nRF Connect and leave it connected until the cell dies.
3. Plug USB back in and read the result: `python -m mpremote connect COM3 exec "import bench; bench.stop(); bench.report()"`. `unexpected_resets` above 0 in stress means the cell browned out. In idle, `longest_up_s` is the battery life (plugging USB into a dead board boots it and starts a new run, which logs one expected `unexpected=1`).
4. Restore the product firmware (the copy command under Layout above) and delete the log: `python -m mpremote connect COM3 fs rm :bench.log + fs rm :bench_mode`.

## Testing

- **Pure logic lives in modules that import no hardware** (`machine`, `bluetooth`): button debounce and hold timing, frame building. They run unchanged under CPython and MicroPython, with the clock passed in.
- **Host tests:** `python -m unittest` in `firmware/` on the PC (standard library only, so no extra tooling and CI can run them). Safety-critical logic (anything that leads to `SOS_TRIGGER`) is strictly test-first: failing test shown, then implement.
- **Board checks:** the thin glue (`Pin`, `bluetooth`) is checked on the ESP32-C6 with `mpremote`, and from a central (laptop or phone) for BLE behavior.
- Minimum bar before any release: protocol frames tested against the generated module, and the trigger/battery-critical paths tested on hardware.
