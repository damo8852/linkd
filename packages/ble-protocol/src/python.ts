/** Renders the generated MicroPython module the firmware imports (generated/linkd_ble.py). */

import * as p from './index.ts';

const bytesLiteral = (bytes: Uint8Array): string =>
  "b'" + [...bytes].map((b) => '\\x' + b.toString(16).padStart(2, '0')).join('') + "'";

export function renderPython(): string {
  return [
    '# GENERATED from packages/ble-protocol/src/index.ts by `npm run generate -w @linkd/ble-protocol`.',
    '# Do not edit; regenerate. Frame layout and meaning: docs/design/ble_link_spec.md.',
    '',
    `PROTOCOL_VERSION = ${p.PROTOCOL_VERSION}`,
    '',
    `SERVICE_UUID = '${p.SERVICE_UUID}'`,
    `VERSION_CHAR_UUID = '${p.VERSION_CHAR_UUID}'`,
    `EVENTS_CHAR_UUID = '${p.EVENTS_CHAR_UUID}'`,
    '',
    `DEVICE_NAME = '${p.DEVICE_NAME}'`,
    '',
    `MSG_BUTTON_EVENT = ${p.MSG_BUTTON_EVENT}`,
    `BUTTON_RELEASED = ${p.BUTTON_RELEASED}`,
    `BUTTON_PRESSED = ${p.BUTTON_PRESSED}`,
    '',
    '# Test vectors: what the app-side encoder produces. Firmware tests must match them.',
    `FRAME_BUTTON_PRESSED = ${bytesLiteral(p.encodeButtonEvent(true))}`,
    `FRAME_BUTTON_RELEASED = ${bytesLiteral(p.encodeButtonEvent(false))}`,
    '',
  ].join('\n');
}
