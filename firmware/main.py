# LINKD bangle firmware (MicroPython, ESP32-C6). Thin glue: Pin + BLE. Logic lives in button.py
# and frames.py (host-tested); protocol values come from the generated linkd_ble module.
#
# What it does (issue #60): advertises the LINKD service, serves the protocol version, and notifies
# a BUTTON_EVENT frame on every debounced press and release. Nothing here is an SOS yet.

import bluetooth
import time
from machine import Pin
from micropython import const

import linkd_ble
from button import Debouncer
from frames import button_frame

BUTTON_GPIO = 17  # XIAO D7; button between this pin and GND
LED_GPIO = 15  # onboard LED, active-low

_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_FLAG_READ = const(0x0002)
_FLAG_NOTIFY = const(0x0010)
_ADV_INTERVAL_US = 500_000  # ponytail: fixed 500 ms; tune for the coin cell budget (#59)


def _adv_payload(name, service_uuid):
    # Flags (general discoverable, BLE only) + complete local name + 128-bit service UUID: 28 bytes.
    def field(kind, value):
        return bytes((len(value) + 1, kind)) + value

    return field(0x01, b'\x06') + field(0x09, name.encode()) + field(0x07, bytes(service_uuid))


class Bangle:
    def __init__(self):
        self._ble = bluetooth.BLE()
        self._ble.active(True)
        self._ble.irq(self._irq)
        service = (
            bluetooth.UUID(linkd_ble.SERVICE_UUID),
            (
                (bluetooth.UUID(linkd_ble.VERSION_CHAR_UUID), _FLAG_READ),
                (bluetooth.UUID(linkd_ble.EVENTS_CHAR_UUID), _FLAG_NOTIFY),
            ),
        )
        ((self._version_handle, self._events_handle),) = self._ble.gatts_register_services((service,))
        self._ble.gatts_write(self._version_handle, bytes((linkd_ble.PROTOCOL_VERSION,)))
        self._connections = set()
        self._adv = _adv_payload(linkd_ble.DEVICE_NAME, bluetooth.UUID(linkd_ble.SERVICE_UUID))
        self._advertise()

    def _advertise(self):
        self._ble.gap_advertise(_ADV_INTERVAL_US, adv_data=self._adv)

    def _irq(self, event, data):
        if event == _IRQ_CENTRAL_CONNECT:
            self._connections.add(data[0])
            print('connected', data[0])
        elif event == _IRQ_CENTRAL_DISCONNECT:
            self._connections.discard(data[0])
            print('disconnected', data[0])
            self._advertise()

    def send(self, frame):
        for conn in self._connections:
            try:
                self._ble.gatts_notify(conn, self._events_handle, frame)
            except OSError as e:
                print('notify failed', conn, e)


def run():
    button = Pin(BUTTON_GPIO, Pin.IN, Pin.PULL_UP)
    led = Pin(LED_GPIO, Pin.OUT, value=1)
    debouncer = Debouncer(settle_ms=30, ticks_diff=time.ticks_diff)
    bangle = Bangle()
    print('LINKD advertising; press the button')
    while True:
        event = debouncer.update(button.value(), time.ticks_ms())
        if event:
            pressed = event == 'pressed'
            led.value(0 if pressed else 1)
            bangle.send(button_frame(pressed))
            print(event)
        time.sleep_ms(10)


run()
