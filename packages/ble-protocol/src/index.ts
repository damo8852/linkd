/**
 * The app <-> bangle BLE protocol: single source of truth (docs/protocol/ble_protocol.md).
 * Meaning and timing: docs/design/ble_link_spec.md. The firmware gets these values from the
 * generated MicroPython module (`npm run generate -w @linkd/ble-protocol`), never by hand.
 *
 * Every frame is [version u8, type u8, ...payload]. Anything else decodes to null, and null
 * never becomes an event (malformed or unknown frames must never trigger anything).
 */

/** 2: adds SOS_TRIGGER, ACK, BATTERY_CRITICAL. Version 1 is not supported (none shipped). */
export const PROTOCOL_VERSION = 2;

/** One custom GATT service. The UUIDs were generated once and must never change. */
export const SERVICE_UUID = 'c5cda5a1-c726-4ff0-a4e4-baf8f26d1e63';
/** Read: one byte, the bangle's PROTOCOL_VERSION. */
export const VERSION_CHAR_UUID = 'c5cda5a2-c726-4ff0-a4e4-baf8f26d1e63';
/** Notify: one frame per event. */
export const EVENTS_CHAR_UUID = 'c5cda5a3-c726-4ff0-a4e4-baf8f26d1e63';
/** Write without response, app -> bangle: one ACK frame per received SOS_TRIGGER. */
export const ACK_CHAR_UUID = 'c5cda5a4-c726-4ff0-a4e4-baf8f26d1e63';

/** Advertised local name. */
export const DEVICE_NAME = 'LINKD';

/** Bangle -> app. Raw debounced edges, display only: never reaches the SOS state machine. */
export const MSG_BUTTON_EVENT = 0x01;
/** Bangle -> app: the button was held SOS_HOLD_MS. Payload: seq u8. Resent until acked. */
export const MSG_SOS_TRIGGER = 0x02;
/** Bangle -> app: about to shut down on a dead battery, so the next disconnect is not an SOS. */
export const MSG_BATTERY_CRITICAL = 0x03;
/** App -> bangle: confirms the SOS_TRIGGER with this seq. */
export const MSG_ACK = 0x80;

/** Hold that makes an SOS, measured on the bangle (the in-app button uses the same). */
export const SOS_HOLD_MS = 3_000;
/** The bangle resends an unacked SOS_TRIGGER this often while connected. */
export const TRIGGER_RESEND_MS = 1_000;
/** ...and keeps it pending across reconnects for this long, then drops it (the link loss alerts by itself). */
export const TRIGGER_PENDING_MS = 5 * 60_000;

export const BUTTON_RELEASED = 0;
export const BUTTON_PRESSED = 1;

/** A frame the bangle sends. */
export type Frame =
  | { type: 'button'; pressed: boolean }
  | { type: 'sosTrigger'; seq: number }
  | { type: 'batteryCritical' };

function byte(seq: number): number {
  if (!Number.isInteger(seq) || seq < 0 || seq > 255) {
    throw new RangeError('seq must be an integer 0..255, got ' + String(seq));
  }
  return seq;
}

export function encodeButtonEvent(pressed: boolean): Uint8Array {
  return new Uint8Array([PROTOCOL_VERSION, MSG_BUTTON_EVENT, pressed ? BUTTON_PRESSED : BUTTON_RELEASED]);
}

export function encodeSosTrigger(seq: number): Uint8Array {
  return new Uint8Array([PROTOCOL_VERSION, MSG_SOS_TRIGGER, byte(seq)]);
}

export function encodeBatteryCritical(): Uint8Array {
  return new Uint8Array([PROTOCOL_VERSION, MSG_BATTERY_CRITICAL]);
}

export function encodeAck(seq: number): Uint8Array {
  return new Uint8Array([PROTOCOL_VERSION, MSG_ACK, byte(seq)]);
}

/** Decodes a bangle -> app frame. Anything not exactly well-formed is null and must never become an event. */
export function decodeFrame(bytes: Uint8Array): Frame | null {
  if (bytes.length < 2 || bytes[0] !== PROTOCOL_VERSION) return null;
  const payload = bytes[2];
  switch (bytes[1]) {
    case MSG_BUTTON_EVENT:
      if (bytes.length !== 3) return null;
      if (payload === BUTTON_PRESSED) return { type: 'button', pressed: true };
      if (payload === BUTTON_RELEASED) return { type: 'button', pressed: false };
      return null;
    case MSG_SOS_TRIGGER:
      return bytes.length === 3 && payload !== undefined ? { type: 'sosTrigger', seq: payload } : null;
    case MSG_BATTERY_CRITICAL:
      return bytes.length === 2 ? { type: 'batteryCritical' } : null;
    default:
      return null;
  }
}

/** Decodes an app -> bangle ACK; its seq, or null. */
export function decodeAck(bytes: Uint8Array): number | null {
  return bytes.length === 3 && bytes[0] === PROTOCOL_VERSION && bytes[1] === MSG_ACK ? (bytes[2] ?? null) : null;
}
