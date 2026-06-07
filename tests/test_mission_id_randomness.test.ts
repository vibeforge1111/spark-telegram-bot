import assert from 'node:assert/strict';
import { randomBytes } from 'crypto';
import { buildChipCreateMissionContext } from '../src/missionControl';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('generated IDs use crypto randomBytes not Math.random', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../src/missionControl.ts'), 'utf-8');
  assert.ok(!src.includes('Math.random'), 'missionControl.ts must not use Math.random');
  assert.ok(src.includes("randomBytes"), 'missionControl.ts must use randomBytes from crypto');
});

test('IDs are not predictable from observed sample — no two IDs identical in large sample', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const ctx = buildChipCreateMissionContext(`brief ${i}`);
    ids.add(ctx.missionId);
  }
  assert.equal(ids.size, 200, 'All 200 generated mission IDs should be unique');
});

test('ID length and format still valid', () => {
  const ctx = buildChipCreateMissionContext('test brief');
  assert.ok(ctx.missionId.startsWith('spark-chip-create-'), 'missionId should start with spark-chip-create-');
  assert.ok(ctx.missionId.length > 30, 'missionId should be sufficiently long');
});

test('no two generated IDs are identical', () => {
  const a = buildChipCreateMissionContext('brief a');
  const b = buildChipCreateMissionContext('brief b');
  assert.notEqual(a.missionId, b.missionId);
});

test('Date.now prefix still present in missionId', () => {
  const before = Date.now();
  const ctx = buildChipCreateMissionContext('test');
  const after = Date.now();
  const parts = ctx.missionId.split('-');
  const timestamp = parseInt(parts[parts.length - 2], 10);
  assert.ok(timestamp >= before && timestamp <= after, 'timestamp portion should be within test window');
});
