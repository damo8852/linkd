# Battery bench test for issue #59. Not product firmware: it replaces main.py only while testing.
# Logic lives in bench_log.py (host-tested); this file is I/O and BLE. How to run it:
# docs/protocol/firmware_protocol.md#battery-bench-test.
#
#   stress  advertise every 20 ms and, once a central connects, notify every 20 ms: radio bursts
#           back to back. A fresh cell that logs an unexpected reset here cannot carry an SOS.
#   idle    the product's real behavior: advertise every 500 ms, stay connected, notify nothing.
#           Run on a full cell until it dies; the last UP line is the measured battery life.

import bluetooth
import machine
import time

import bench_log
import linkd_ble

LOG = 'bench.log'
MODE_FILE = 'bench_mode'
HEARTBEAT_S = 60

_CAUSES = {
    machine.PWRON_RESET: 'PWRON_RESET',
    machine.HARD_RESET: 'HARD_RESET',
    machine.WDT_RESET: 'WDT_RESET',
    machine.DEEPSLEEP_RESET: 'DEEPSLEEP_RESET',
    machine.SOFT_RESET: 'SOFT_RESET',
}


def _lines():
    try:
        with open(LOG) as f:
            return f.read().split('\n')
    except OSError:
        return []


def _append(line):
    with open(LOG, 'a') as f:
        f.write(line + '\n')


def mode():
    try:
        with open(MODE_FILE) as f:
            return f.read().strip()
    except OSError:
        return 'stress'


def stop():
    """End the run on purpose (from the REPL), so the next boot is not counted as unexpected."""
    _append(bench_log.stop_line())


def report():
    print(bench_log.summarize(_lines()))


def run(test_mode):
    _append(bench_log.boot_line(_CAUSES.get(machine.reset_cause(), 'UNKNOWN'), _lines()))
    stress = test_mode == 'stress'

    ble = bluetooth.BLE()
    ble.active(True)
    connections = set()
    service = (bluetooth.UUID(linkd_ble.SERVICE_UUID), ((bluetooth.UUID(linkd_ble.EVENTS_CHAR_UUID), 0x0010),))
    ((events,),) = ble.gatts_register_services((service,))
    name = linkd_ble.DEVICE_NAME.encode()
    adv = bytes((2, 0x01, 0x06, len(name) + 1, 0x09)) + name
    interval_us = 20_000 if stress else 500_000

    def irq(event, data):
        if event == 1:  # central connected
            connections.add(data[0])
        elif event == 2:  # central disconnected
            connections.discard(data[0])
            ble.gap_advertise(interval_us, adv_data=adv)

    ble.irq(irq)
    ble.gap_advertise(interval_us, adv_data=adv)

    _append(bench_log.start_line(test_mode))
    print('bench', test_mode, 'running; log in', LOG)
    start = time.ticks_ms()
    next_beat = HEARTBEAT_S
    payload = bytes(20)
    while True:
        if stress:
            for conn in connections:
                try:
                    ble.gatts_notify(conn, events, payload)
                except OSError:
                    pass
        up_s = time.ticks_diff(time.ticks_ms(), start) // 1000
        if up_s >= next_beat:
            _append(bench_log.heartbeat_line(up_s))
            next_beat += HEARTBEAT_S
        time.sleep_ms(20 if stress else 200)


def main():
    run(mode())
