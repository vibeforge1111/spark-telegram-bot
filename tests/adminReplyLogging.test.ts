import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync('src/index.ts', 'utf8');
assert.match(src, /conversation\.remember\([^;]+\)\.catch\(\(err\)/);
console.log('ok - conversation remember paths log failures');
