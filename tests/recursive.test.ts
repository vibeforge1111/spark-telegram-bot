import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildBuilderChipLoopBridgeInput,
  buildBuilderChipLoopWorkspacePayload,
  parseRecursiveCommand,
  renderBuilderChipLoopCompletion,
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
  sparkWorkspaceApiUrl,
  sparkWorkspaceBridgeHints,
  workspaceReviewCandidates,
  workspaceSessions,
  workspaceTraceView
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
  assert.equal((built.payload.runtimeSource as any).chipLabel, 'Startup Yc');
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
      workspaceUrl: 'http://127.0.0.1:5173/runs?tab=recursions'
    }
  );

  assert.match(reply, /Recursive loop complete: startup-yc/);
  assert.match(reply, /Final verdict: improved/);
  assert.match(reply, /Metric: builder chip loop best metric=0.8123/);
  assert.match(reply, /Final suggestions: 4/);
  assert.match(reply, /Workspace sync: ok/);
  assert.match(reply, /Workspace outcome: outcome_builder_chip_startup_yc_20260507T100000000/);
  assert.match(reply, /Workspace detail: Builder chip loop synced through Spark Swarm bridge\./);
  assert.match(reply, /Next: \/recursive report path_builder_chip_startup_yc/);
});

test('maps workspace-scoped Builder chip loops into Telegram recursive sessions', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path_builder_chip_startup_yc',
        scope: 'workspace',
        specializationId: null,
        repoLabel: 'spark-intelligence-builder',
        summary: 'Builder chip loop for Startup Yc completed 3/3 round(s).',
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
        summary: 'Final round improved.',
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
        label: 'Startup Yc chip-loop status',
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

  const report = renderRecursiveWorkspaceReport(snapshot, 'path_builder_chip_startup_yc');
  assert.match(report, /Spark Workspace Recursion Report/);
  assert.match(report, /Latest outcome: improved - Final round improved\./);
  assert.match(report, /Metric: builder chip loop best metric=0.72/);
  assert.match(report, /Scorecard: Best metric 0.72; goal=higher; model=Startup Yc; Rounds: 3\/3/);
  assert.match(report, /Artifact refs: 1 \(run_trace:Startup Yc chip-loop status\)/);
  assert.match(report, /Decisions needed: 0/);

  const trace = workspaceTraceView(snapshot, 'path_builder_chip_startup_yc');
  assert.equal(trace.spawner.board_entry.taskCount, 2);
  assert.equal(trace.timeline[0].kind, 'outcome');
  assert.equal(trace.timeline[0].status, 'improved');
  assert.equal(trace.timeline[0].summary, 'Final round improved. builder chip loop best metric=0.72');
  assert.equal(trace.timeline[1].kind, 'artifact');
  assert.equal(trace.timeline[1].status, 'run_trace');
});

test('reports Workspace best outcome id when snapshot omits outcome bodies', () => {
  const snapshot: any = {
    evolutionPaths: [
      {
        id: 'path_builder_chip_startup_yc',
        scope: 'workspace',
        specializationId: null,
        repoLabel: 'spark-intelligence-builder',
        summary: 'Builder chip loop for Startup Yc completed 1/1 round(s).',
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
  assert.match(report, /Latest outcome: recorded - outcome_builder_chip_startup_yc_20260507T151032889/);

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

  const review = renderRecursiveWorkspaceReview(snapshot, 'path_builder_chip_startup_yc');
  assert.match(review, /Spark Workspace Review/);
  assert.match(review, /medium review_outcome/);
  assert.match(review, /Open Recursions and inspect the run trace/);
});
