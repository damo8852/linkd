# LINKD bangle firmware (MicroPython, ESP32-C6). Thin glue: Pin + BLE. Logic lives in button.py,
# hold.py, trigger.py and frames.py (host-tested); protocol values come from the generated linkd_ble module.
#
# What it does: advertises the LINKD service and serves the protocol version; notifies a BUTTON_EVENT
# on every debounced press and release (display only); and when the button is held SOS_HOLD_MS,
# notifies SOS_TRIGGER, resent until the app writes back an ACK with its seq.
#
# TODO(battery): send battery_critical_frame() before shutdown once the battery can be read (battery budget still open).

import bluetooth
import time
from machine import Pin
from micropython import const

import linkd_ble
from button import Debouncer
from frames import button_frame, parse_ack
from hold import HoldDetector
from trigger import TriggerSender

BUTTON_GPIO = 17  # XIAO D7; button between this pin and GND
LED_GPIO = 15  # onboard LED, active-low

_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)
_FLAG_READ = const(0x0002)
_FLAG_WRITE_NO_RESPONSE = const(0x0004)
_FLAG_WRITE = const(0x0008)
_FLAG_NOTIFY = const(0x0010)
_ADV_INTERVAL_US = 500_000  # ponytail: fixed 500 ms; tune for the coin cell budget (#59)


def _adv_payload(name, service_uuid):
    # Flags (general discoverable, BLE only) + complete local name + 128-bit service UUID: 28 bytes.
    def field(kind, value):
        return bytes((len(value) + 1, kind)) + value

    return field(0x01, b'\x06') + field(0x09, name.encode()) + field(0x07, bytes(service_uuid))


class Bangle:
    def __init__(self, on_ack):
        self._on_ack = on_ack
        self._ble = bluetooth.BLE()
        self._ble.active(True)
        self._ble.irq(self._irq)
        service = (
            bluetooth.UUID(linkd_ble.SERVICE_UUID),
            (
                (bluetooth.UUID(linkd_ble.VERSION_CHAR_UUID), _FLAG_READ),
                (bluetooth.UUID(linkd_ble.EVENTS_CHAR_UUID), _FLAG_NOTIFY),
                (bluetooth.UUID(linkd_ble.ACK_CHAR_UUID), _FLAG_WRITE | _FLAG_WRITE_NO_RESPONSE),
            ),
        )
        ((self._version_handle, self._events_handle, self._ack_handle),) = self._ble.gatts_register_services((service,))
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
        elif event == _IRQ_GATTS_WRITE:
            _conn, handle = data
            if handle == self._ack_handle:
                seq = parse_ack(self._ble.gatts_read(handle))
                if seq is not None:
                    self._on_ack(seq)

    def connected(self):
        return len(self._connections) > 0

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
    hold = HoldDetector(linkd_ble.SOS_HOLD_MS, ticks_diff=time.ticks_diff)
    sender = TriggerSender(ticks_diff=time.ticks_diff)
    bangle = Bangle(on_ack=lambda seq: (sender.ack(seq), print('acked', seq)))
    pressed = False
    print('LINKD advertising; hold the button 3 s for an SOS')
    while True:
        now = time.ticks_ms()
        event = debouncer.update(button.value(), now)
        if event:
            pressed = event == 'pressed'
            led.value(0 if pressed else 1)
            bangle.send(button_frame(pressed))
            print(event)
        if hold.update(pressed, now):
            print('sos trigger', sender.trigger(now))
        frame = sender.due(now, bangle.connected())
        if frame:
            bangle.send(frame)
        time.sleep_ms(10)


run()
