import assert from 'node:assert/strict';
import {
  renderMemoryMovementSummary,
  resolveMemoryMovementIndexPath,
  summarizeMemoryMovement,
  type MemoryMovementSummary,
} from '../src/memoryMovement';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('resolveMemoryMovementIndexPath honours SPARK_SYSTEM_MAP_DIR', () => {
  const path = resolveMemoryMovementIndexPath({
    SPARK_SYSTEM_MAP_DIR: '/var/spark/system-map',
  } as NodeJS.ProcessEnv);
  assert.equal(path, '/var/spark/system-map/memory-movement-index.json');
});

test('resolveMemoryMovementIndexPath falls back to SPARK_OS_SYSTEM_MAP_DIR alias', () => {
  const path = resolveMemoryMovementIndexPath({
    SPARK_OS_SYSTEM_MAP_DIR: '/opt/spark/system-map',
  } as NodeJS.ProcessEnv);
  assert.equal(path, '/opt/spark/system-map/memory-movement-index.json');
});

test('resolveMemoryMovementIndexPath defaults under ~/.spark when nothing is configured', () => {
  const path = resolveMemoryMovementIndexPath({} as NodeJS.ProcessEnv);
  assert.match(path, /[/\\]\.spark[/\\]state[/\\]system-map[/\\]memory-movement-index\.json$/);
});

test('summarizeMemoryMovement returns the empty shape for non-object input', () => {
  const summary = summarizeMemoryMovement(null);
  assert.equal(summary.present, false);
  assert.equal(summary.status, 'unknown');
  assert.equal(summary.authority, 'observability_non_authoritative');
  assert.equal(summary.rowCount, 0);
  assert.deepEqual(summary.movementCounts, {});
  assert.deepEqual(summary.authorityCounts, {});
  assert.deepEqual(summary.recordCounts, {});
  assert.deepEqual(summary.nextRequiredBridges, []);
});

test('summarizeMemoryMovement flips present=true once safe_status_export.status has keys', () => {
  const summary = summarizeMemoryMovement({
    safe_status_export: {
      status: {
        status: 'supported',
        row_count: 320,
        movement_counts: { captured: 100, promoted: 50 },
        authority_counts: { authoritative_current: 200 },
        record_counts: { current_state: 10 },
      },
    },
  });
  assert.equal(summary.present, true);
  assert.equal(summary.status, 'supported');
  assert.equal(summary.rowCount, 320);
  assert.deepEqual(summary.movementCounts, { captured: 100, promoted: 50 });
  assert.deepEqual(summary.authorityCounts, { authoritative_current: 200 });
  assert.deepEqual(summary.recordCounts, { current_state: 10 });
});

test('summarizeMemoryMovement surfaces nested kb_artifacts file counts', () => {
  const summary = summarizeMemoryMovement({
    safe_status_export: { status: { status: 'supported' } },
    memory_kb_artifacts: {
      file_count: 42,
      lane_counts: { current_state: { file_count: 7 } },
    },
  });
  assert.equal(summary.kbFileCount, 42);
  assert.equal(summary.currentStateFileCount, 7);
});

test('summarizeMemoryMovement clamps next_required_bridges to two items', () => {
  const summary = summarizeMemoryMovement({
    safe_status_export: { status: { status: 'supported' } },
    next_required_bridges: ['a', 'b', 'c', 'd'],
  });
  assert.deepEqual(summary.nextRequiredBridges, ['a', 'b']);
});

test('summarizeMemoryMovement coerces non-numeric counters to zero in numberRecord', () => {
  const summary = summarizeMemoryMovement({
    safe_status_export: {
      status: {
        status: 'supported',
        movement_counts: { captured: 'not-a-number', promoted: '5' },
      },
    },
  });
  assert.deepEqual(summary.movementCounts, { captured: 0, promoted: 5 });
});

test('renderMemoryMovementSummary returns the not-compiled hint when present=false', () => {
  const text = renderMemoryMovementSummary({
    present: false,
    status: 'missing',
    authority: 'missing',
    rowCount: 0,
    movementCounts: {},
    authorityCounts: {},
    sourceFamilyCounts: {},
    recordCounts: {},
    kbFileCount: 0,
    currentStateFileCount: 0,
    nextRequiredBridges: [],
  });
  assert.match(text, /not compiled yet/);
  assert.match(text, /spark os compile/);
  assert.match(text, /\/memory_movement/);
});

test('renderMemoryMovementSummary calls out review when status is not supported', () => {
  const summary: MemoryMovementSummary = {
    present: true,
    status: 'partial',
    authority: 'authoritative_current',
    rowCount: 12,
    movementCounts: { captured: 7, blocked: 2 },
    authorityCounts: { authoritative_current: 12 },
    sourceFamilyCounts: {},
    recordCounts: { current_state: 4 },
    kbFileCount: 3,
    currentStateFileCount: 1,
    nextRequiredBridges: ['bridge-a'],
  };
  const text = renderMemoryMovementSummary(summary);
  assert.match(text, /Memory movement needs review/);
  assert.match(text, /captured=7, blocked=2/);
  assert.match(text, /authoritative_current=12/);
  assert.match(text, /current_state=4/);
  assert.match(text, /bridge-a/);
});

test('renderMemoryMovementSummary shows visible message when status is supported', () => {
  const summary: MemoryMovementSummary = {
    present: true,
    status: 'supported',
    authority: 'authoritative_current',
    rowCount: 5,
    movementCounts: {},
    authorityCounts: {},
    sourceFamilyCounts: {},
    recordCounts: {},
    kbFileCount: 0,
    currentStateFileCount: 0,
    nextRequiredBridges: [],
  };
  const text = renderMemoryMovementSummary(summary);
  assert.match(text, /Memory movement is visible/);
  assert.match(text, /none yet/);
});
