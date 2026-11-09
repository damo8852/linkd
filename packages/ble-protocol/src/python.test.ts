import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { renderPython } from './python.ts';

test('the committed MicroPython module matches the package (run `npm run generate` if this fails)', () => {
  const committed = readFileSync(new URL('../generated/linkd_ble.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(committed, renderPython());
});

test('the module carries the TS encoder output as test vectors for the firmware', () => {
  const py = renderPython();
  assert.match(py, /^FRAME_BUTTON_PRESSED = b'\\x02\\x01\\x01'$/m);
  assert.match(py, /^FRAME_BUTTON_RELEASED = b'\\x02\\x01\\x00'$/m);
  assert.match(py, /^FRAME_SOS_TRIGGER_7 = b'\\x02\\x02\\x07'$/m);
  assert.match(py, /^FRAME_BATTERY_CRITICAL = b'\\x02\\x03'$/m);
  assert.match(py, /^FRAME_ACK_7 = b'\\x02\\x80\\x07'$/m);
});

test('the module carries every value the firmware needs', () => {
  const py = renderPython();
  for (const line of [
    'PROTOCOL_VERSION = 2',
    "ACK_CHAR_UUID = 'c5cda5a4-c726-4ff0-a4e4-baf8f26d1e63'",
    'MSG_SOS_TRIGGER = 2',
    'MSG_BATTERY_CRITICAL = 3',
    'MSG_ACK = 128',
    'SOS_HOLD_MS = 3000',
    'TRIGGER_RESEND_MS = 1000',
    'TRIGGER_PENDING_MS = 300000',
  ]) {
    assert.ok(py.split('\n').includes(line), line);
  }
});
