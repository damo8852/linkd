# GENERATED from packages/ble-protocol/src/index.ts by `npm run generate -w @linkd/ble-protocol`.
# Do not edit; regenerate. Frame layout and meaning: docs/design/ble_link_spec.md.

PROTOCOL_VERSION = 1

SERVICE_UUID = 'c5cda5a1-c726-4ff0-a4e4-baf8f26d1e63'
VERSION_CHAR_UUID = 'c5cda5a2-c726-4ff0-a4e4-baf8f26d1e63'
EVENTS_CHAR_UUID = 'c5cda5a3-c726-4ff0-a4e4-baf8f26d1e63'

DEVICE_NAME = 'LINKD'

MSG_BUTTON_EVENT = 1
BUTTON_RELEASED = 0
BUTTON_PRESSED = 1

# Test vectors: what the app-side encoder produces. Firmware tests must match them.
FRAME_BUTTON_PRESSED = b'\x01\x01\x01'
FRAME_BUTTON_RELEASED = b'\x01\x01\x00'
