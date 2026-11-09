# GENERATED from packages/ble-protocol/src/index.ts by `npm run generate -w @linkd/ble-protocol`.
# Do not edit; regenerate. Frame layout and meaning: docs/design/ble_link_spec.md.

PROTOCOL_VERSION = 2

SERVICE_UUID = 'c5cda5a1-c726-4ff0-a4e4-baf8f26d1e63'
VERSION_CHAR_UUID = 'c5cda5a2-c726-4ff0-a4e4-baf8f26d1e63'
EVENTS_CHAR_UUID = 'c5cda5a3-c726-4ff0-a4e4-baf8f26d1e63'
ACK_CHAR_UUID = 'c5cda5a4-c726-4ff0-a4e4-baf8f26d1e63'

DEVICE_NAME = 'LINKD'

MSG_BUTTON_EVENT = 1
BUTTON_RELEASED = 0
BUTTON_PRESSED = 1
MSG_SOS_TRIGGER = 2
MSG_BATTERY_CRITICAL = 3
MSG_ACK = 128

SOS_HOLD_MS = 3000
TRIGGER_RESEND_MS = 1000
TRIGGER_PENDING_MS = 300000

# Test vectors: what the app-side encoder produces. Firmware tests must match them.
FRAME_BUTTON_PRESSED = b'\x02\x01\x01'
FRAME_BUTTON_RELEASED = b'\x02\x01\x00'
FRAME_SOS_TRIGGER_7 = b'\x02\x02\x07'
FRAME_BATTERY_CRITICAL = b'\x02\x03'
FRAME_ACK_7 = b'\x02\x80\x07'
