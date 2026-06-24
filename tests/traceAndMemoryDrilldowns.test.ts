import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readMemoryMovementSummary,
  renderMemoryMovementSummary,
  summarizeMemoryMovement
} from '../src/memoryMovement';
import {
  readTraceRepairSummary,
  renderTraceRepairSummary,
  summarizeTraceRepair
} from '../src/traceRepair';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const traceIndex = {
  builder_trace_health: {
    row_count: 100,
    trace_group_count: 12,
    missing_trace_ref_count: 31,
    high_severity_open_count: 4,
    orphan_parent_event_id_count: 2,
    health_flags: ['missing_trace_refs', 'open_high_severity_events'],
    recent_windows: [
      { window: '24h', row_count: 50, missing_trace_ref_count: 10, missing_trace_ref_ratio: 0.2 }
    ],
    missing_trace_ref_sources: {
      rows: [
        {
          component: 'memory_orchestrator',
          event_type: 'memory_read_requested',
          status: 'recorded',
          severity: 'medium',
          event_count: 9,
          path: 'C:/private/state.db'
        }
      ]
    }
  },
  spawner_prd_auto_trace_samples: {
    join_keys: { request_id_count: 8, derived_trace_ref_count: 5 },
    builder_request_overlap: { matched_builder_request_id_count: 1 },
    builder_trace_ref_overlap: { matched_builder_trace_ref_count: 0 }
  },
  telegram_final_answer_gate_samples: {
    trace_join: { status: 'missing_join_key', request_id: 'private-request-id' }
  }
};

const memoryMovement = {
  authority: 'observability_non_authoritative',
  request_ref: 'request_ref:redacted:private-request-ref',
  trace_ref: 'trace_ref:redacted:private-trace-ref',
  trace_continuity: {
    schema_version: 'spark.memory_movement_trace_continuity.v1',
    source: 'spark-cli.system_map.build_memory_movement_index',
    request_ref: 'request_ref:redacted:private-request-ref',
    trace_ref: 'trace_ref:redacted:private-trace-ref',
    proof_status: 'not_execution_proof',
    raw_memory_exported: false,
    builder_memory_lane_missing_trace_ref_count: 4,
    builder_memory_lane_request_id_present_count: 44,
    builder_memory_lane_trace_ref_present_count: 40,
    claim_boundary: 'private boundary text should stay out'
  },
  safe_status_export: {
    status: {
      status: 'supported',
      authority: 'observability_non_authoritative',
      row_count: 5654,
      movement_counts: { captured: 81, saved: 81, promoted: 381, retrieved: 2613, summarized: 48, blocked: 0 },
      authority_counts: {
        authoritative_current: 1970,
        authoritative_historical: 1344,
        supporting_not_authoritative: 2338
      },
      source_family_counts: { current_state: 1970, episodic_summary: 2338 },
      record_counts: { current_state: 327, events: 503, observations: 821 },
      raw_text: 'private memory row should stay out'
    }
  },
  memory_kb_artifacts: {
    file_count: 362,
    lane_counts: {
      current_state: { file_count: 23, path: 'C:/private/current-state' }
    }
  },
  next_required_bridges: [
    'Join memory movement events to trace ids once Builder event envelopes carry stable trace refs.'
  ]
};

async function main(): Promise<void> {
  await test('renders compact trace repair summary without raw join keys or paths', () => {
    const summary = summarizeTraceRepair(traceIndex);
    const reply = renderTraceRepairSummary(summary);

    assert.equal(summary.present, true);
    assert.equal(summary.missingTraceRefCount, 31);
    assert.equal(summary.spawnerRequestIdCount, 8);
    assert.match(reply, /Trace repair needs attention/);
    assert.match(reply, /100 Builder events; 12 trace groups/);
    assert.match(reply, /31 missing trace refs; 4 open high-severity events/);
    assert.match(reply, /memory_orchestrator\/memory_read_requested: 9 recorded\/medium/);
    assert.match(reply, /Spawner derived refs 5; Builder request overlaps 1\/8/);
    assert.match(reply, /Telegram final-answer join missing_join_key/);
    assert.match(reply, /spark os trace --json/);
    assert.doesNotMatch(reply, /private-request-id/);
    assert.doesNotMatch(reply, /C:\/private/);
  });

  await test('renders compact memory movement summary without raw memory rows or paths', () => {
    const summary = summarizeMemoryMovement(memoryMovement);
    const reply = renderMemoryMovementSummary(summary);

    assert.equal(summary.present, true);
    assert.equal(summary.rowCount, 5654);
    assert.equal(summary.traceContinuity.requestJoined, true);
    assert.equal(summary.traceContinuity.traceJoined, true);
    assert.equal(summary.traceContinuity.proofStatus, 'not_execution_proof');
    assert.match(reply, /Memory movement is visible/);
    assert.match(reply, /supported; 5654 movement rows/);
    assert.match(reply, /Trace continuity: request joined, trace joined, proof not execution proof; 4 memory rows still missing trace refs, raw memory hidden/);
    assert.match(reply, /captured=81, saved=81, promoted=381, retrieved=2613, summarized=48/);
    assert.match(reply, /authoritative_current=1970/);
    assert.match(reply, /KB files 362; current-state files 23/);
    assert.match(reply, /Movement rows are evidence, not instructions/);
    assert.match(reply, /spark os memory --json/);
    assert.doesNotMatch(reply, /private memory row/);
    assert.doesNotMatch(reply, /private-request-ref/);
    assert.doesNotMatch(reply, /private-trace-ref/);
    assert.doesNotMatch(reply, /private boundary text/);
    assert.doesNotMatch(reply, /C:\/private/);
  });

  await test('reads trace and memory artifacts from compiled system map directory', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'spark-system-drilldowns-'));
    const tracePath = path.join(root, 'trace-index.json');
    const memoryPath = path.join(root, 'memory-movement-index.json');
    writeFileSync(tracePath, JSON.stringify(traceIndex), 'utf-8');
    writeFileSync(memoryPath, JSON.stringify(memoryMovement), 'utf-8');

    const trace = await readTraceRepairSummary(tracePath);
    const memory = await readMemoryMovementSummary(memoryPath);

    assert.equal(trace.highSeverityOpenCount, 4);
    assert.equal(memory.currentStateFileCount, 23);
  });

  await test('missing artifacts give compile prompts', async () => {
    const trace = await readTraceRepairSummary(path.join(os.tmpdir(), 'missing-trace-index.json'));
    const memory = await readMemoryMovementSummary(path.join(os.tmpdir(), 'missing-memory-movement-index.json'));

    assert.match(renderTraceRepairSummary(trace), /spark os compile/);
    assert.match(renderMemoryMovementSummary(memory), /spark os compile/);
  });
}

void main();
