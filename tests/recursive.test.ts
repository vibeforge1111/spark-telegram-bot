import assert from 'node:assert/strict';
import {
  parseRecursiveCommand,
  renderRecursiveCanvasQueue,
  renderRecursiveDecision,
  renderRecursivePaths,
  renderRecursivePromotionPacket,
  renderRecursiveReviewCandidates,
  renderRecursiveSessions,
  renderRecursiveSwarmPacket,
  renderRecursiveTraceView
} from '../src/recursive';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('parses recursive review decisions with rationale', () => {
  assert.deepEqual(parseRecursiveCommand('defer creator-mission-001 needs transfer proof'), {
    action: 'defer',
    id: 'creator-mission-001',
    rationale: 'needs transfer proof'
  });
  assert.deepEqual(parseRecursiveCommand('start startup-yc rounds 4'), {
    action: 'start',
    chipKey: 'startup-yc',
    rounds: 4
  });
});

test('renders compact recursive session and path lists', () => {
  const sessions = [
    {
      trace_id: 't1',
      session_id: 's1',
      source_kind: 'builder_chip_loop',
      title: 'Startup YC Builder chip loop',
      status: 'completed',
      domain: 'startup-yc',
      updated_at: '2026-05-07T00:00:00Z',
      kanban_bucket: 'completed',
      review_required: false
    }
  ];

  assert.match(renderRecursiveSessions(sessions), /s1 \[completed\] startup-yc/);
  assert.match(renderRecursivePaths(sessions), /startup-yc/);
});

test('renders review queue and audit-only decision records', () => {
  const queue = renderRecursiveReviewCandidates([
    {
      session_id: 'creator-mission-001',
      source_kind: 'creator_mission',
      title: 'creator mission',
      domain: 'startup-yc',
      status: 'completed',
      risk: 'medium',
      reason: 'publish review gate needs review',
      gate_ids: ['publish_review_gate'],
      score_delta: 0.14
    }
  ]);

  assert.match(queue, /creator-mission-001/);
  assert.match(queue, /delta=\+0.14/);

  const decision = renderRecursiveDecision({
    decision_id: 'review-1',
    session_id: 'creator-mission-001',
    decision: 'approve_local',
    scope: 'local',
    actor: 'telegram:test',
    rationale: 'ok',
    created_at: '2026-05-07T00:00:00Z',
    effect: 'workspace_route_only'
  });

  assert.match(decision, /workspace_route_only/);
  assert.match(decision, /Workspace:/);
});

test('parses and renders local promotion packets', () => {
  assert.deepEqual(parseRecursiveCommand('promote creator-mission-001'), {
    action: 'promote',
    id: 'creator-mission-001'
  });

  const packet = renderRecursivePromotionPacket({
    packet_id: 'local-promotion-review-1',
    session_id: 'creator-mission-001',
    title: 'creator mission',
    publication_state: 'staged_local_only',
    effect: 'local_packet_only',
    mutation_allowed: false,
    network_absorbable: false,
    review_decision: {
      decision_id: 'review-1',
      decision: 'approve_local',
      actor: 'telegram:test'
    }
  });

  assert.match(packet, /local promotion packet staged/);
  assert.match(packet, /Network absorbable: false/);
});

test('parses and renders gated Swarm review packets', () => {
  assert.deepEqual(parseRecursiveCommand('sync creator-mission-001'), {
    action: 'sync',
    id: 'creator-mission-001'
  });

  const reply = renderRecursiveSwarmPacket({
    swarm_packet_id: 'swarm-review-local-promotion-review-1',
    session_id: 'creator-mission-001',
    stage: 'swarm_review_staged',
    effect: 'swarm_packet_staged_only',
    publication_allowed: false,
    network_absorbable: false,
    publication_gate: {
      status: 'blocked',
      reason: 'explicit_swarm_publication_not_implemented',
      required_next_command: '/recursive sync-publish'
    }
  });

  assert.match(reply, /Swarm review packet staged/);
  assert.match(reply, /Publication allowed: false/);
  assert.match(reply, /No network publication/);
});

test('parses and renders recursive canvas queue results', () => {
  assert.deepEqual(parseRecursiveCommand('canvas session-startup-yc-001'), {
    action: 'canvas',
    id: 'session-startup-yc-001'
  });

  const reply = renderRecursiveCanvasQueue({
    canvasUrl: '/canvas?pipeline=recursive-session-startup-yc-001&mission=recursive-session-startup-yc-001',
    effect: 'spawner_canvas_queue_only',
    pendingLoadPath: 'C:\\Users\\USER\\.spark\\modules\\spawner-ui\\source\\.spawner\\pending-load.json',
    load: {
      pipelineId: 'recursive-session-startup-yc-001',
      pipelineName: 'Recursive: Startup YC',
      autoRun: false,
      nodes: [{ id: 'stage:trace' }],
      connections: [{ sourceIndex: 0, targetIndex: 1 }],
      relay: {
        missionId: 'recursive-session-startup-yc-001',
        autoRun: false
      }
    }
  });

  assert.match(reply, /Recursive Canvas load queued/);
  assert.match(reply, /Inspect-only: autoRun is false/);
});

test('parses and renders stitched recursive trace views', () => {
  assert.deepEqual(parseRecursiveCommand('trace session-startup-yc-001'), {
    action: 'trace',
    id: 'session-startup-yc-001'
  });

  const reply = renderRecursiveTraceView({
    session_id: 'session-startup-yc-001',
    title: 'Startup YC recursive autoloop',
    status: 'completed',
    source_kind: 'swarm_autoloop',
    spawner: {
      board_entry: { status: 'completed', taskCount: 5 },
      canvas_queue: {
        pipelineId: 'recursive-session-startup-yc-001',
        pending: true,
        latest: true,
        autoRun: false
      }
    },
    review: {
      required: false,
      decisions: [],
      local_packets: [],
      swarm_packets: []
    },
    timeline: [
      { kind: 'round', title: 'round-003', status: 'kept', summary: 'improved' },
      { kind: 'canvas', title: 'Spawner Canvas load', status: 'pending', summary: 'queued' }
    ]
  });

  assert.match(reply, /Spark Workspace Recursion Trace/);
  assert.match(reply, /Canvas: pending/);
  assert.match(reply, /swarm packets=0/);
  assert.match(reply, /round-003/);
});
