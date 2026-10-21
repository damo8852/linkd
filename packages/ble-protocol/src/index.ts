/**
 * The app <-> bangle BLE protocol: single source of truth (docs/protocol/ble_protocol.md).
 * Meaning and timing: docs/design/ble_link_spec.md. The firmware gets these values from the
 * generated MicroPython module (`npm run generate -w @linkd/ble-protocol`), never by hand.
 *
 * Every frame is [version u8, type u8, ...payload]. Anything else decodes to null, and null
 * never becomes an event (malformed or unknown frames must never trigger anything).
 */

export const PROTOCOL_VERSION = 1;

/** One custom GATT service. The UUIDs were generated once and must never change. */
export const SERVICE_UUID = 'c5cda5a1-c726-4ff0-a4e4-baf8f26d1e63';
/** Read: one byte, the bangle's PROTOCOL_VERSION. */
export const VERSION_CHAR_UUID = 'c5cda5a2-c726-4ff0-a4e4-baf8f26d1e63';
/** Notify: one frame per event. */
export const EVENTS_CHAR_UUID = 'c5cda5a3-c726-4ff0-a4e4-baf8f26d1e63';

/** Advertised local name. */
export const DEVICE_NAME = 'LINKD';

export const MSG_BUTTON_EVENT = 0x01;
export const BUTTON_RELEASED = 0;
export const BUTTON_PRESSED = 1;

export type Frame = { type: 'button'; pressed: boolean };

export function encodeButtonEvent(pressed: boolean): Uint8Array {
  return new Uint8Array([PROTOCOL_VERSION, MSG_BUTTON_EVENT, pressed ? BUTTON_PRESSED : BUTTON_RELEASED]);
}

export function decodeFrame(bytes: Uint8Array): Frame | null {
  if (bytes.length < 2 || bytes[0] !== PROTOCOL_VERSION) return null;
  if (bytes[1] === MSG_BUTTON_EVENT && bytes.length === 3) {
    if (bytes[2] === BUTTON_PRESSED) return { type: 'button', pressed: true };
    if (bytes[2] === BUTTON_RELEASED) return { type: 'button', pressed: false };
  }
  return null;
}
