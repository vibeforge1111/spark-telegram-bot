import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildBuilderChipLoopBridgeInput,
  buildRecursiveArtifactBridgeArgs,
  buildBuilderChipLoopWorkspacePayload,
  parseRecursiveCommand,
  parseRecursiveProposalOptions,
  resolveRecursiveProposalPayloadPath,
  resolveSparkSwarmBridgeSrc,
  renderBuilderChipLoopCompletion,
  renderRecursiveArtifactSyncCompletion,
  renderRecursiveNetworkProposal,
  renderRecursiveWorkspaceReport,
  renderRecursiveWorkspaceReview,
  renderRecursiveCanvasQueue,
  renderRecursiveDecision,
  renderRecursivePaths,
  renderRecursivePromotionPacket,
  renderRecursiveReviewCandidates,
  renderRecursiveSessions,
  renderRecursiveSwarmPacket,
  renderRecursiveTraceView,
  renderSpecializationLoopComparison,
  renderSpecializationLoopEvidence,
  renderSpecializationLoopInsights,
  renderSpecializationLoopPackage,
  renderSpecializationLoopStatus,
  renderSpecializationPathLoopCompletion,
  sparkWorkspaceApiUrl,
  sparkWorkspaceBridgeHints,
  sparkWorkspaceDecisionsUrl,
  workspaceReviewCandidates,
  workspaceSessions,
  workspaceTraceView
} from '../src/recursive';
import {
  buildSpecializationPathAutoloopBridgeArgs,
  buildSpecializationPathEvidenceBenchmarkArgs,
  buildSpecializationPathPackageBridgeArgs,
  buildSpecializationPathStatusBridgeArgs,
  classifyBuilderAttachmentTargetFromSnapshot,
  resolveLocalSpecializationPathTarget
} from '../src/pathLoop';

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
  assert.deepEqual(parseRecursiveCommand('start startup-yc rounds 20'), {
    action: 'start',
    chipKey: 'startup-yc',
    rounds: 20
  });
  assert.deepEqual(parseRecursiveCommand('status startup-yc'), {
    action: 'status',
    id: 'startup-yc'
  });
  assert.deepEqual(parseRecursiveCommand('benchmark spark-qa-operator'), {
    action: 'benchmark',
    id: 'spark-qa-operator'
  });
  assert.deepEqual(parseRecursiveCommand('package startup-yc'), {
    action: 'package',
    id: 'startup-yc'
  });
  assert.deepEqual(parseRecursiveCommand('sync prompt-benchmark C:\\runs\\prompt.json report C:\\runs\\report.md'), {
    action: 'sync',
    syncKind: 'prompt-benchmark',
    syncArgs: ['C:\\runs\\prompt.json', 'report', 'C:\\runs\\report.md']
  });
  assert.deepEqual(parseRecursiveCommand('sync domain-chip-lab C:\\lab\\loop_telemetry.json workspace-smoke-loop'), {
    action: 'sync',
    syncKind: 'domain-chip-lab',
    syncArgs: ['C:\\lab\\loop_telemetry.json', 'workspace-smoke-loop']
  });
  assert.deepEqual(parseRecursiveCommand('sync domain-autoloop C:\\crypto\\manifest.json C:\\crypto\\state.json'), {
    action: 'sync',
    syncKind: 'domain-autoloop',
    syncArgs: ['C:\\crypto\\manifest.json', 'C:\\crypto\\state.json']
  });
  assert.deepEqual(parseRecursiveCommand('propose C:\\crypto\\.spark-swarm\\collective-sync.json submit'), {
    action: 'propose',
    id: 'C:\\crypto\\.spark-swarm\\collective-sync.json',
    proposeArgs: ['submit']
  });
});

test('builds specialization path evidence benchmark args', () => {
  assert.deepEqual(
    buildSpecializationPathEvidenceBenchmarkArgs({
      casesPath: '/repo/benchmarks/evidence/mac_lab_cases.json',
      evidenceRoot: '/repo/benchmarks/evidence/runs/latest',
      outputPath: '/repo/.spark-swarm/evidence-benchmark/latest-from-telegram.json'
    }),
    [
      '-m',
      'specialization_path_spark_qa_operator.cli',
      'evidence-benchmark',
      '--cases',
      '/repo/benchmarks/evidence/mac_lab_cases.json',
      '--evidence-root',
      '/repo/benchmarks/evidence/runs/latest',
      '--output',
      '/repo/.spark-swarm/evidence-benchmark/latest-from-telegram.json'
    ]
  );
});

test('renders recursive network proposal gates without overclaiming', () => {
  const reply = renderRecursiveNetworkProposal({
    title: 'Crypto Trading Autoloop',
    proposalPath: 'C:\\crypto\\.spark-swarm\\network-proposals\\proposal\\contribution.json',
    currentTier: 'private_draft',
    proposedTier: 'reviewed_candidate',
    readyForPr: false,
    missingGates: ['benchmarkEvidence'],
    submitted: true,
    submitState: 'blocked',
    submitError: null
  });

  assert.match(reply, /Crypto Trading Autoloop sent for review/);
  assert.match(reply, /private for now/);
  assert.match(reply, /add benchmark proof/);
  assert.match(reply, /review state: Blocked/);
  assert.match(reply, /runs\?tab=decisions/);
  assert.doesNotMatch(reply, /C:\\crypto/);
});

test('renders recursive proposal submit errors without claiming it was sent', () => {
  const reply = renderRecursiveNetworkProposal({
    title: 'Crypto Trading Autoloop',
    proposalPath: 'C:\\crypto\\.spark-swarm\\network-proposals\\proposal\\contribution.json',
    currentTier: 'private_draft',
    proposedTier: 'reviewed_candidate',
    readyForPr: true,
    missingGates: [],
    submitted: false,
    submitState: null,
    submitError: 'submission failed'
  });

  assert.match(reply, /Crypto Trading Autoloop is ready for review/);
  assert.doesNotMatch(reply, /sent for review/);
  assert.match(reply, /submission failed/);
});

test('resolves human proposal keys to local collective payloads', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'spark-recursive-proposal-root-'));
  const oldRoots = process.env.SPARK_RECURSIVE_PROPOSAL_ROOTS;
  try {
    const payload = path.join(root, 'domain-chip-crypto-trading', '.spark-swarm', 'collective-sync.json');
    mkdirSync(path.dirname(payload), { recursive: true });
    writeFileSync(payload, '{}', 'utf-8');
    process.env.SPARK_RECURSIVE_PROPOSAL_ROOTS = root;
    assert.equal(resolveRecursiveProposalPayloadPath('crypto-trading'), payload);
  } finally {
    if (oldRoots === undefined) delete process.env.SPARK_RECURSIVE_PROPOSAL_ROOTS;
    else process.env.SPARK_RECURSIVE_PROPOSAL_ROOTS = oldRoots;
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolves Spark Swarm bridge source from repo override', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'spark-swarm-repo-'));
  const oldRepo = process.env.SPARK_SWARM_REPO;
  const oldSrc = process.env.SPARK_SWARM_BRIDGE_SRC;
  try {
    const bridgeSrc = path.join(root, 'apps', 'bridge', 'src');
    mkdirSync(path.join(bridgeSrc, 'spark_swarm_bridge'), { recursive: true });
    writeFileSync(path.join(bridgeSrc, 'spark_swarm_bridge', 'cli.py'), '', 'utf-8');
    process.env.SPARK_SWARM_REPO = root;
    delete process.env.SPARK_SWARM_BRIDGE_SRC;
    assert.equal(resolveSparkSwarmBridgeSrc(), bridgeSrc);
  } finally {
    if (oldRepo === undefined) delete process.env.SPARK_SWARM_REPO;
    else process.env.SPARK_SWARM_REPO = oldRepo;
    if (oldSrc === undefined) delete process.env.SPARK_SWARM_BRIDGE_SRC;
    else process.env.SPARK_SWARM_BRIDGE_SRC = oldSrc;
    rmSync(root, { recursive: true, force: true });
  }
});

test('parses recursive network proposal options for review gates', () => {
  assert.deepEqual(
    parseRecursiveProposalOptions([
      'title',
      'Crypto',
      'Trading',
      'Autoloop',
      'risk',
      'Private',
      'workspace',
      'evidence',
      'only',
      'replay',
      'spark-swarm',
      'domain-autoloop',
      '--sync-collective',
      'submit'
    ]),
    {
      submit: true,
      title: 'Crypto Trading Autoloop',
      riskNotes: 'Private workspace evidence only',
      replayCommand: 'spark-swarm domain-autoloop --sync-collective'
    }
  );
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

  const sessionList = renderRecursiveSessions(sessions);
  assert.match(sessionList, /Clear/);
  assert.match(sessionList, /Startup YC Builder Chip Loop · Completed/);
  assert.match(sessionList, /Ask: show Startup YC Builder Chip Loop report\./);
  assert.doesNotMatch(sessionList, /Use \/recursive report 1/);
  assert.doesNotMatch(sessionList, /\/recursive report s1/);
  assert.match(sessionList, /Workspace\nhttp:\/\/127.0.0.1:4178\/runs\?tab=recursions/);
  assert.doesNotMatch(sessionList, /What happened:/);
  assert.doesNotMatch(sessionList, /Next:/);
  assert.doesNotMatch(sessionList, /- updated /);
  assert.doesNotMatch(sessionList, /May 7/);

  const pathList = renderRecursivePaths(sessions);
  assert.match(pathList, /Startup YC\n1 loop · clear/);
  assert.doesNotMatch(pathList, /latest May/);
  assert.match(pathList, /Pick a path by name\./);
  assert.doesNotMatch(pathList, /Use \/recursive sessions/);
  assert.doesNotMatch(pathList, /Next:/);

  const reviewPathList = renderRecursivePaths([
    ...sessions,
    {
      ...sessions[0],
      trace_id: 't2',
      session_id: 's2',
      review_required: true
    },
    {
      ...sessions[0],
      trace_id: 't3',
      session_id: 's3',
      review_required: true
    }
  ]);
  assert.match(reviewPathList, /Startup YC\n3 loops · 2 loops need review/);
  assert.doesNotMatch(reviewPathList, /2 loops needs review/);

  const sessionPriorityList = renderRecursiveSessions([
    sessions[0],
    {
      ...sessions[0],
      trace_id: 't4',
      session_id: 'review-me',
      title: 'Review Me',
      review_required: true,
      updated_at: '2026-05-06T00:00:00Z'
    }
  ]);
  assert.match(sessionPriorityList, /Needs review\n🟡 Review Me/);
  assert.match(sessionPriorityList, /Clear\n⚪ Startup YC Builder Chip Loop/);
  assert.doesNotMatch(sessionPriorityList, /review-me/);
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

  assert.match(queue, /🟡 Startup YC/);
  assert.match(queue, /score change \+0.14/);
  assert.match(queue, /review: \/recursive review creator-mission-001/);
  assert.match(queue, /Workspace\nhttp:\/\/127.0.0.1:4178\/runs\?tab=decisions/);
  assert.doesNotMatch(queue, /Next:/);
  assert.doesNotMatch(queue, /delta=/);

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

  assert.match(decision, /🟢 Recursive review approved\./);
  assert.match(decision, /Telegram recorded the decision route\./);
  assert.match(decision, /Workspace\n• http:\/\/127.0.0.1:4178\/runs\?tab=decisions/);
  assert.doesNotMatch(decision, /Next:/);
  assert.doesNotMatch(decision, /\/recursive report creator-mission-001/);
  assert.doesNotMatch(decision, /workspace_route_only/);
  assert.equal(sparkWorkspaceDecisionsUrl(), 'http://127.0.0.1:4178/runs?tab=decisions');
});

test('renders applied recursive decisions as plain confirmations', () => {
  const decision = renderRecursiveDecision({
    decision_id: 'review-2',
    session_id: 'inbox_high_mastery',
    decision: 'request_more_eval',
    scope: 'workspace',
    actor: 'telegram:test',
    rationale: 'needs another benchmark pass',
    created_at: '2026-05-07T00:00:00Z',
    effect: 'spark_workspace_review',
    target_type: 'mastery',
    target_id: 'mastery_startup_yc_team_health',
    workspace_detail: 'Workspace mastery review submitted as defer.'
  });

  assert.match(decision, /🟡 Recursive review more eval requested\./);
  assert.match(decision, /Workspace review updated\./);
  assert.match(decision, /Mastery review submitted as defer\./);
  assert.match(decision, /Workspace\n• http:\/\/127.0.0.1:4178\/runs\?tab=decisions/);
  assert.doesNotMatch(decision, /Next:/);
  assert.doesNotMatch(decision, /\/recursive review mastery_startup_yc_team_health/);
  assert.doesNotMatch(decision, /\/recursive report mastery_startup_yc_team_health/);
  assert.doesNotMatch(decision, /spark_workspace_review/);
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

  assert.match(packet, /Local promotion packet staged/);
  assert.match(packet, /private only/);
  assert.match(packet, /not shared with the network/);
  assert.doesNotMatch(packet, /Next:/);
  assert.doesNotMatch(packet, /local_packet_only/);
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
  assert.match(reply, /network sharing blocked/);
  assert.match(reply, /Explicit swarm publication not implemented\./);
  assert.doesNotMatch(reply, /Next:/);
  assert.doesNotMatch(reply, /swarm_packet_staged_only/);
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

  assert.match(reply, /Recursive Canvas is ready/);
  assert.match(reply, /Canvas\n• \/canvas\?pipeline=recursive-session-startup-yc-001&mission=recursive-session-startup-yc-001/);
  assert.match(reply, /Plan\n• 1 node\n• inspect only/);
  assert.doesNotMatch(reply, /Next:/);
  assert.doesNotMatch(reply, /spawner_canvas_queue_only/);
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
      { kind: 'outcome', title: 'outcome:startup-yc:baseline', status: 'flat', summary: 'baseline held' },
      { kind: 'canvas', title: 'Spawner Canvas load', status: 'pending', summary: 'queued' }
    ]
  });

  assert.match(reply, /Startup YC recursive autoloop trace/);
  assert.match(reply, /Status\ncompleted\ncanvas pending/);
  assert.doesNotMatch(reply, /review clear/);
  assert.doesNotMatch(reply, /tracked items in Workspace/);
  assert.match(reply, /round-003/);
  assert.match(reply, /baseline held steady/);
  assert.doesNotMatch(reply, /baseline held steady - baseline held/);
  assert.doesNotMatch(reply, /- ⚪ baseline/);
  assert.doesNotMatch(reply, /outcome:startup-yc:baseline/);
  assert.match(reply, /Workspace\nhttp:\/\/127.0.0.1:4178\/runs\?tab=recursions/);
  assert.doesNotMatch(reply, /Review decisions:/);
  assert.doesNotMatch(reply, /\/recursive review session-startup-yc-001/);
  assert.doesNotMatch(reply, /\/recursive report session-startup-yc-001/);
});

test('renders long path trace titles as readable labels', () => {
  const reply = renderRecursiveTraceView({
    session_id: 'path:startup-yc',
    title: 'Improve Startup YC on Startup Bench by iterating the active YC sub-doctrine on benchmarks/startup-yc.tool_calls.json.',
    status: 'open',
    source_kind: 'spark_workspace_evolution_path',
    spawner: {
      board_entry: { status: 'open', taskCount: 96 },
      canvas_queue: {
        pipelineId: 'spark-workspace-recursions',
        pending: false,
        latest: true,
        autoRun: false
      }
    },
    review: {
      required: true,
      decisions: new Array(7).fill({}),
      local_packets: [],
      swarm_packets: []
    },
    timeline: [
      { kind: 'outcome', title: 'outcome:startup-yc:round:20260423T105059878039Z', status: 'improved', summary: 'improved' }
    ]
  });

  assert.match(reply, /Startup YC trace/);
  assert.match(reply, /Review\n7 decisions waiting/);
  assert.doesNotMatch(reply, /open ·/);
  assert.doesNotMatch(reply, /tracked items in Workspace/);
  assert.doesNotMatch(reply, /canvas: ready/);
  assert.match(reply, /previous round improved/);
  assert.doesNotMatch(reply, /previous round improved - improved/);
  assert.doesNotMatch(reply, /- 🟢 previous round/);
  assert.match(reply, /Workspace\nhttp:\/\/127.0.0.1:4178\/runs\?tab=recursions\nhttp:\/\/127.0.0.1:4178\/runs\?tab=decisions/);
  assert.doesNotMatch(reply, /Next:/);
  assert.doesNotMatch(reply, /\/recursive review path:startup-yc/);
  assert.doesNotMatch(reply, /Improve Startup YC on Startup Bench by iterating/);
});

test('builds a Workspace collective payload for Builder chip loops', () => {
  const built = buildBuilderChipLoopWorkspacePayload({
    workspaceId: 'ws_123',
    chipKey: 'startup-yc',
    roundsCompleted: 3,
    totalRounds: 3,
    emittedAt: '2026-05-07T10:00:00.000Z',
    statusPath: 'C:\\status\\startup-yc.json',
    history: [
      { round_index: 3, suggestions_count: 2, best_verdict: 'improved', best_metric: 0.72 }
    ]
  });

  assert.equal(built.pathId, 'path_builder_chip_startup_yc');
  assert.equal(built.outcomeId, 'outcome_builder_chip_startup_yc_20260507T100000000');
  assert.equal((built.payload.runtimeSource as any).loopKind, 'chip');
  assert.equal((built.payload.runtimeSource as any).chipKey, 'startup-yc');
  assert.equal((built.payload.runtimeSource as any).chipLabel, 'Startup YC');
  assert.equal((built.payload.evolutionPaths as any[])[0].scope, 'workspace');
  assert.equal((built.payload.outcomes as any[])[0].verdict, 'improved');
  assert.equal((built.payload.artifactRefs as any[])[0].kind, 'run_trace');
});

test('builds bridge input for Builder chip loop sync', () => {
  const input = buildBuilderChipLoopBridgeInput({
    ok: true,
    chipKey: 'startup-yc',
    roundsCompleted: 2,
    totalRounds: 3,
    statusPath: 'C:\\status\\startup-yc.json',
    history: [
      { round_index: 2, suggestions_count: 5, best_verdict: 'regressed after patch', best_metric: 0.9 }
    ]
  }, '2026-05-07T10:00:00.000Z');

  assert.equal(input.chipKey, 'startup-yc');
  assert.equal(input.roundsCompleted, 2);
  assert.equal(input.totalRounds, 3);
  assert.equal(input.statusPath, 'C:\\status\\startup-yc.json');
  assert.equal(input.emittedAt, '2026-05-07T10:00:00.000Z');
  assert.equal((input.history as any[])[0].best_verdict, 'regressed after patch');

  const fallback = buildBuilderChipLoopWorkspacePayload({
    workspaceId: 'ws_123',
    chipKey: 'startup-yc',
    emittedAt: '2026-05-07T10:00:00.000Z',
    history: [
      { round_index: 2, suggestions_count: 5, best_verdict: 'regressed after patch', best_metric: 0.9 }
    ]
  });
  assert.equal((fallback.payload.outcomes as any[])[0].verdict, 'regressed');
});

test('classifies recursive start targets from Builder attachment snapshots', () => {
  const snapshot = {
    records: [
      {
        kind: 'chip',
        key: 'domain-chip-creator',
        repo_root: 'C:\\chips\\domain-chip-creator',
        capabilities: ['suggest', 'evaluate']
      },
      {
        kind: 'path',
        key: 'startup-yc',
        repo_root: 'C:\\paths\\specialization-path-startup-yc',
        capabilities: ['suggest', 'score_alignment', 'tournament', 'promote']
      }
    ]
  };

  assert.deepEqual(classifyBuilderAttachmentTargetFromSnapshot(snapshot, 'startup-yc'), {
    kind: 'path',
    key: 'startup-yc',
    repoRoot: 'C:\\paths\\specialization-path-startup-yc',
    capabilities: ['suggest', 'score_alignment', 'tournament', 'promote']
  });
  assert.deepEqual(classifyBuilderAttachmentTargetFromSnapshot(snapshot, 'domain-chip-creator'), {
    kind: 'chip',
    key: 'domain-chip-creator',
    repoRoot: 'C:\\chips\\domain-chip-creator',
    capabilities: ['suggest', 'evaluate']
  });
  assert.deepEqual(classifyBuilderAttachmentTargetFromSnapshot(snapshot, 'unknown-thing'), {
    kind: 'chip',
    key: 'unknown-thing'
  });
});

test('resolves local specialization path repos when attachment snapshot is unavailable', () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'spark-path-target-'));
  const previous = process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO;
  try {
    writeFileSync(path.join(tempRoot, 'specialization-path.json'), JSON.stringify({ key: 'spark-qa-operator' }));
    process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO = tempRoot;
    assert.deepEqual(resolveLocalSpecializationPathTarget('spark-qa-operator'), {
      kind: 'path',
      key: 'spark-qa-operator',
      repoRoot: path.resolve(tempRoot)
    });
    assert.deepEqual(resolveLocalSpecializationPathTarget('path:spark-qa-operator'), {
      kind: 'path',
      key: 'spark-qa-operator',
      repoRoot: path.resolve(tempRoot)
    });
  } finally {
    if (previous === undefined) delete process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO;
    else process.env.SPARK_SWARM_SPECIALIZATION_PATH_SPARK_QA_OPERATOR_REPO = previous;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('builds Spark Swarm bridge args for specialization path autoloops', () => {
  assert.deepEqual(
    buildSpecializationPathAutoloopBridgeArgs({
      pathKey: 'startup-yc',
      repoRoot: 'C:\\paths\\specialization-path-startup-yc',
      rounds: 1,
      sync: {
        workspaceId: 'ws_123',
        apiUrl: 'https://api.example.test',
        accessToken: 'sscli_test'
      }
    }),
    [
      '-m',
      'spark_swarm_bridge.cli',
      'specialization-path',
      'autoloop',
      'startup-yc',
      'C:\\paths\\specialization-path-startup-yc',
      '--rounds',
      '1',
      '--sync-collective',
      '--workspace-id',
      'ws_123',
      '--api-url',
      'https://api.example.test',
      '--access-token',
      'sscli_test'
    ]
  );

  assert.deepEqual(
    buildSpecializationPathAutoloopBridgeArgs({
      pathKey: 'spark-qa-operator',
      repoRoot: 'C:\\paths\\specialization-path-spark-qa-operator',
      rounds: 20
    }),
    [
      '-m',
      'spark_swarm_bridge.cli',
      'specialization-path',
      'autoloop',
      'spark-qa-operator',
      'C:\\paths\\specialization-path-spark-qa-operator',
      '--rounds',
      '20'
    ]
  );
});

test('builds Spark Swarm bridge args for specialization loop status', () => {
  assert.deepEqual(
    buildSpecializationPathStatusBridgeArgs({
      pathKey: 'startup-yc',
      repoRoot: 'C:\\paths\\specialization-path-startup-yc',
    }),
    [
      '-m',
      'spark_swarm_bridge.cli',
      'specialization-path',
      'status',
      'startup-yc',
      'C:\\paths\\specialization-path-startup-yc',
      '--json'
    ]
  );
  assert.deepEqual(
    buildSpecializationPathPackageBridgeArgs({
      pathKey: 'startup-yc',
      repoRoot: 'C:\\paths\\specialization-path-startup-yc',
    }),
    [
      '-m',
      'spark_swarm_bridge.cli',
      'specialization-path',
      'package',
      'startup-yc',
      'C:\\paths\\specialization-path-startup-yc',
      '--json'
    ]
  );
});

test('renders specialization path loop completion with workspace next step', () => {
  const reply = renderSpecializationPathLoopCompletion({
    ok: true,
    pathKey: 'startup-yc',
    roundsCompleted: 1,
    totalRounds: 1,
    stopReason: 'completed_requested_rounds',
    sessionId: 'autoloop-20260508T054500Z',
    sessionSummaryPath: 'C:\\paths\\specialization-path-startup-yc\\.spark-swarm\\specialization-paths\\startup-yc\\sessions\\autoloop-20260508T054500Z\\summary.json',
    payloadPath: 'C:\\paths\\specialization-path-startup-yc\\.spark-swarm\\collective-sync.json',
    workspaceSynced: true,
    pathId: 'path_startup_yc',
    outcomeId: 'outcome_startup_yc_20260508T054500000',
    verdict: 'flat',
    metricName: 'scenario_score:baseline',
    metricValue: 0.61,
    summary: 'Startup YC tested a benchmark-backed YC doctrine mutation.'
  });

  assert.match(reply, /⚪ Latest Startup YC run held steady\./);
  assert.match(reply, /Score\n• 1\/1 rounds\n• scenario score \/ baseline 0.61/);
  assert.match(reply, /Workspace\n• updated\n• http:\/\/127.0.0.1:4178\/runs\?tab=recursions/);
  assert.match(reply, /Report\n• \/recursive report path_startup_yc\n• \/recursive trace path_startup_yc/);
  assert.doesNotMatch(reply, /What happened:/);
  assert.doesNotMatch(reply, /Saved locally:/);
  assert.doesNotMatch(reply, /Next:/);
  assert.doesNotMatch(reply, /C:\\paths/);
  assert.doesNotMatch(reply, /Workspace outcome/);
});

test('renders specialization loop status without raw artifact noise', () => {
  const reply = renderSpecializationLoopStatus({
    ok: true,
    pathKey: 'startup-yc',
    pathLabel: 'Startup YC',
    stage: 'review_required',
    evidenceState: 'complete',
    decision: 'improved',
    heldOutStatus: 'passed',
    trapStatus: 'not_configured',
    claimBoundary: 'Candidate beat the baseline and was kept by the loop gate.',
    nextMove: 'Review the kept candidate and package the evidence before wider reuse.',
    rounds: {
      completed: 1,
      requested: 1,
      kept: 1,
      reverted: 0
    },
    comparison: {
      scoreMetric: 'scenario_score',
      baselineScore: 0.61,
      candidateScore: 0.72,
      delta: 0.11,
      decision: 'kept'
    },
    rawArtifactRefs: {
      summaryPath: 'C:\\paths\\secret\\summary.json'
    }
  });

  assert.match(reply, /🟢 Startup YC has benchmark-backed improvement evidence\./);
  assert.match(reply, /State\n• Review Required\n• evidence: Complete\n• rounds: 1\/1/);
  assert.match(reply, /Score\n• scenario score 0.61 → 0.72/);
  assert.match(reply, /Proof checks\n• held-out: Passed\n• trap: Not Configured/);
  assert.match(reply, /Move\n• Review the kept candidate and package the evidence before wider reuse\./);
  assert.doesNotMatch(reply, /C:\\paths/);
  assert.doesNotMatch(reply, /summaryPath/);
});

test('renders specialization loop insights from the latest path session', () => {
  const reply = renderSpecializationLoopInsights({
    ok: true,
    pathKey: 'startup-yc',
    pathLabel: 'Startup YC',
    completedRounds: 20,
    requestedRounds: 20,
    keptRounds: 2,
    revertedRounds: 18,
    startScore: 0.6337,
    currentScore: 0.6453,
    bestScore: 0.6453,
    keptCandidateSummaries: [
      'YC doctrine stack (3 packets across 3 sub-doctrines): primary=Make something people want. (packet make_something_people_want).',
      'YC doctrine stack (1 packet across 1 sub-doctrine): primary=One great cofounder is worth ten good employees. (packet cofounder_quality_over_employee_count).'
    ],
    sessionSummaryPath: 'C:\\paths\\specialization-path-startup-yc\\.spark-swarm\\specialization-paths\\startup-yc\\sessions\\autoloop\\summary.json'
  });

  assert.match(reply, /Startup YC found a small benchmark-backed gain/);
  assert.match(reply, /20\/20 rounds/);
  assert.match(reply, /active score 0\.6337 → 0\.6453/);
  assert.match(reply, /2 kept, 18 reverted/);
  assert.match(reply, /Make something people want/);
  assert.match(reply, /One great cofounder is worth ten good employees/);
  assert.match(reply, /held-out\/trap checks/);
  assert.doesNotMatch(reply, /summary\.json/);
  assert.doesNotMatch(reply, /C:\\paths/);
});

test('renders specialization loop report from canonical status when no autoloop session exists', () => {
  const reply = renderSpecializationLoopInsights({
    ok: false,
    pathKey: 'spark-qa-operator',
    pathLabel: 'Spark QA Operator',
    error: 'No specialization loop session summary found yet.',
    status: {
      ok: true,
      pathKey: 'spark-qa-operator',
      pathLabel: 'Spark QA Operator',
      stage: 'baseline_complete',
      evidenceState: 'complete',
      decision: 'held_steady',
      heldOutStatus: 'passed',
      trapStatus: 'passed',
      claimBoundary: 'Standalone benchmark completed, but no candidate comparison has been recorded yet.',
      nextMove: 'Try a narrower candidate or inspect weak benchmark lanes.',
      rounds: {
        completed: 1,
        requested: 1,
        kept: 0,
        reverted: 0
      },
      comparison: {
        scoreMetric: 'overall_score',
        baselineScore: 1,
        candidateScore: 1,
        delta: 0,
        decision: 'held_steady'
      },
      rawArtifactRefs: {
        summaryPath: 'C:\\paths\\specialization-path-spark-qa-operator\\.spark-swarm\\spark-qa-benchmark\\summary.json'
      }
    }
  });

  assert.match(reply, /⚪ Spark QA Operator held steady\./);
  assert.match(reply, /State\n• Baseline Complete\n• evidence: Complete\n• rounds: 1\/1/);
  assert.match(reply, /Score\n• current run 1 → 1/);
  assert.match(reply, /Proof checks\n• held-out: Passed\n• trap: Passed/);
  assert.match(reply, /Standalone benchmark completed/);
  assert.doesNotMatch(reply, /No specialization loop session summary found yet/);
  assert.doesNotMatch(reply, /summary\.json/);
  assert.doesNotMatch(reply, /C:\\paths/);
});

test('renders specialization loop compare and evidence from canonical status packets', () => {
  const status = {
    ok: true,
    pathKey: 'startup-yc',
    pathLabel: 'Startup YC',
    stage: 'review_required',
    status: 'ready',
    evidenceState: 'complete',
    decision: 'held_steady',
    heldOutStatus: 'not_configured',
    trapStatus: 'not_configured',
    claimBoundary: 'The candidate underperformed and was reverted, so the active path held steady.',
    nextMove: 'Try a narrower candidate or inspect weak benchmark lanes.',
    rounds: {
      completed: 20,
      requested: 20,
      kept: 2,
      reverted: 18
    },
    comparison: {
      scoreMetric: 'scenario_score',
      baselineScore: 0.6453,
      candidateScore: 0.6037,
      delta: -0.0416,
      decision: 'reverted'
    },
    rawArtifactRefs: {
      summaryPath: 'C:\\paths\\specialization-path-startup-yc\\.spark-swarm\\specialization-paths\\startup-yc\\rounds\\summary.json'
    }
  };

  const compare = renderSpecializationLoopComparison(status);
  assert.match(compare, /Startup YC held steady in the canonical loop status/);
  assert.match(compare, /baseline 0\.6453/);
  assert.match(compare, /candidate 0\.6037 \(-0\.0416\)/);
  assert.match(compare, /2 kept, 18 reverted/);
  assert.doesNotMatch(compare, /summary\.json/);

  const evidence = renderSpecializationLoopEvidence(status);
  assert.match(evidence, /benchmark evidence, but I would not call it upgraded yet/);
  assert.match(evidence, /20\/20 rounds completed/);
  assert.match(evidence, /held-out: not configured/);
  assert.match(evidence, /candidate underperformed and was reverted/);
  assert.doesNotMatch(evidence, /C:\\paths/);
});

test('renders natural specialization loop status conversationally', () => {
  const reply = renderSpecializationLoopStatus({
    ok: true,
    pathKey: 'startup-yc',
    pathLabel: 'Startup YC',
    stage: 'review_required',
    evidenceState: 'complete',
    decision: 'improved',
    heldOutStatus: 'passed',
    trapStatus: 'passed',
    nextMove: 'Review the kept candidate and package the evidence before wider reuse.',
    comparison: {
      scoreMetric: 'mean_scenario_score',
      baselineScore: 0.6803,
      candidateScore: 0.7003,
      delta: 0.02,
      decision: 'kept'
    },
    rawArtifactRefs: {
      summaryPath: 'C:\\paths\\secret\\summary.json'
    }
  }, { style: 'conversational' });

  assert.match(reply, /Startup YC has benchmark-backed improvement evidence\./);
  assert.match(reply, /Mean scenario score moved from 0.6803 to 0.7003\./);
  assert.match(reply, /Held-out and trap checks both passed\./);
  assert.match(reply, /I'd review the kept candidate/);
  assert.doesNotMatch(reply, /Proof checks/);
  assert.doesNotMatch(reply, /C:\\paths/);
});

test('renders specialization loop package without publishing or raw path noise', () => {
  const reply = renderSpecializationLoopPackage({
    ok: true,
    pathKey: 'startup-yc',
    packagePath: 'C:\\paths\\secret\\insight.json',
    packet: {
      path: {
        pathKey: 'startup-yc',
        pathLabel: 'Startup YC'
      },
      claim: {
        decision: 'improved',
        evidenceState: 'complete',
        state: 'benchmark_backed_candidate',
        nextMove: 'Review the kept candidate before publishing.'
      },
      benchmark: {
        comparison: {
          scoreMetric: 'mean_scenario_score',
          baselineScore: 0.6803,
          candidateScore: 0.7003,
          delta: 0.02,
          decision: 'kept'
        },
        heldOutStatus: 'passed',
        trapStatus: 'passed'
      },
      reusableTemplateCandidate: {
        eligible: true
      },
      publication: {
        state: 'local_private',
        published: false,
        networkAbsorbable: false
      }
    }
  });

  assert.match(reply, /I packaged Startup YC's proof locally/);
  assert.match(reply, /Nothing was published or shared/);
  assert.match(reply, /Benchmark-backed improvement: mean scenario score 0.6803 → 0.7003, with held-out and trap checks both passed\./);
  assert.match(reply, /ready for private template review/);
  assert.doesNotMatch(reply, /C:\\paths/);
  assert.doesNotMatch(reply, /insight\.json/);
});

test('renders QA Operator baseline metric as current run in path completion', () => {
  const reply = renderSpecializationPathLoopCompletion({
    ok: true,
    pathKey: 'spark-qa-operator',
    roundsCompleted: 1,
    totalRounds: 1,
    workspaceSynced: true,
    pathId: 'path:spark-qa-operator',
    verdict: 'flat',
    metricName: 'overall_score:baseline',
    metricValue: 0.8655
  });

  assert.match(reply, /Score\n• 1\/1 rounds\n• current run 0.8655/);
  assert.doesNotMatch(reply, /overall score/);
  assert.doesNotMatch(reply, /baseline/);
});

test('describes held-steady Workspace reports as unchanged from previous run', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path:spark-qa-operator',
        scope: 'workspace',
        specializationId: 'spark-qa-operator',
        repoLabel: 'spark-qa-operator',
        summary: 'Spark QA Operator validates Telegram and Workspace flows.',
        status: 'open',
        bestOutcomeId: 'outcome_previous',
        updatedAt: '2026-05-09T16:33:08.000Z'
      }
    ],
    insights: [],
    masteries: [],
    outcomes: [
      {
        id: 'outcome_latest',
        targetType: 'evolution_path',
        targetId: 'path:spark-qa-operator',
        verdict: 'flat',
        summary: 'Spark QA Operator held steady.',
        metricName: 'overall_score',
        metricValue: 0.8655,
        createdAt: '2026-05-09T16:33:08.000Z'
      },
      {
        id: 'outcome_previous',
        targetType: 'evolution_path',
        targetId: 'path:spark-qa-operator',
        verdict: 'improved',
        summary: 'Spark QA Operator improved.',
        metricName: 'overall_score',
        metricValue: 0.8655,
        createdAt: '2026-05-09T16:20:00.000Z'
      }
    ],
    artifactRefs: [],
    specializations: [],
    inbox: { items: [] }
  };

  const report = renderRecursiveWorkspaceReport(snapshot, 'path:spark-qa-operator');
  assert.match(report, /⚪ Latest Spark QA Operator run held steady\./);
  assert.match(report, /Score\n• current run 0.8655\n• unchanged from previous run/);
  assert.doesNotMatch(report, /current best for this path/);
});

test('renders recursive artifact sync completion as a compact next step', () => {
  const reply = renderRecursiveArtifactSyncCompletion({
    synced: true,
    pathId: 'path_prompt_benchmark',
    outcomeId: 'outcome_prompt_benchmark_001',
    detail: 'Prompt benchmark synced through bridge.',
    workspaceUrl: 'http://127.0.0.1:4178/runs?tab=recursions'
  });

  assert.match(reply, /🟢 Recursive artifact sync finished\./);
  assert.match(reply, /Workspace\n• updated\n• http:\/\/127.0.0.1:4178\/runs\?tab=recursions/);
  assert.match(reply, /Report\n• \/recursive report path_prompt_benchmark\n• \/recursive trace path_prompt_benchmark/);
  assert.doesNotMatch(reply, /Next:/);
  assert.doesNotMatch(reply, /Workspace outcome/);
  assert.doesNotMatch(reply, /bridge/);
});

test('builds bridge args for non-Builder recursive artifact sync commands', () => {
  assert.deepEqual(
    buildRecursiveArtifactBridgeArgs(
      {
        kind: 'prompt-benchmark',
        args: ['C:\\runs\\prompt.json', 'report', 'C:\\runs\\report.md']
      },
      {
        payloadPath: 'C:\\tmp\\collective-sync.json',
        apiUrl: 'https://api.example.test',
        workspaceId: 'ws_123',
        accessToken: 'sscli_test'
      }
    ),
    [
      '-m',
      'spark_swarm_bridge.cli',
      'prompt-benchmark',
      '--input',
      'C:\\runs\\prompt.json',
      '--report-path',
      'C:\\runs\\report.md',
      '--payload',
      'C:\\tmp\\collective-sync.json',
      '--sync-collective',
      '--workspace-id',
      'ws_123',
      '--api-url',
      'https://api.example.test',
      '--access-token',
      'sscli_test'
    ]
  );

  assert.deepEqual(
    buildRecursiveArtifactBridgeArgs(
      {
        kind: 'domain-chip-lab',
        args: [
          'C:\\lab\\loop_telemetry.json',
          'workspace-smoke-loop',
          'chip-path',
          'C:\\lab\\domain-chip-workspace-smoke-loop',
          'packet',
          'C:\\lab\\packet.json'
        ]
      },
      { payloadPath: 'C:\\tmp\\collective-sync.json' }
    ),
    [
      '-m',
      'spark_swarm_bridge.cli',
      'domain-chip-lab-loop',
      '--telemetry',
      'C:\\lab\\loop_telemetry.json',
      '--chip-key',
      'workspace-smoke-loop',
      '--chip-path',
      'C:\\lab\\domain-chip-workspace-smoke-loop',
      '--packet',
      'C:\\lab\\packet.json',
      '--payload',
      'C:\\tmp\\collective-sync.json',
      '--sync-collective'
    ]
  );

  assert.deepEqual(
    buildRecursiveArtifactBridgeArgs(
      {
        kind: 'domain-autoloop',
        args: [
          'C:\\crypto\\manifest.json',
          'C:\\crypto\\state.json',
          'journal',
          'C:\\crypto\\cycle_journal.jsonl',
          'lane-report',
          'C:\\crypto\\learning_loop_report.json'
        ]
      },
      { payloadPath: 'C:\\tmp\\collective-sync.json' }
    ),
    [
      '-m',
      'spark_swarm_bridge.cli',
      'domain-autoloop',
      '--manifest',
      'C:\\crypto\\manifest.json',
      '--state',
      'C:\\crypto\\state.json',
      '--journal',
      'C:\\crypto\\cycle_journal.jsonl',
      '--lane-report',
      'C:\\crypto\\learning_loop_report.json',
      '--payload',
      'C:\\tmp\\collective-sync.json',
      '--sync-collective'
    ]
  );

  assert.throws(
    () => buildRecursiveArtifactBridgeArgs({ kind: 'domain-autoloop', args: ['C:\\crypto\\manifest.json'] }, { payloadPath: 'C:\\tmp\\collective-sync.json' }),
    /Usage: \/recursive sync domain-autoloop/
  );
});

test('resolves Spark Workspace config from Builder home fallback', () => {
  const envKeys = [
    'SPARK_SWARM_API_URL',
    'SPARK_SWARM_DEPLOYED_API_URL',
    'SPARK_SWARM_BACKEND_URL',
    'SPARK_SWARM_WORKSPACE_ID',
    'SPARK_SWARM_DEPLOYED_WORKSPACE_ID',
    'SPARK_SWARM_ACCESS_TOKEN',
    'SPARK_SWARM_DEPLOYED_ACCESS_TOKEN',
    'SPARK_SWARM_BEARER_TOKEN',
    'SPARK_BUILDER_HOME',
    'SPARK_BUILDER_ENV_FILE',
    'SPARK_BUILDER_REPO',
    'SPARK_SWARM_BRIDGE_SESSION_FILE'
  ];
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  const dir = mkdtempSync(path.join(tmpdir(), 'spark-telegram-recursive-'));
  try {
    for (const key of envKeys) delete process.env[key];
    process.env.SPARK_BUILDER_HOME = dir;
    writeFileSync(
      path.join(dir, '.env'),
      [
        'SPARK_SWARM_WORKSPACE_ID=ws_from_builder_env',
        'SPARK_SWARM_ACCESS_TOKEN="token_from_builder_env"'
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      path.join(dir, 'config.yaml'),
      [
        'spark:',
        '  swarm:',
        '    api_url: https://swarm.example.test',
        '    workspace_id: ws_from_builder_config'
      ].join('\n'),
      'utf-8'
    );

    assert.equal(sparkWorkspaceApiUrl(), 'https://swarm.example.test');
    assert.deepEqual(sparkWorkspaceBridgeHints(), {
      apiUrl: 'https://swarm.example.test',
      workspaceId: 'ws_from_builder_env',
      accessToken: 'token_from_builder_env'
    });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolves Spark Workspace access token from Builder repo fallback', () => {
  const envKeys = [
    'SPARK_SWARM_API_URL',
    'SPARK_SWARM_DEPLOYED_API_URL',
    'SPARK_SWARM_BACKEND_URL',
    'SPARK_SWARM_WORKSPACE_ID',
    'SPARK_SWARM_DEPLOYED_WORKSPACE_ID',
    'SPARK_SWARM_ACCESS_TOKEN',
    'SPARK_SWARM_DEPLOYED_ACCESS_TOKEN',
    'SPARK_SWARM_BEARER_TOKEN',
    'SPARK_BUILDER_HOME',
    'SPARK_BUILDER_ENV_FILE',
    'SPARK_BUILDER_REPO'
  ];
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  const homeDir = mkdtempSync(path.join(tmpdir(), 'spark-telegram-recursive-home-'));
  const repoDir = mkdtempSync(path.join(tmpdir(), 'spark-telegram-recursive-repo-'));
  try {
    for (const key of envKeys) delete process.env[key];
    process.env.SPARK_BUILDER_HOME = homeDir;
    process.env.SPARK_BUILDER_REPO = repoDir;
    writeFileSync(
      path.join(homeDir, 'config.yaml'),
      [
        'spark:',
        '  swarm:',
        '    api_url: https://swarm-live.example.test',
        '    workspace_id: ws_live_home',
        '    access_token_env: SPARK_SWARM_ACCESS_TOKEN'
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      path.join(repoDir, '.env'),
      'SPARK_SWARM_ACCESS_TOKEN=token_from_builder_repo\n',
      'utf-8'
    );

    assert.deepEqual(sparkWorkspaceBridgeHints(), {
      apiUrl: 'https://swarm-live.example.test',
      workspaceId: 'ws_live_home',
      accessToken: 'token_from_builder_repo'
    });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test('prefers matching refreshed bridge session token for Spark Workspace reads', () => {
  const envKeys = [
    'SPARK_SWARM_API_URL',
    'SPARK_SWARM_DEPLOYED_API_URL',
    'SPARK_SWARM_BACKEND_URL',
    'SPARK_SWARM_WORKSPACE_ID',
    'SPARK_SWARM_DEPLOYED_WORKSPACE_ID',
    'SPARK_SWARM_ACCESS_TOKEN',
    'SPARK_SWARM_DEPLOYED_ACCESS_TOKEN',
    'SPARK_SWARM_BEARER_TOKEN',
    'SPARK_BUILDER_HOME',
    'SPARK_BUILDER_ENV_FILE',
    'SPARK_BUILDER_REPO',
    'SPARK_SWARM_BRIDGE_SESSION_FILE'
  ];
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  const homeDir = mkdtempSync(path.join(tmpdir(), 'spark-telegram-recursive-home-'));
  const repoDir = mkdtempSync(path.join(tmpdir(), 'spark-telegram-recursive-repo-'));
  const sessionPath = path.join(homeDir, 'bridge-session.json');
  try {
    for (const key of envKeys) delete process.env[key];
    process.env.SPARK_BUILDER_HOME = homeDir;
    process.env.SPARK_BUILDER_REPO = repoDir;
    process.env.SPARK_SWARM_BRIDGE_SESSION_FILE = sessionPath;
    writeFileSync(
      path.join(homeDir, 'config.yaml'),
      [
        'spark:',
        '  swarm:',
        '    api_url: https://swarm-live.example.test',
        '    workspace_id: ws_live_home'
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(path.join(repoDir, '.env'), 'SPARK_SWARM_ACCESS_TOKEN=stale_builder_token\n', 'utf-8');
    writeFileSync(
      sessionPath,
      JSON.stringify({
        api_url: 'https://swarm-live.example.test/',
        workspace_id: 'ws_live_home',
        access_token: 'fresh_bridge_token'
      }),
      'utf-8'
    );

    assert.deepEqual(sparkWorkspaceBridgeHints(), {
      apiUrl: 'https://swarm-live.example.test',
      workspaceId: 'ws_live_home',
      accessToken: 'fresh_bridge_token'
    });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test('prefers durable bridge CLI token over browser token residue for Spark Workspace reads', () => {
  const envKeys = [
    'SPARK_SWARM_API_URL',
    'SPARK_SWARM_DEPLOYED_API_URL',
    'SPARK_SWARM_BACKEND_URL',
    'SPARK_SWARM_WORKSPACE_ID',
    'SPARK_SWARM_DEPLOYED_WORKSPACE_ID',
    'SPARK_SWARM_ACCESS_TOKEN',
    'SPARK_SWARM_DEPLOYED_ACCESS_TOKEN',
    'SPARK_SWARM_BEARER_TOKEN',
    'SPARK_BUILDER_HOME',
    'SPARK_BUILDER_ENV_FILE',
    'SPARK_BUILDER_REPO',
    'SPARK_SWARM_BRIDGE_SESSION_FILE'
  ];
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  const homeDir = mkdtempSync(path.join(tmpdir(), 'spark-telegram-recursive-home-'));
  const repoDir = mkdtempSync(path.join(tmpdir(), 'spark-telegram-recursive-repo-'));
  const sessionPath = path.join(homeDir, 'bridge-session.json');
  try {
    for (const key of envKeys) delete process.env[key];
    process.env.SPARK_BUILDER_HOME = homeDir;
    process.env.SPARK_BUILDER_REPO = repoDir;
    process.env.SPARK_SWARM_BRIDGE_SESSION_FILE = sessionPath;
    writeFileSync(
      path.join(homeDir, 'config.yaml'),
      [
        'spark:',
        '  swarm:',
        '    api_url: https://swarm-live.example.test',
        '    workspace_id: ws_live_home'
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(path.join(repoDir, '.env'), 'SPARK_SWARM_ACCESS_TOKEN=stale_builder_token\n', 'utf-8');
    writeFileSync(
      sessionPath,
      JSON.stringify({
        api_url: 'https://swarm-live.example.test/',
        workspace_id: 'ws_live_home',
        access_token: 'old_browser_access_token',
        refresh_token: 'old_browser_refresh_token',
        expires_at: 1778171271,
        cli_token: 'sscli_workspace_agent_token'
      }),
      'utf-8'
    );

    assert.deepEqual(sparkWorkspaceBridgeHints(), {
      apiUrl: 'https://swarm-live.example.test',
      workspaceId: 'ws_live_home',
      accessToken: 'sscli_workspace_agent_token'
    });
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  }
});

test('renders Builder chip loop completion with Workspace sync details', () => {
  const reply = renderBuilderChipLoopCompletion(
    {
      ok: true,
      chipKey: 'startup-yc',
      roundsCompleted: 2,
      totalRounds: 2,
      statusPath: 'C:\\status\\startup-yc.json',
      history: [
        { round_index: 2, suggestions_count: 4, best_verdict: 'improved', best_metric: 0.81234 }
      ]
    },
    {
      synced: true,
      pathId: 'path_builder_chip_startup_yc',
      outcomeId: 'outcome_builder_chip_startup_yc_20260507T100000000',
      detail: 'Builder chip loop synced through Spark Swarm bridge.',
      workspaceUrl: 'http://127.0.0.1:4178/runs?tab=recursions'
    }
  );

  assert.match(reply, /🟢 Startup YC finished 2\/2 rounds and improved\./);
  assert.match(reply, /Spark drafted a possible improvement for this private workflow helper\. It has not been used, approved, or shared\./);
  assert.match(reply, /real self-improvement still needs a separate review on a multi-round trend/);
  assert.match(reply, /Workspace is updated: http:\/\/127.0.0.1:4178\/runs\?tab=recursions/);
  assert.match(reply, /To open the private draft, send:\n\/recursive report latest/);
  assert.match(reply, /This only opens the private draft\./);
  assert.match(reply, /ignore it, ask for changes, or ask me to run another review/);
  assert.doesNotMatch(reply, /^Score$/m);
  assert.doesNotMatch(reply, /^Workspace$/m);
  assert.doesNotMatch(reply, /^Report$/m);
  assert.doesNotMatch(reply, /path_builder_chip_startup_yc/);
  assert.doesNotMatch(reply, /C:\\status/);
  assert.doesNotMatch(reply, /Workspace outcome/);
});

test('renders regressed Builder chip loop completion without softening the verdict', () => {
  const reply = renderBuilderChipLoopCompletion({
    ok: true,
    chipKey: 'startup-yc',
    roundsCompleted: 1,
    totalRounds: 1,
    history: [
      { round_index: 1, suggestions_count: 2, best_verdict: 'regressed', best_metric: 0.4123 }
    ]
  });

  assert.match(reply, /🔴 Startup YC finished 1\/1 round and regressed\./);
  assert.match(reply, /Spark drafted a possible improvement for this private workflow helper\. It has not been used, approved, or shared\./);
  assert.match(reply, /Treat this as a rollback signal until separated judges explain what broke\./);
  assert.match(reply, /Saved locally and kept private\./);
  assert.doesNotMatch(reply, /^Score$/m);
  assert.doesNotMatch(reply, /^Local$/m);
  assert.doesNotMatch(reply, /^Report$/m);
  assert.doesNotMatch(reply, /Change:/);
  assert.doesNotMatch(reply, /The best result regressed\./);
});

test('renders deferred Builder chip loop completion as readable English', () => {
  const reply = renderBuilderChipLoopCompletion({
    ok: true,
    chipKey: 'b2c-reachout',
    roundsCompleted: 1,
    totalRounds: 1,
    history: [
      { round_index: 1, suggestions_count: 3, best_verdict: 'defer', best_metric: 54 }
    ]
  });

  assert.match(reply, /I finished checking B2C Reachout\./);
  assert.match(reply, /Spark drafted a possible improvement for this private workflow helper\. It has not been used, approved, or shared\./);
  assert.match(reply, /I kept it private and made no changes\./);
  assert.match(reply, /To open the private draft, send:\n\/recursive report latest/);
  assert.match(reply, /This only opens the private draft\./);
  assert.match(reply, /ignore it, ask for changes, or ask me to run another review/);
  assert.doesNotMatch(reply, /and defer\./);
});

test('renders recent Workspace trace movement with distinct run labels', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path:spark-qa-operator',
        scope: 'workspace',
        specializationId: 'spark-qa-operator',
        repoLabel: 'spark-qa-operator',
        summary: 'Spark QA Operator validates Telegram and Workspace flows.',
        status: 'open',
        bestOutcomeId: 'outcome:spark-qa-operator:round:20260509T081339811029Z',
        updatedAt: '2026-05-09T08:13:39.811Z'
      }
    ],
    insights: [],
    masteries: [],
    outcomes: [
      {
        id: 'outcome:spark-qa-operator:round:20260509T081339811029Z',
        targetType: 'evolution_path',
        targetId: 'path:spark-qa-operator',
        verdict: 'improved',
        summary: 'Candidate kept benchmark-backed QA mutation.',
        metricName: 'overall_score',
        metricValue: 0.8538,
        createdAt: '2026-05-09T08:13:39.811Z'
      },
      {
        id: 'outcome:spark-qa-operator:round:20260509T070000000000Z',
        targetType: 'evolution_path',
        targetId: 'path:spark-qa-operator',
        verdict: 'flat',
        summary: 'Previous QA Operator run held steady.',
        metricName: 'overall_score',
        metricValue: 0.834,
        createdAt: '2026-05-09T07:00:00.000Z'
      },
      {
        id: 'outcome:spark-qa-operator:round:20260509T060000000000Z',
        targetType: 'evolution_path',
        targetId: 'path:spark-qa-operator',
        verdict: 'flat',
        summary: 'Previous QA Operator run held steady.',
        metricName: 'overall_score',
        metricValue: 0.834,
        createdAt: '2026-05-09T06:00:00.000Z'
      }
    ],
    artifactRefs: [
      {
        id: 'artifact:spark-qa-operator:candidate-trace',
        kind: 'run_trace',
        label: 'Spark QA Operator candidate trace',
        path: 'C:\\runs\\spark-qa-operator\\candidate-trace.json',
        url: null
      }
    ],
    specializations: [],
    inbox: { items: [] }
  };

  const reply = renderRecursiveTraceView(workspaceTraceView(snapshot, 'path:spark-qa-operator'));
  assert.match(reply, /latest run improved/);
  assert.match(reply, /previous run held steady/);
  assert.match(reply, /2 runs back held steady/);
  assert.doesNotMatch(reply, /overall score/);
  assert.equal((reply.match(/previous round held steady/g) || []).length, 0);
  assert.doesNotMatch(reply, /candidate trace saved/);

  const report = renderRecursiveWorkspaceReport(snapshot, 'path:spark-qa-operator');
  assert.match(report, /Score\n• current run 0\.8538\n• improved from 0\.834/);
  assert.doesNotMatch(report, /current best for this path/);
  assert.doesNotMatch(report, /saved item/);
});

test('dedupes identical rendered trace rows', () => {
  const reply = renderRecursiveTraceView({
    session_id: 'path:test-loop',
    title: 'Test Loop',
    status: 'open',
    source_kind: 'spark_workspace_evolution_path',
    spawner: {
      board_entry: { status: 'open', taskCount: 2 },
      canvas_queue: {
        pipelineId: 'spark-workspace-recursions',
        pending: false,
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
      { kind: 'artifact', title: 'Candidate trace', status: 'run_trace', summary: 'trace' },
      { kind: 'artifact', title: 'Candidate trace', status: 'run_trace', summary: 'trace copy' }
    ]
  });

  assert.equal((reply.match(/candidate trace saved/g) || []).length, 1);
});

test('maps workspace-scoped Builder chip loops into Telegram recursive sessions', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path_builder_chip_startup_yc',
        scope: 'workspace',
        specializationId: null,
        repoLabel: 'spark-intelligence-builder',
        summary: 'Builder chip loop for Startup Yc completed 3/3 rounds.',
        status: 'open',
        bestOutcomeId: 'outcome_builder_chip_startup_yc_20260507T100000000',
        updatedAt: '2026-05-07T10:00:00.000Z'
      }
    ],
    insights: [],
    masteries: [],
    outcomes: [
      {
        id: 'outcome_builder_chip_startup_yc_20260507T100000000',
        targetType: 'evolution_path',
        targetId: 'path_builder_chip_startup_yc',
        verdict: 'improved',
        summary: 'Startup Yc final round improved.',
        metricName: 'builder_chip_loop_best_metric',
        metricValue: 0.72,
        context: {
          scorecard: {
            headlineLabel: 'Best metric',
            headlineValue: 0.72,
            headlineGoal: 'higher',
            modelLabel: 'Startup Yc',
            components: [
              { key: 'best_metric', label: 'Best metric', value: 0.72, goal: 'higher' }
            ],
            details: [
              { key: 'rounds', label: 'Rounds', value: '3/3' },
              { key: 'suggestions', label: 'Final suggestions', value: '2' }
            ]
          }
        },
        createdAt: '2026-05-07T10:00:00.000Z'
      }
    ],
    artifactRefs: [
      {
        id: 'artifact_builder_chip_startup_yc_20260507T100000000',
        kind: 'run_trace',
        label: 'Startup YC chip-loop status',
        path: 'C:\\status\\startup-yc.json',
        url: null
      }
    ],
    specializations: [],
    inbox: { items: [] }
  };

  const sessions = workspaceSessions(snapshot);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].session_id, 'path_builder_chip_startup_yc');
  assert.equal(sessions[0].domain, 'spark-intelligence-builder');
  assert.equal(sessions[0].kanban_bucket, 'active');
  assert.equal(sessions[0].review_required, false);
  assert.match(renderRecursiveSessions(sessions), /Startup YC/);
  assert.doesNotMatch(renderRecursiveSessions(sessions), /1\. Startup YC/);
  assert.doesNotMatch(renderRecursiveSessions(sessions), /May 8/);
  assert.doesNotMatch(renderRecursiveSessions(sessions), /Startup Yc/);

  const report = renderRecursiveWorkspaceReport(snapshot, 'path_builder_chip_startup_yc');
  assert.match(report, /🟢 Latest Spark Intelligence Builder run improved\./);
  assert.match(report, /Score\n• builder chip loop best metric 0.72\n• current best for this path/);
  assert.doesNotMatch(report, /Startup Yc/);
  assert.match(report, /Workspace\n• http:\/\/127.0.0.1:4178\/runs\?tab=recursions/);
  assert.doesNotMatch(report, /saved item/);
  assert.doesNotMatch(report, /Scorecard:/);
  assert.doesNotMatch(report, /Mastery:/);
  assert.doesNotMatch(report, /Signal/);
  assert.doesNotMatch(report, /Next:/);
  assert.doesNotMatch(report, /recursive trace path_builder_chip_startup_yc/);
  assert.equal(renderRecursiveWorkspaceReport(snapshot, 'startup-yc'), report);

  const trace = workspaceTraceView(snapshot, 'path_builder_chip_startup_yc');
  assert.equal(trace.spawner.board_entry.taskCount, 2);
  assert.equal(trace.timeline[0].kind, 'outcome');
  assert.equal(trace.timeline[0].status, 'improved');
  assert.equal(trace.timeline[0].summary, 'Startup Yc final round improved. builder chip loop best metric 0.72');
  assert.equal(trace.timeline.some((item) => item.kind === 'artifact'), false);
});

test('compares latest Workspace outcome against the current best metric', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path:startup-yc',
        scope: 'specialization_path',
        specializationId: 'spec_startup_yc',
        repoLabel: 'specialization-path-startup-yc',
        summary: 'Improve Startup YC on Startup Bench.',
        status: 'open',
        bestOutcomeId: 'outcome_best',
        updatedAt: '2026-05-08T06:02:50.000Z'
      }
    ],
    insights: [],
    masteries: [],
    outcomes: [
      {
        id: 'outcome_best',
        targetType: 'evolution_path',
        targetId: 'path:startup-yc',
        verdict: 'improved',
        summary: 'Startup YC improved an earlier round.',
        metricName: 'scenario_score',
        metricValue: 0.7,
        context: {
          scorecard: {
            headlineGoal: 'higher'
          }
        },
        createdAt: '2026-05-08T05:00:00.000Z'
      },
      {
        id: 'outcome_latest',
        targetType: 'evolution_path',
        targetId: 'path:startup-yc',
        verdict: 'flat',
        summary: 'Startup YC tested the benchmark but did not beat the current score.',
        metricName: 'scenario_score',
        metricValue: 0.6313,
        context: {
          scorecard: {
            headlineGoal: 'higher'
          }
        },
        createdAt: '2026-05-08T06:02:50.000Z'
      }
    ],
    artifactRefs: [],
    specializations: [
      {
        id: 'spec_startup_yc',
        key: 'startup-yc',
        label: 'Startup YC',
        lane: 'public',
        status: 'active'
      }
    ],
    inbox: { items: [] }
  };

  const report = renderRecursiveWorkspaceReport(snapshot, 'path:startup-yc');
  assert.match(report, /⚪ Latest Startup YC run held steady\./);
  assert.match(report, /Score\n• scenario score 0.6313\n• below current best by 0.0687 \(best 0.7\)/);
});

test('describes rounded same-score improvements without contradiction', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path:startup-yc',
        scope: 'specialization_path',
        specializationId: 'spec_startup_yc',
        repoLabel: 'specialization-path-startup-yc',
        summary: 'Improve Startup YC on Startup Bench.',
        status: 'open',
        bestOutcomeId: 'outcome_latest',
        updatedAt: '2026-05-08T13:46:50.000Z'
      }
    ],
    insights: [
      {
        id: 'insight_startup_yc_round',
        specializationId: 'spec_startup_yc',
        summary: 'Startup YC kept a benchmark-backed YC mutation on benchmarks/startup-yc.tool_calls.json, improving scenario_score from 0.6453 to 0.6453.',
        status: 'observed',
        updatedAt: '2026-05-08T13:46:50.000Z'
      }
    ],
    masteries: [],
    outcomes: [
      {
        id: 'outcome_latest',
        targetType: 'evolution_path',
        targetId: 'path:startup-yc',
        verdict: 'improved',
        summary: 'Startup YC improved from 0.6453 to 0.6453 on benchmarks/startup-yc.tool_calls.json via YC doctrine injection.',
        metricName: 'scenario_score',
        metricValue: 0.6453,
        context: {
          scorecard: {
            headlineGoal: 'higher'
          }
        },
        createdAt: '2026-05-08T13:46:50.000Z'
      }
    ],
    artifactRefs: [],
    specializations: [
      {
        id: 'spec_startup_yc',
        key: 'startup-yc',
        label: 'Startup YC',
        lane: 'public',
        status: 'active'
      }
    ],
    inbox: { items: [] }
  };

  const report = renderRecursiveWorkspaceReport(snapshot, 'path:startup-yc');
  assert.match(report, /🟢 Latest Startup YC run improved slightly\./);
  assert.match(report, /Latest Startup YC run improved slightly\.\n\nScore/);
  assert.match(report, /Score\n• scenario score 0.6453\n• current best for this path/);
  assert.match(report, /current best for this path\n\nWorkspace/);
  assert.doesNotMatch(report, /displayed decimals/);
  assert.doesNotMatch(report, /Signal/);
  assert.doesNotMatch(report, /What happened:/);
  assert.doesNotMatch(report, /improved from 0\.6453 to 0\.6453/);
  assert.doesNotMatch(report, /improving scenario_score from 0\.6453 to 0\.6453/);
});

test('keeps verbose Workspace signals out of compact Telegram reports', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path:startup-yc',
        scope: 'specialization_path',
        specializationId: 'spec_startup_yc',
        repoLabel: 'specialization-path-startup-yc',
        summary: 'Improve Startup YC on Startup Bench.',
        status: 'open',
        bestOutcomeId: 'outcome_latest',
        updatedAt: '2026-05-08T06:02:50.000Z'
      }
    ],
    insights: [
      {
        id: 'insight_startup_yc_signal',
        specializationId: 'spec_startup_yc',
        summary: 'Startup YC emitted a smoke benchmark signal on zero_to_one_design_partner_001 at 62.2%. Validation across the current lane held on 7/7 scenarios with 66.5% mean score, led by risk management while team health remains the next frontier.',
        status: 'observed',
        updatedAt: '2026-05-08T06:02:50.000Z'
      }
    ],
    masteries: [],
    outcomes: [
      {
        id: 'outcome_latest',
        targetType: 'evolution_path',
        targetId: 'path:startup-yc',
        verdict: 'flat',
        summary: 'Startup YC tested the benchmark but did not beat the current score.',
        metricName: 'scenario_score',
        metricValue: 0.6313,
        createdAt: '2026-05-08T06:02:50.000Z'
      }
    ],
    artifactRefs: [],
    specializations: [
      {
        id: 'spec_startup_yc',
        key: 'startup-yc',
        label: 'Startup YC',
        lane: 'public',
        status: 'active'
      }
    ],
    inbox: { items: [] }
  };

  const report = renderRecursiveWorkspaceReport(snapshot, 'path:startup-yc');
  assert.doesNotMatch(report, /Signal/);
  assert.doesNotMatch(report, /Startup YC emitted a smoke benchmark signal/);
  assert.doesNotMatch(report, /team health remains th\.\.\./);
  assert.doesNotMatch(report, /Validation across the current lane/);
});

test('renders Workspace mastery as a readable signal with evidence counts', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path:startup-yc',
        scope: 'specialization_path',
        specializationId: 'spec_startup_yc',
        repoLabel: 'specialization-path-startup-yc',
        summary: 'Improve Startup YC on Startup Bench.',
        status: 'open',
        bestOutcomeId: 'outcome_latest',
        updatedAt: '2026-05-08T06:02:50.000Z'
      }
    ],
    insights: [],
    masteries: [
      {
        id: 'mastery_startup_yc_research',
        specializationScope: 'startup-yc',
        summary: 'research benchmark-backed mastery candidate',
        benchmarkStrength: 0.82,
        liveStrength: 0.64,
        supportCount: 12,
        contradictionCount: 1
      }
    ],
    outcomes: [
      {
        id: 'outcome_latest',
        targetType: 'evolution_path',
        targetId: 'path:startup-yc',
        verdict: 'flat',
        summary: 'Startup YC tested the benchmark but did not beat the current score.',
        metricName: 'scenario_score',
        metricValue: 0.6313,
        createdAt: '2026-05-08T06:02:50.000Z'
      }
    ],
    artifactRefs: [],
    specializations: [
      {
        id: 'spec_startup_yc',
        key: 'startup-yc',
        label: 'Startup YC',
        lane: 'public',
        status: 'active'
      }
    ],
    inbox: { items: [] }
  };

  const report = renderRecursiveWorkspaceReport(snapshot, 'path:startup-yc');
  assert.doesNotMatch(report, /Mastery:/);
  assert.match(report, /Workspace\n• http:\/\/127.0.0.1:4178\/runs\?tab=recursions/);
  assert.doesNotMatch(report, /Strongest mastery/);
  assert.doesNotMatch(report, /mastery candidate/);
});

test('uses lower-is-better goals when comparing Workspace outcomes', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path:error-rate',
        scope: 'workspace',
        specializationId: null,
        repoLabel: 'error-rate',
        summary: 'Reduce error rate.',
        status: 'open',
        bestOutcomeId: 'outcome_best',
        updatedAt: '2026-05-08T06:10:00.000Z'
      }
    ],
    insights: [],
    masteries: [],
    outcomes: [
      {
        id: 'outcome_best',
        targetType: 'evolution_path',
        targetId: 'path:error-rate',
        verdict: 'improved',
        summary: 'Earlier run reduced errors.',
        metricName: 'error_rate',
        metricValue: 0.08,
        context: {
          scorecard: {
            headlineGoal: 'lower'
          }
        },
        createdAt: '2026-05-08T05:00:00.000Z'
      },
      {
        id: 'outcome_latest',
        targetType: 'evolution_path',
        targetId: 'path:error-rate',
        verdict: 'regressed',
        summary: 'Latest run increased errors.',
        metricName: 'error_rate',
        metricValue: 0.12,
        context: {
          scorecard: {
            headlineGoal: 'lower'
          }
        },
        createdAt: '2026-05-08T06:10:00.000Z'
      }
    ],
    artifactRefs: [],
    specializations: [],
    inbox: { items: [] }
  };

  const report = renderRecursiveWorkspaceReport(snapshot, 'path:error-rate');
  assert.match(report, /🔴 Latest Error Rate run regressed\./);
  assert.match(report, /Score\n• error rate 0.12\n• regressed from 0.08/);
});

test('summarizes large Workspace evidence sets with clean highlights', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path_builder_chip_startup_yc',
        scope: 'workspace',
        specializationId: null,
        repoLabel: 'spark-intelligence-builder',
        summary: 'Builder chip loop for Startup YC completed 1/1 round.',
        status: 'open',
        bestOutcomeId: 'outcome_builder_chip_startup_yc_20260508T060000000',
        updatedAt: '2026-05-08T06:00:00.000Z'
      }
    ],
    insights: [],
    masteries: [],
    outcomes: [
      {
        id: 'outcome_builder_chip_startup_yc_20260508T060000000',
        targetType: 'evolution_path',
        targetId: 'path_builder_chip_startup_yc',
        verdict: 'flat',
        summary: 'Startup YC held the current score.',
        metricName: 'builder_chip_loop_best_metric',
        metricValue: 0.6313,
        createdAt: '2026-05-08T06:00:00.000Z'
      }
    ],
    artifactRefs: [
      {
        id: 'artifact_builder_chip_startup_yc_run_dir',
        kind: 'run_trace',
        label: 'Run directory',
        path: 'C:\\runs\\startup-yc',
        url: null
      },
      {
        id: 'artifact_builder_chip_startup_yc_run_log',
        kind: 'run_trace',
        label: 'Run log',
        path: 'C:\\runs\\startup-yc\\run.log',
        url: null
      },
      {
        id: 'artifact_builder_chip_startup_yc_trace',
        kind: 'run_trace',
        label: 'Trace file',
        path: 'C:\\runs\\startup-yc\\trace.jsonl',
        url: null
      },
      {
        id: 'artifact_builder_chip_startup_yc_summary',
        kind: 'summary',
        label: 'Session summary',
        path: 'C:\\runs\\startup-yc\\summary.json',
        url: null
      }
    ],
    specializations: [],
    inbox: { items: [] }
  };

  const report = renderRecursiveWorkspaceReport(snapshot, 'path_builder_chip_startup_yc');
  assert.match(report, /Workspace\n• http:\/\/127.0.0.1:4178\/runs\?tab=recursions/);
  assert.doesNotMatch(report, /saved item/);
  assert.doesNotMatch(report, /run_trace:Run directory/);
  assert.doesNotMatch(report, /Session summary/);
});

test('reports non-Builder Workspace loop artifacts without leaking unrelated refs', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path_benchmark_prompt_engineer_20260508t030923z_65b30a0f',
        scope: 'workspace',
        specializationId: null,
        repoLabel: 'benchmark-prompt-engineer',
        summary: 'Prompt Engineer Benchmark completed 1 benchmark run(s).',
        status: 'open',
        bestOutcomeId: 'outcome_benchmark_prompt_engineer_20260508t030923z_65b30a0f_20260508T031000000',
        updatedAt: '2026-05-08T03:10:00.000Z'
      },
      {
        id: 'path_domain_autoloop_crypto_trading',
        scope: 'workspace',
        specializationId: null,
        repoLabel: 'domain-autoloop',
        summary: 'Crypto trading autoloop cycle state synced.',
        status: 'open',
        bestOutcomeId: 'outcome_domain_autoloop_crypto_trading_20260508T025000000',
        updatedAt: '2026-05-08T02:50:00.000Z'
      },
      {
        id: 'path_domain_chip_lab_workspace_smoke_loop',
        scope: 'workspace',
        specializationId: null,
        repoLabel: 'domain-chip-lab',
        summary: 'Domain chip lab Workspace Smoke Loop reached target.',
        status: 'open',
        bestOutcomeId: 'outcome_domain_chip_lab_workspace_smoke_loop_20260508T031200000',
        updatedAt: '2026-05-08T03:12:00.000Z'
      }
    ],
    insights: [],
    masteries: [],
    outcomes: [
      {
        id: 'outcome_benchmark_prompt_engineer_20260508t030923z_65b30a0f_20260508T031000000',
        targetType: 'evolution_path',
        targetId: 'path_benchmark_prompt_engineer_20260508t030923z_65b30a0f',
        verdict: 'improved',
        summary: 'Prompt Engineer Benchmark average composite score: 2.1.',
        metricName: 'average_composite_score',
        metricValue: 2.1,
        createdAt: '2026-05-08T03:10:00.000Z'
      },
      {
        id: 'outcome_domain_autoloop_crypto_trading_20260508T025000000',
        targetType: 'evolution_path',
        targetId: 'path_domain_autoloop_crypto_trading',
        verdict: 'flat',
        summary: 'Domain autoloop state synced for crypto trading.',
        metricName: 'autoloop_cycle_count',
        metricValue: 4,
        createdAt: '2026-05-08T02:50:00.000Z'
      },
      {
        id: 'outcome_domain_chip_lab_workspace_smoke_loop_20260508T031200000',
        targetType: 'evolution_path',
        targetId: 'path_domain_chip_lab_workspace_smoke_loop',
        verdict: 'improved',
        summary: 'Domain chip lab final score reached 100.',
        metricName: 'domain_chip_quality_score',
        metricValue: 100,
        createdAt: '2026-05-08T03:12:00.000Z'
      }
    ],
    artifactRefs: [
      {
        id: 'artifact_prompt_benchmark_run_20260508t030923z_65b30a0f_20260508T031000000',
        kind: 'benchmark_run',
        label: 'Prompt benchmark run JSON',
        path: 'artifacts/prompt-benchmark-hosted-smoke/prompt-run-output.json',
        url: null
      },
      {
        id: 'artifact_prompt_benchmark_run_20260508t030923z_65b30a0f_20260508T034341361',
        kind: 'benchmark_run',
        label: 'Prompt benchmark run JSON',
        path: 'artifacts/prompt-benchmark-hosted-smoke/prompt-run-output.json',
        url: null
      },
      {
        id: 'artifact_domain_autoloop_manifest_crypto_trading_20260508T025000000',
        kind: 'manifest',
        label: 'Domain autoloop manifest',
        path: 'docs/recursion/autoloop-manifest.json',
        url: null
      },
      {
        id: 'artifact_domain_chip_lab_telemetry_workspace_smoke_loop_20260508T031200000',
        kind: 'loop_telemetry',
        label: 'Domain chip lab telemetry',
        path: 'artifacts/domain-chip-lab-hosted-smoke/domain-chip-workspace-smoke-loop/loop_telemetry.json',
        url: null
      },
      {
        id: 'artifact_unrelated_builder_chip_startup_yc_20260507T100000000',
        kind: 'run_trace',
        label: 'Startup YC chip-loop status',
        path: 'C:\\status\\startup-yc.json',
        url: null
      }
    ],
    specializations: [],
    inbox: { items: [] }
  };

  const benchmarkReport = renderRecursiveWorkspaceReport(snapshot, 'path_benchmark_prompt_engineer_20260508t030923z_65b30a0f');
  assert.match(benchmarkReport, /Score\n• average composite score 2.1/);
  assert.match(benchmarkReport, /Workspace\n• http:\/\/127.0.0.1:4178\/runs\?tab=recursions/);
  assert.doesNotMatch(benchmarkReport, /saved item/);
  assert.doesNotMatch(benchmarkReport, /Domain autoloop manifest/);
  assert.doesNotMatch(benchmarkReport, /Startup YC chip-loop status/);

  const autoloopReport = renderRecursiveWorkspaceReport(snapshot, 'path_domain_autoloop_crypto_trading');
  assert.match(autoloopReport, /Score\n• autoloop cycle count 4/);
  assert.match(autoloopReport, /Workspace\n• http:\/\/127.0.0.1:4178\/runs\?tab=recursions/);
  assert.doesNotMatch(autoloopReport, /saved item/);
  assert.doesNotMatch(autoloopReport, /Prompt benchmark run JSON/);

  const labTrace = workspaceTraceView(snapshot, 'path_domain_chip_lab_workspace_smoke_loop');
  assert.equal(labTrace.timeline.filter((item) => item.kind === 'artifact').length, 0);
});

test('uses path summary in Workspace report when snapshot omits outcome bodies', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path_builder_chip_startup_yc',
        scope: 'workspace',
        specializationId: null,
        repoLabel: 'spark-intelligence-builder',
        summary: 'Builder chip loop for Startup YC completed 1/1 round.',
        status: 'open',
        bestOutcomeId: 'outcome_builder_chip_startup_yc_20260507T151032889',
        updatedAt: '2026-05-07T15:10:32.889Z'
      }
    ],
    insights: [],
    masteries: [],
    outcomes: [],
    artifactRefs: [],
    specializations: [],
    inbox: { items: [] }
  };

  const report = renderRecursiveWorkspaceReport(snapshot, 'path_builder_chip_startup_yc');
  assert.match(report, /⚪ Spark Intelligence Builder was recorded\./);
  assert.doesNotMatch(report, /Signal/);

  const trace = workspaceTraceView(snapshot, 'path_builder_chip_startup_yc');
  assert.equal(trace.timeline[0].kind, 'outcome');
  assert.equal(trace.timeline[0].title, 'outcome_builder_chip_startup_yc_20260507T151032889');
  assert.equal(trace.timeline[0].status, 'recorded');
});

test('maps Workspace decision inbox items into Telegram review surfaces', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path_builder_chip_startup_yc',
        scope: 'workspace',
        specializationId: null,
        repoLabel: 'spark-intelligence-builder',
        summary: 'Builder chip loop needs review.',
        status: 'open',
        bestOutcomeId: null,
        updatedAt: '2026-05-07T10:00:00.000Z'
      }
    ],
    insights: [],
    masteries: [],
    outcomes: [],
    artifactRefs: [],
    specializations: [],
    inbox: {
      items: [
        {
          id: 'inbox_review_builder_chip',
          kind: 'review_outcome',
          title: 'Review Builder chip outcome',
          summary: 'Outcome needs dashboard action.',
          targetType: 'evolution_path',
          targetId: 'path_builder_chip_startup_yc',
          specializationId: null,
          repoId: null,
          priority: 'medium',
          recommendedAction: 'Open Recursions and inspect the run trace.'
        }
      ]
    }
  };

  const candidates = workspaceReviewCandidates(snapshot);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].session_id, 'path_builder_chip_startup_yc');
  assert.equal(candidates[0].domain, 'evolution_path');
  assert.equal(candidates[0].risk, 'medium');

  const sessions = workspaceSessions(snapshot);
  assert.equal(sessions[0].review_required, true);

  const report = renderRecursiveWorkspaceReport(snapshot, 'path_builder_chip_startup_yc');
  assert.match(report, /Review\n• 1 decision waiting\n• http:\/\/127.0.0.1:4178\/runs\?tab=decisions/);
  assert.match(report, /Workspace\n• http:\/\/127.0.0.1:4178\/runs\?tab=recursions/);
  assert.doesNotMatch(report, /Action:/);
  assert.doesNotMatch(report, /Next:/);
  assert.doesNotMatch(report, /After review:/);

  const review = renderRecursiveWorkspaceReview(snapshot, 'path_builder_chip_startup_yc');
  assert.match(review, /Spark Intelligence Builder review/);
  assert.match(review, /Review\n• 1 decision waiting\n• blocker: Review Builder chip outcome/);
  assert.match(review, /Sharing\n• private workspace\n• not submitted/);
  assert.match(review, /Why\n• Outcome needs dashboard action\./);
  assert.match(review, /Move\n• Open Recursions and inspect the run trace\./);
  assert.match(review, /Workspace\n• http:\/\/127.0.0.1:4178\/runs\?tab=decisions/);
  assert.doesNotMatch(review, /\/recursive trace path_builder_chip_startup_yc/);
  assert.doesNotMatch(review, /Next:/);
  assert.doesNotMatch(review, /review_outcome/);
});

test('renders supported Workspace review items with Telegram actions', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path:startup-yc',
        scope: 'workspace',
        specializationId: 'spec_startup_yc',
        repoLabel: 'specialization-path-startup-yc',
        summary: 'Startup YC path needs review.',
        status: 'open',
        bestOutcomeId: null,
        updatedAt: '2026-05-08T06:02:50.083434+00:00'
      }
    ],
    insights: [],
    masteries: [],
    outcomes: [],
    artifactRefs: [],
    specializations: [
      { id: 'spec_startup_yc', key: 'startup-yc', label: 'Startup YC' }
    ],
    inbox: {
      items: [
        {
          id: 'inbox_low_absorb',
          kind: 'absorb',
          title: 'Absorb risk-management insight',
          summary: 'Candidate insight is useful but lower urgency.',
          targetType: 'insight',
          targetId: 'insight_startup_yc_risk',
          specializationId: 'spec_startup_yc',
          repoId: null,
          priority: 'low',
          recommendedAction: 'Absorb after checking source evidence.'
        },
        {
          id: 'inbox_high_mastery',
          kind: 'review_mastery',
          title: 'Review team-health mastery',
          summary: 'Mastery candidate affects Startup YC team-health scoring.',
          targetType: 'mastery',
          targetId: 'mastery_startup_yc_team_health',
          specializationId: 'spec_startup_yc',
          repoId: null,
          priority: 'high',
          recommendedAction: 'Approve only if the latest benchmark evidence holds.'
        }
      ]
    }
  };

  const review = renderRecursiveWorkspaceReview(snapshot, 'path:startup-yc');
  assert.match(review, /Startup YC review/);
  assert.match(review, /Review\n• 2 decisions waiting\n• blocker: Review team-health mastery/);
  assert.match(review, /Actions/);
  assert.match(review, /1\. Approve: \/recursive approve inbox_high_mastery evidence is strong enough/);
  assert.match(review, /2\. More eval: \/recursive more-eval inbox_high_mastery needs another benchmark pass/);
  assert.match(review, /3\. Defer: \/recursive defer inbox_high_mastery hold for later/);
  assert.match(review, /4\. Reject: \/recursive reject inbox_high_mastery evidence is not strong enough/);
  assert.doesNotMatch(review, /Absorb risk-management insight/);
  assert.doesNotMatch(review, /review_mastery/);
});

test('groups repeated dashboard-only Workspace review blockers', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path:startup-yc',
        scope: 'specialization',
        specializationId: 'spec_startup_yc',
        repoLabel: 'specialization-path-startup-yc',
        summary: 'Startup YC path needs rewrite review.',
        status: 'open',
        bestOutcomeId: null,
        updatedAt: '2026-05-08T06:02:50.083434+00:00'
      }
    ],
    insights: [],
    masteries: [],
    outcomes: [],
    artifactRefs: [],
    specializations: [
      { id: 'spec_startup_yc', key: 'startup-yc', label: 'Startup YC' }
    ],
    inbox: {
      items: [
        {
          id: 'rewrite_1',
          kind: 'rewrite_insight',
          title: 'Rewrite blocked insight',
          summary: 'This insight was withheld from the network. Reasons: Primary message exceeds the network readability limit.',
          targetType: 'insight',
          targetId: 'insight_1',
          specializationId: 'spec_startup_yc',
          repoId: null,
          priority: 'high',
          recommendedAction: 'Rewrite this insight in plain English before sharing it.'
        },
        {
          id: 'rewrite_2',
          kind: 'rewrite_insight',
          title: 'Rewrite blocked insight',
          summary: 'This insight was withheld from the network. Reasons: Contains a suspicious long opaque token.',
          targetType: 'insight',
          targetId: 'insight_2',
          specializationId: 'spec_startup_yc',
          repoId: null,
          priority: 'high',
          recommendedAction: 'Rewrite this insight in plain English before sharing it.'
        }
      ]
    }
  };

  const review = renderRecursiveWorkspaceReview(snapshot, 'path:startup-yc');
  assert.match(review, /Startup YC review/);
  assert.match(review, /Review\n• 2 decisions waiting/);
  assert.match(review, /Sharing\n• specialization path\n• review required/);
  assert.match(review, /• blocker: Rewrite blocked insight \(2 items\)/);
  assert.match(review, /Why\n• Message is too long for network sharing\.\n• Suspicious long opaque token\./);
  assert.doesNotMatch(review, /2\. Rewrite Insight/);
});
