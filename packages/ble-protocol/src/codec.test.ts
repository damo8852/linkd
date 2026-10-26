import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BUTTON_PRESSED,
  BUTTON_RELEASED,
  decodeFrame,
  encodeButtonEvent,
  MSG_BUTTON_EVENT,
  PROTOCOL_VERSION,
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
  for (const type of [0, MSG_BUTTON_EVENT + 1, 255]) {
    assert.equal(decodeFrame(new Uint8Array([PROTOCOL_VERSION, type, BUTTON_PRESSED])), null, `type ${type}`);
  }
});

test('a button state other than pressed or released produces no event', () => {
  for (const state of [2, 127, 255]) {
    assert.equal(decodeFrame(new Uint8Array([PROTOCOL_VERSION, MSG_BUTTON_EVENT, state])), null, `state ${state}`);
  }
});
