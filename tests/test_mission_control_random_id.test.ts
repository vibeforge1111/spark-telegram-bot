import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { randomId } from '../src/missionControl';

test('missionControl randomId produces a 16-character hex string', () => {
  assert.match(randomId(), /^[0-9a-f]{16}$/);
});

test('missionControl randomId is not derived from Math.random', () => {
  assert.ok(!randomId.toString().includes('Math.random'));
});

test('missionControl randomId is collision-resistant across many draws', () => {
  const ids = Array.from({ length: 1000 }, () => randomId());
  assert.ok(new Set(ids).size > 990);
});
