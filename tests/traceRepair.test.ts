import assert from 'node:assert/strict';
import {
  renderTraceRepairSummary,
  resolveTraceIndexPath,
  summarizeTraceRepair,
  type TraceRepairSummary,
} from '../src/traceRepair';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('resolveTraceIndexPath honours SPARK_SYSTEM_MAP_DIR when set', () => {
  const path = resolveTraceIndexPath({ SPARK_SYSTEM_MAP_DIR: '/var/spark/system-map' } as NodeJS.ProcessEnv);
  assert.equal(path, '/var/spark/system-map/trace-index.json');
});

test('resolveTraceIndexPath falls back to SPARK_OS_SYSTEM_MAP_DIR alias', () => {
  const path = resolveTraceIndexPath({
    SPARK_OS_SYSTEM_MAP_DIR: '/opt/spark/system-map',
  } as NodeJS.ProcessEnv);
  assert.equal(path, '/opt/spark/system-map/trace-index.json');
});

test('resolveTraceIndexPath defaults under ~/.spark/state/system-map when nothing is configured', () => {
  const path = resolveTraceIndexPath({} as NodeJS.ProcessEnv);
  assert.match(path, /[/\\]\.spark[/\\]state[/\\]system-map[/\\]trace-index\.json$/);
});

test('summarizeTraceRepair returns the empty shape for non-object input', () => {
  const summary = summarizeTraceRepair(null);
  assert.equal(summary.present, false);
  assert.equal(summary.rowCount, 0);
  assert.equal(summary.traceGroupCount, 0);
  assert.equal(summary.missingTraceRefCount, 0);
  assert.deepEqual(summary.healthFlags, []);
  assert.deepEqual(summary.recentWindows, []);
  assert.deepEqual(summary.topMissingSources, []);
  assert.equal(summary.telegramFinalAnswerTraceJoinStatus, 'unknown');
});

test('summarizeTraceRepair flips present=true once builder_trace_health has keys', () => {
  const summary = summarizeTraceRepair({
    builder_trace_health: { row_count: 1200, trace_group_count: 14 },
  });
  assert.equal(summary.present, true);
  assert.equal(summary.rowCount, 1200);
  assert.equal(summary.traceGroupCount, 14);
});

test('summarizeTraceRepair coerces non-numeric counters to zero and clamps lists', () => {
  const summary = summarizeTraceRepair({
    builder_trace_health: {
      row_count: 'not-a-number',
      missing_trace_ref_count: '7',
      health_flags: ['a', 'b', 'c', 'd', 'e', 'f'],
      recent_windows: Array.from({ length: 6 }, (_, i) => ({
        window: `w${i}`,
        row_count: i,
        missing_trace_ref_count: i,
        missing_trace_ref_ratio: 0.1 * i,
      })),
      missing_trace_ref_sources: {
        rows: Array.from({ length: 6 }, (_, i) => ({ component: `c${i}`, event_count: i })),
      },
    },
  });
  assert.equal(summary.rowCount, 0);
  assert.equal(summary.missingTraceRefCount, 7);
  assert.deepEqual(summary.healthFlags, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(summary.recentWindows.length, 3);
  assert.equal(summary.topMissingSources.length, 3);
});

test('summarizeTraceRepair surfaces spawner-join counters from nested objects', () => {
  const summary = summarizeTraceRepair({
    builder_trace_health: { row_count: 1 },
    spawner_prd_auto_trace_samples: {
      join_keys: { request_id_count: 42, derived_trace_ref_count: 17 },
      builder_request_overlap: { matched_builder_request_id_count: 9 },
      builder_trace_ref_overlap: { matched_builder_trace_ref_count: 11 },
    },
    telegram_final_answer_gate_samples: { trace_join: { status: 'matched' } },
  });
  assert.equal(summary.spawnerRequestIdCount, 42);
  assert.equal(summary.spawnerDerivedTraceRefCount, 17);
  assert.equal(summary.spawnerBuilderRequestOverlapCount, 9);
  assert.equal(summary.spawnerBuilderTraceRefOverlapCount, 11);
  assert.equal(summary.telegramFinalAnswerTraceJoinStatus, 'matched');
});

test('renderTraceRepairSummary returns the not-compiled hint when present=false', () => {
  const text = renderTraceRepairSummary({
    present: false,
    rowCount: 0,
    traceGroupCount: 0,
    missingTraceRefCount: 0,
    highSeverityOpenCount: 0,
    orphanParentEventIdCount: 0,
    healthFlags: [],
    recentWindows: [],
    topMissingSources: [],
    spawnerRequestIdCount: 0,
    spawnerDerivedTraceRefCount: 0,
    spawnerBuilderRequestOverlapCount: 0,
    spawnerBuilderTraceRefOverlapCount: 0,
    telegramFinalAnswerTraceJoinStatus: 'missing',
  });
  assert.match(text, /not compiled yet/);
  assert.match(text, /spark os compile/);
  assert.match(text, /\/trace_repair/);
});

test('renderTraceRepairSummary calls out attention when health counts are non-zero', () => {
  const summary: TraceRepairSummary = {
    present: true,
    rowCount: 1200,
    traceGroupCount: 14,
    missingTraceRefCount: 5,
    highSeverityOpenCount: 0,
    orphanParentEventIdCount: 0,
    healthFlags: ['ok'],
    recentWindows: [
      { window: 'last-1h', rowCount: 500, missingTraceRefCount: 3, missingTraceRefRatio: 0.006 },
    ],
    topMissingSources: [
      { component: 'workflow', eventType: 'step', status: 'open', severity: 'low', eventCount: 5 },
    ],
    spawnerRequestIdCount: 1,
    spawnerDerivedTraceRefCount: 1,
    spawnerBuilderRequestOverlapCount: 1,
    spawnerBuilderTraceRefOverlapCount: 1,
    telegramFinalAnswerTraceJoinStatus: 'matched',
  };
  const text = renderTraceRepairSummary(summary);
  assert.match(text, /Trace repair needs attention/);
  assert.match(text, /1200 Builder events/);
  assert.match(text, /5 missing trace refs/);
  assert.match(text, /last-1h: 3\/500 missing/);
  assert.match(text, /workflow\/step: 5 open\/low/);
  assert.match(text, /Spawner derived refs 1/);
});

test('renderTraceRepairSummary shows the cleared message when no attention needed', () => {
  const summary: TraceRepairSummary = {
    present: true,
    rowCount: 500,
    traceGroupCount: 5,
    missingTraceRefCount: 0,
    highSeverityOpenCount: 0,
    orphanParentEventIdCount: 0,
    healthFlags: [],
    recentWindows: [],
    topMissingSources: [],
    spawnerRequestIdCount: 0,
    spawnerDerivedTraceRefCount: 0,
    spawnerBuilderRequestOverlapCount: 0,
    spawnerBuilderTraceRefOverlapCount: 0,
    telegramFinalAnswerTraceJoinStatus: 'matched',
  };
  const text = renderTraceRepairSummary(summary);
  assert.match(text, /Trace repair is clear/);
  assert.doesNotMatch(text, /Recent\n/);
});
