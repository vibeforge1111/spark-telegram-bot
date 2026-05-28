import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync('src/missionRelay.ts', 'utf8');
assert.match(src, /completion delivery failed for mission/);
console.log('ok - missionRelay logs completion delivery failures');
