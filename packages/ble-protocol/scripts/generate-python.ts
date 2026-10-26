// Writes generated/linkd_ble.py. Run after any change to src/index.ts; a test fails if it is stale.
import { writeFileSync } from 'node:fs';

import { renderPython } from '../src/python.ts';

writeFileSync(new URL('../generated/linkd_ble.py', import.meta.url), renderPython());
console.log('wrote generated/linkd_ble.py');
