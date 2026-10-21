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
  assert.match(py, /^FRAME_BUTTON_PRESSED = b'\\x01\\x01\\x01'$/m);
  assert.match(py, /^FRAME_BUTTON_RELEASED = b'\\x01\\x01\\x00'$/m);
});
