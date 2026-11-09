import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ACK_CHAR_UUID,
  BUTTON_PRESSED,
  BUTTON_RELEASED,
  decodeAck,
  decodeFrame,
  encodeAck,
  encodeBatteryCritical,
  encodeButtonEvent,
  encodeSosTrigger,
  EVENTS_CHAR_UUID,
  MSG_ACK,
  MSG_BATTERY_CRITICAL,
  MSG_BUTTON_EVENT,
  MSG_SOS_TRIGGER,
  PROTOCOL_VERSION,
  SERVICE_UUID,
  SOS_HOLD_MS,
  TRIGGER_PENDING_MS,
  TRIGGER_RESEND_MS,
  VERSION_CHAR_UUID,
} from './index.ts';

test('button events round-trip', () => {
  assert.deepEqual(decodeFrame(encodeButtonEvent(true)), { type: 'button', pressed: true });
  assert.deepEqual(decodeFrame(encodeButtonEvent(false)), { type: 'button', pressed: false });
});

test('a button event is [version, type, state]', () => {
  assert.deepEqual([...encodeButtonEvent(true)], [PROTOCOL_VERSION, MSG_BUTTON_EVENT, BUTTON_PRESSED]);
  assert.deepEqual([...encodeButtonEvent(false)], [PROTOCOL_VERSION, MSG_BUTTON_EVENT, BUTTON_RELEASED]);
});

// Anything not exactly a well-formed frame decodes to null: it must never become an event.
test('empty and short frames produce no event', () => {
  assert.equal(decodeFrame(new Uint8Array([])), null);
  assert.equal(decodeFrame(new Uint8Array([PROTOCOL_VERSION])), null);
  assert.equal(decodeFrame(new Uint8Array([PROTOCOL_VERSION, MSG_BUTTON_EVENT])), null);
});

test('a frame with trailing bytes produces no event', () => {
  assert.equal(decodeFrame(new Uint8Array([PROTOCOL_VERSION, MSG_BUTTON_EVENT, BUTTON_PRESSED, 0])), null);
});

test('an unknown protocol version produces no event', () => {
  for (const version of [0, PROTOCOL_VERSION + 1, 255]) {
    assert.equal(decodeFrame(new Uint8Array([version, MSG_BUTTON_EVENT, BUTTON_PRESSED])), null, `v${version}`);
  }
});

test('an unknown message type produces no event', () => {
  for (const type of [0, 0x04, 0x7f, MSG_ACK, 255]) {
    assert.equal(decodeFrame(new Uint8Array([PROTOCOL_VERSION, type, BUTTON_PRESSED])), null, `type ${type}`);
  }
});

test('a button state other than pressed or released produces no event', () => {
  for (const state of [2, 127, 255]) {
    assert.equal(decodeFrame(new Uint8Array([PROTOCOL_VERSION, MSG_BUTTON_EVENT, state])), null, `state ${state}`);
  }
});

// ---------- protocol version 2: SOS_TRIGGER, ACK, BATTERY_CRITICAL ----------

test('this is protocol version 2, and a version 1 frame produces no event', () => {
  assert.equal(PROTOCOL_VERSION, 2);
  assert.equal(decodeFrame(new Uint8Array([1, MSG_BUTTON_EVENT, BUTTON_PRESSED])), null);
  assert.equal(decodeFrame(new Uint8Array([1, MSG_SOS_TRIGGER, 7])), null);
});

test('SOS triggers round-trip with their sequence number, across the whole byte', () => {
  for (const seq of [0, 1, 127, 255]) {
    assert.deepEqual([...encodeSosTrigger(seq)], [PROTOCOL_VERSION, MSG_SOS_TRIGGER, seq]);
    assert.deepEqual(decodeFrame(encodeSosTrigger(seq)), { type: 'sosTrigger', seq });
  }
});

test('an SOS trigger that is short, too long, or the wrong version produces no event', () => {
  assert.equal(decodeFrame(new Uint8Array([PROTOCOL_VERSION, MSG_SOS_TRIGGER])), null);
  assert.equal(decodeFrame(new Uint8Array([PROTOCOL_VERSION, MSG_SOS_TRIGGER, 1, 0])), null);
  assert.equal(decodeFrame(new Uint8Array([PROTOCOL_VERSION + 1, MSG_SOS_TRIGGER, 1])), null);
});

test('battery critical is a bare [version, type] frame; anything else produces no event', () => {
  assert.deepEqual([...encodeBatteryCritical()], [PROTOCOL_VERSION, MSG_BATTERY_CRITICAL]);
  assert.deepEqual(decodeFrame(encodeBatteryCritical()), { type: 'batteryCritical' });
  assert.equal(decodeFrame(new Uint8Array([PROTOCOL_VERSION, MSG_BATTERY_CRITICAL, 0])), null);
});

test('an ACK is [version, 0x80, seq] and decodes only as an ACK, never as a bangle event', () => {
  for (const seq of [0, 42, 255]) {
    assert.deepEqual([...encodeAck(seq)], [PROTOCOL_VERSION, MSG_ACK, seq]);
    assert.equal(decodeAck(encodeAck(seq)), seq);
    assert.equal(decodeFrame(encodeAck(seq)), null);
  }
  assert.equal(decodeAck(new Uint8Array([PROTOCOL_VERSION, MSG_ACK])), null);
  assert.equal(decodeAck(new Uint8Array([PROTOCOL_VERSION, MSG_ACK, 1, 2])), null);
  assert.equal(decodeAck(new Uint8Array([PROTOCOL_VERSION - 1, MSG_ACK, 1])), null);
  assert.equal(decodeAck(encodeSosTrigger(1)), null);
});

test('encoders refuse a sequence number outside one byte', () => {
  for (const seq of [-1, 256, 1.5, Number.NaN]) {
    assert.throws(() => encodeSosTrigger(seq), RangeError, `trigger ${seq}`);
    assert.throws(() => encodeAck(seq), RangeError, `ack ${seq}`);
  }
});

test('the shared timings: 3 s hold, resend every 1 s, give up after 5 min', () => {
  assert.equal(SOS_HOLD_MS, 3_000);
  assert.equal(TRIGGER_RESEND_MS, 1_000);
  assert.equal(TRIGGER_PENDING_MS, 5 * 60_000);
});

test('the ACK characteristic is a new UUID in the service family', () => {
  assert.equal(ACK_CHAR_UUID, 'c5cda5a4-c726-4ff0-a4e4-baf8f26d1e63');
  assert.equal(new Set([SERVICE_UUID, VERSION_CHAR_UUID, EVENTS_CHAR_UUID, ACK_CHAR_UUID]).size, 4);
});
