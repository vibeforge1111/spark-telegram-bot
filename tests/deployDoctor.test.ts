import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const missing = path.join(process.cwd(), '.missing-r30-deploy-doctor-env');
const result = spawnSync(
  process.execPath,
  ['scripts/deploy-doctor.mjs', '--', '--env-file', missing],
  { cwd: process.cwd(), encoding: 'utf8' }
);

assert.equal(result.status, 2);
assert.match(result.stderr, /FAIL --env-file: .*file not found/);
assert.doesNotMatch(result.stderr, /\n\s+at\s/);
console.log('ok - deploy doctor explains a missing env file without a stack trace');
