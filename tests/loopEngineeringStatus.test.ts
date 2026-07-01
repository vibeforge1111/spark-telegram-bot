import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  fetchLoopEngineeringStatusPacket,
  isLoopEngineeringStatusRequest,
  resolveLoopEngineeringChipId
} from '../src/loopEngineeringStatus';

type AsyncTest = () => Promise<void> | void;
const tests: { name: string; fn: AsyncTest }[] = [];
const originalEnv = {
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
  SPARK_AGENT_ACCESS_PROFILE: process.env.SPARK_AGENT_ACCESS_PROFILE,
  SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE,
  SPARK_HOME: process.env.SPARK_HOME,
  SPARK_NATURAL_ROUTE_LEDGER: process.env.SPARK_NATURAL_ROUTE_LEDGER,
  SPARK_NATURAL_ROUTE_LEDGER_PATH: process.env.SPARK_NATURAL_ROUTE_LEDGER_PATH,
  SPAWNER_UI_PUBLIC_URL: process.env.SPAWNER_UI_PUBLIC_URL,
  SPAWNER_UI_URL: process.env.SPAWNER_UI_URL
};

function test(name: string, fn: AsyncTest): void {
  tests.push({ name, fn });
}

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

function fakeCtx(text: string, replies: string[], ids = { chat: 8319079055, user: 8319079055, message: 8461 }, replyExtras: any[] = []) {
  const chat = { id: ids.chat, type: 'private' };
  const from = { id: ids.user, username: 'qa' };
  const message = { message_id: ids.message, text, chat, from };
  return {
    chat,
    from,
    message,
    update: { update_id: ids.message, message },
    sendChatAction: async (_action: string) => {},
    reply: async (reply: string, extra?: any) => {
      replies.push(reply);
      replyExtras.push(extra);
    }
  };
}

function chipResponse() {
  return {
    ok: true,
    chip: {
      summary: {
        id: 'domain-chip-daily-schedule-reliability-r30-persisted-context-qa',
        domain: 'Daily Schedule Reliability R30 Persisted Context QA',
        activation: { liveTelegramProven: false },
        nextAction: 'Resolve blocker: operator_publication_approval_missing'
      },
      readiness: {
        label: 'Telegram activation blocked',
        passCount: 10,
        totalCount: 12,
        nextAction: 'Resolve blocker: operator_publication_approval_missing',
        checks: [
          { id: 'benchmark_ab', label: 'No-chip vs chip A/B', status: 'passed', detail: 'passed' },
          { id: 'live_telegram_proof', label: 'Live Telegram proof', status: 'blocked', detail: 'missing live proof' },
          { id: 'hard_blockers', label: 'Hard blockers', status: 'blocked', detail: 'operator approval missing' }
        ]
      },
      events: [
        {
          eventType: 'benchmark_run',
          label: 'Benchmark A/B',
          status: 'passed',
          previousScore: 74,
          candidateScore: 86.5,
          utilityDelta: 12.5,
          roundsObserved: null,
          evaluatorSeparated: true,
          nextAction: 'Use this benchmark as activation evidence.',
          updatedAt: '2026-07-01T09:10:00.000Z'
        },
        {
          eventType: 'loop_batch',
          label: 'Self-improvement loop',
          status: 'passed',
          previousScore: null,
          candidateScore: 86.5,
          utilityDelta: 12.5,
          roundsObserved: 5,
          evaluatorSeparated: true,
          nextAction: 'Distill durable lessons into the runtime fast path.',
          updatedAt: '2026-07-01T09:13:00.303Z'
        },
        {
          eventType: 'activation_gate',
          label: 'Activation gate',
          status: 'blocked',
          previousScore: null,
          candidateScore: null,
          utilityDelta: null,
          roundsObserved: null,
          evaluatorSeparated: true,
          nextAction: 'Resolve blocker: operator_publication_approval_missing',
          updatedAt: '2026-07-01T09:12:00.000Z'
        }
      ]
    }
  };
}

function prdChipResponse() {
  return {
    ok: true,
    chip: {
      summary: {
        id: 'domain-chip-prd-writing-proof-loop',
        domain: 'PRD Writing',
        activation: { liveTelegramProven: true },
        nextAction: 'Ready for operator activation review',
        updatedAt: '2026-07-01T09:59:49.934Z'
      },
      readiness: {
        label: 'Local fast path supported',
        passCount: 12,
        totalCount: 12,
        nextAction: 'Ready for operator activation review',
        checks: [
          { id: 'benchmark_ab', label: 'No-chip vs chip A/B', status: 'passed', detail: 'passed' },
          { id: 'live_telegram_proof', label: 'Live Telegram proof', status: 'passed', detail: 'passed' }
        ]
      },
      events: [
        {
          eventType: 'schedule_created',
          label: 'Private loop schedule staged',
          status: 'passed',
          previousScore: null,
          candidateScore: null,
          utilityDelta: null,
          roundsObserved: 3,
          evaluatorSeparated: false,
          nextAction: 'Keep this schedule staged until a fresh Governor-authorized run path fires it against its 6 selected benchmark cases.',
          updatedAt: '2026-07-01T09:56:01.555Z'
        },
        {
          eventType: 'loop_batch',
          label: 'Private scheduled loop completed',
          status: 'passed',
          previousScore: 4.49,
          candidateScore: 9.74,
          utilityDelta: 5.25,
          roundsObserved: 3,
          evaluatorSeparated: true,
          nextAction: 'Record evaluator review or distill only accepted scheduled-loop lessons; activation remains staged.',
          updatedAt: '2026-07-01T09:59:49.934Z'
        }
      ],
      schedules: [
        {
          id: 'loopsched-prd-1',
          status: 'staged',
          active: false,
          createdAt: '2026-07-01T09:56:01.555Z',
          updatedAt: '2026-07-01T09:59:49.934Z',
          lastRunAt: '2026-07-01T09:59:49.934Z'
        }
      ],
      distillations: [
        {
          id: 'distill-prd-1',
          chipKey: 'domain-chip-prd-writing-proof-loop',
          sourceEvaluatorEventId: 'lee-evaluator-prd-1',
          lessons: ['PRDs improved when acceptance criteria were tied to observable evidence, rollout risk, and owner decisions.'],
          runtimeNotes: 'Use the distilled PRD checklist before rerunning the full loop.',
          tokenBudgetHint: 'Next matching PRDs can reuse this staged lesson without rerunning the full loop unless the user asks for fresh evidence.',
          status: 'staged',
          evidenceRefs: ['control-plane:distillations:distill-prd-1'],
          createdAt: '2026-07-01T10:02:00.000Z',
          updatedAt: '2026-07-01T10:02:00.000Z',
          lastEventId: 'lee-distill-prd-1'
        }
      ]
    }
  };
}

async function withServer(fn: (baseUrl: string, hits: string[]) => Promise<void>): Promise<void> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url || '');
    if (req.url?.startsWith('/api/loop-engineering/chips/domain-chip-daily-schedule-reliability-r30-persisted-context-qa')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(chipResponse()));
      return;
    }
    if (req.url?.startsWith('/api/loop-engineering/chips/domain-chip-prd-writing-proof-loop')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(prdChipResponse()));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    await fn(`http://127.0.0.1:${address.port}`, hits);
  } finally {
    await new Promise<void>((resolve, reject) => (server as Server).close((err) => err ? reject(err) : resolve()));
  }
}

test('detects explicit loop engineering status requests without hijacking chip creation', () => {
  assert.equal(isLoopEngineeringStatusRequest('What is the Loop Engineering readiness for the Daily Schedule chip?'), true);
  assert.equal(isLoopEngineeringStatusRequest('Why is the daily schedule domain chip blocked from activation?'), true);
  assert.equal(isLoopEngineeringStatusRequest('For QA: what is the latest PRD Writing loop-engineering state from Spawner/control-plane right now? Do not run, mutate, publish, activate, schedule, or start anything.'), true);
  assert.equal(isLoopEngineeringStatusRequest('Loop QA read-only check: latest PRD Writing loop state from Spawner? Include schedule status, fresh/stale, what improved, distilled reuse without rerun, and link. Do not mutate anything.'), true);
  assert.equal(isLoopEngineeringStatusRequest('Build a private Domain Chip for daily schedule reliability.'), false);
  assert.equal(isLoopEngineeringStatusRequest('Remind me tomorrow at 9am Dubai time.'), false);
});

test('resolves Daily Schedule alias and exact chip ids', () => {
  assert.equal(
    resolveLoopEngineeringChipId('Show readiness for Daily Schedule Reliability'),
    'domain-chip-daily-schedule-reliability-r30-persisted-context-qa'
  );
  assert.equal(
    resolveLoopEngineeringChipId('status for domain-chip-daily-schedule-reliability-r30-persisted-context-qa'),
    'domain-chip-daily-schedule-reliability-r30-persisted-context-qa'
  );
  assert.equal(
    resolveLoopEngineeringChipId('latest PRD Writing loop-engineering state from Spawner'),
    'domain-chip-prd-writing-proof-loop'
  );
});

test('renders read-only packet from Spawner evidence without activation claims', async () => {
  const fetchImpl = async () => Response.json(chipResponse()) as any;
  const packet = await fetchLoopEngineeringStatusPacket('What is the Loop Engineering readiness for the Daily Schedule chip?', {
    fetchImpl,
    nowMs: Date.parse('2026-07-01T09:13:05.000Z')
  });
  assert.ok(packet);
  assert.equal(packet.route, 'loop_engineering.status');
  assert.equal(packet.readinessLabel, 'Telegram activation blocked');
  assert.equal(packet.passCount, 10);
  assert.equal(packet.totalCount, 12);
  assert.equal(packet.resultEventCount, 3);
  assert.equal(packet.freshnessLabel, 'read from Spawner now; latest Spawner event timestamp is 2026-07-01T09:13:00.303Z; freshness: fresh within 10s.');
  assert.equal(packet.latestResultEvent?.eventType, 'loop_batch');
  assert.deepEqual(packet.topResultEvents.map((event) => event.eventType), ['benchmark_run', 'loop_batch', 'activation_gate']);
  assert.equal(packet.blockedChecks.map((check) => check.id).join(','), 'live_telegram_proof,hard_blockers');
  assert.match(packet.reply, /10\/12 checks pass/);
  assert.match(packet.reply, /Live Telegram proof, Hard blockers/);
  assert.match(packet.reply, /Freshness: read from Spawner now; latest Spawner event timestamp is 2026-07-01T09:13:00\.303Z; freshness: fresh within 10s\./);
  assert.match(packet.reply, /Latest result: Self-improvement loop passed \(\+12\.5, 5 rounds, separated evaluator, 2026-07-01T09:13:00\.303Z\)\./);
  assert.match(packet.reply, /Loop results: Benchmark A\/B passed \(\+12\.5, separated evaluator\); Self-improvement loop passed \(\+12\.5, 5 rounds, separated evaluator\); Activation gate blocked \(separated evaluator\)\./);
  assert.match(packet.reply, /I only read Spawner here; no loop, benchmark, schedule, activation, or publication was queued\./);
  assert.match(packet.reply, /Next safe step: Resolve blocker: operator_publication_approval_missing/);
  assert.doesNotMatch(packet.reply, /\b(?:I (?:activated|published|registered|scheduled|started|created)|was (?:activated|published|registered|scheduled|started)|has been (?:activated|published|registered|scheduled|started))\b/i);
});

test('PRD Writing no-action state prompt reads the proof-loop chip and reports latest scheduled-loop result', async () => {
  const fetchImpl = async () => Response.json(prdChipResponse()) as any;
  const packet = await fetchLoopEngineeringStatusPacket(
    'For QA: what is the latest PRD Writing loop-engineering state from Spawner/control-plane right now? Do not run, mutate, publish, activate, schedule, or start anything. Reply with the latest schedule/loop result, whether it is fresh or stale, and the Spawner link only.',
    { fetchImpl, nowMs: Date.parse('2026-07-01T09:59:55.000Z') }
  );

  assert.ok(packet);
  assert.equal(packet.chipId, 'domain-chip-prd-writing-proof-loop');
  assert.equal(packet.readinessLabel, 'Local fast path supported');
  assert.equal(packet.latestResultEvent?.label, 'Private scheduled loop completed');
  assert.equal(packet.latestResultEvent?.updatedAt, '2026-07-01T09:59:49.934Z');
  assert.match(packet.reply, /PRD Writing is local fast path supported .*12\/12 checks pass/i);
  assert.match(packet.reply, /read from Spawner now; latest Spawner event timestamp is 2026-07-01T09:59:49\.934Z; freshness: fresh within 10s\./);
  assert.match(packet.reply, /Latest result: Private scheduled loop completed passed \(4\.5 -> 9\.7, 3 rounds, separated evaluator, 2026-07-01T09:59:49\.934Z\)\./);
  assert.match(packet.reply, /Current schedule: staged, inactive \(last changed 2026-07-01T09:59:49\.934Z\)\./);
  assert.match(packet.reply, /I only read Spawner here; nothing was queued or changed\./);
  assert.match(packet.reply, /Details: .*\/loop-engineering\/domain-chip-prd-writing-proof-loop/);
  assert.doesNotMatch(packet.reply, /\b(?:I (?:activated|published|registered|scheduled|started|created)|was (?:activated|published|registered|scheduled|started)|has been (?:activated|published|registered|scheduled|started))\b/i);
});

test('PRD Writing status labels old Spawner evidence as stale after ten seconds', async () => {
  const fetchImpl = async () => Response.json(prdChipResponse()) as any;
  const packet = await fetchLoopEngineeringStatusPacket(
    'Loop QA read-only check: latest PRD Writing loop state from Spawner? Include schedule status, fresh/stale, what improved, distilled reuse without rerun, and link. Do not mutate anything.',
    { fetchImpl, nowMs: Date.parse('2026-07-01T10:00:05.000Z') }
  );

  assert.ok(packet);
  assert.match(packet.freshnessLabel, /freshness: stale \(15s old\)/);
  assert.match(packet.reply, /freshness: stale \(15s old\)/);
  assert.match(packet.reply, /I only read Spawner here; nothing was queued or changed\./);
});

test('PRD Writing status treats schedule lifecycle events as latest Spawner truth', async () => {
  const response: any = prdChipResponse();
  response.chip.events.push({
    eventType: 'schedule_lifecycle',
    label: 'Private loop schedule cancelled',
    status: 'passed',
    previousScore: null,
    candidateScore: null,
    utilityDelta: null,
    roundsObserved: null,
    evaluatorSeparated: true,
    nextAction: 'Schedule is terminal; create a new schedule for the next loop.',
    updatedAt: '2026-07-01T11:32:16.030Z'
  });
  response.chip.schedules.push({
    id: 'loopsched-prd-2',
    status: 'cancelled',
    active: false,
    createdAt: '2026-07-01T11:31:36.966Z',
    updatedAt: '2026-07-01T11:32:16.030Z',
    lastRunAt: null
  });
  const fetchImpl = async () => Response.json(response) as any;
  const packet = await fetchLoopEngineeringStatusPacket(
    'Loop QA read-only check: latest PRD Writing loop state from Spawner? Include schedule status, fresh/stale, what improved, distilled reuse without rerun, and link. Do not mutate anything.',
    { fetchImpl }
  );

  assert.ok(packet);
  assert.equal(packet.latestResultEvent?.eventType, 'schedule_lifecycle');
  assert.equal(packet.latestResultEvent?.label, 'Private loop schedule cancelled');
  assert.match(packet.reply, /Latest result: Private loop schedule cancelled passed \(separated evaluator, 2026-07-01T11:32:16\.030Z\)\./);
  assert.match(packet.reply, /Current schedule: cancelled, inactive \(last changed 2026-07-01T11:32:16\.030Z\)\./);
  assert.match(packet.reply, /Distilled reuse: PRDs improved/i);
  assert.match(packet.reply, /nothing was queued or changed/);
});

test('PRD Writing status uses newer schedules array when event summaries lag', async () => {
  const response: any = prdChipResponse();
  response.chip.schedules.push({
    id: 'loopsched-prd-3',
    status: 'paused',
    active: false,
    createdAt: '2026-07-01T12:00:00.000Z',
    updatedAt: '2026-07-01T12:04:05.123Z',
    lastRunAt: '2026-07-01T12:01:00.000Z'
  });
  const fetchImpl = async () => Response.json(response) as any;
  const packet = await fetchLoopEngineeringStatusPacket(
    'What is the current PRD Writing schedule status from Spawner? Do not mutate anything.',
    { fetchImpl }
  );

  assert.ok(packet);
  assert.equal(packet.currentScheduleUpdatedAt, '2026-07-01T12:04:05.123Z');
  assert.match(packet.freshnessLabel, /latest Spawner event timestamp is 2026-07-01T12:04:05\.123Z/);
  assert.match(packet.reply, /Current schedule: paused, inactive \(last changed 2026-07-01T12:04:05\.123Z; last run 2026-07-01T12:01:00\.000Z\)\./);
  assert.match(packet.reply, /I only read Spawner here/);
});

test('renders a readable missing-evidence reply instead of command usage on Spawner 404', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ message: 'domain chip not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' }
  }) as any;
  const packet = await fetchLoopEngineeringStatusPacket('Loop Engineering status for domain-chip-prd-writing-proof-loop', { fetchImpl });

  assert.ok(packet);
  assert.equal(packet.readinessLabel, 'Evidence unavailable');
  assert.equal(packet.blockedChecks[0]?.id, 'spawner_evidence_unavailable');
  assert.match(packet.reply, /did not return a readable evidence packet/i);
  assert.match(packet.reply, /I did not queue any loop, benchmark, schedule, activation, or publication/i);
  assert.doesNotMatch(packet.reply, /Usage: \/loop/i);
  assert.doesNotMatch(packet.reply, /\b(?:activated|published|registered|scheduled|started)\b/i);
});

test('renders a readable unreachable-Spawner reply instead of command usage', async () => {
  const fetchImpl = async () => {
    throw new Error('connect ECONNREFUSED');
  };
  const packet = await fetchLoopEngineeringStatusPacket('Loop Engineering status for domain-chip-prd-writing-proof-loop', { fetchImpl });

  assert.ok(packet);
  assert.equal(packet.readinessLabel, 'Evidence unavailable');
  assert.match(packet.blockedChecks[0]?.detail || '', /could not be reached/i);
  assert.match(packet.reply, /did not return a readable evidence packet/i);
  assert.doesNotMatch(packet.reply, /Usage: \/loop/i);
  assert.doesNotMatch(packet.reply, /\b(?:activated|published|registered|scheduled|started)\b/i);
});

test('Telegram handler answers loop status through Spawner evidence API and starts no work', async () => {
  await withServer(async (baseUrl, hits) => {
    process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPAWNER_UI_URL = baseUrl;
    process.env.SPAWNER_UI_PUBLIC_URL = baseUrl;

    const indexModule: any = await import('../src/index');
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx('What is the Loop Engineering readiness for the Daily Schedule chip? Do not activate or run anything.', replies));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Daily Schedule Reliability R30 Persisted Context QA is telegram activation blocked/i);
    assert.match(replies[0], /10\/12 checks pass/i);
    assert.match(replies[0], /Live Telegram proof, Hard blockers/i);
    assert.match(replies[0], /Loop results: Benchmark A\/B passed \(\+12\.5, separated evaluator\); Self-improvement loop passed \(\+12\.5, 5 rounds, separated evaluator\); Activation gate blocked/i);
    assert.match(replies[0], /Details: http:\/\/127\.0\.0\.1:\d+\/loop-engineering\/domain-chip-daily-schedule-reliability-r30-persisted-context-qa/i);
    assert.doesNotMatch(replies[0], /Daily Schedule private fast path|reminder was created|I created|I started|mission/i);
    assert.deepEqual(hits, ['/api/loop-engineering/chips/domain-chip-daily-schedule-reliability-r30-persisted-context-qa']);
  });
});

test('Telegram handler answers PRD Writing no-action state query through Spawner and starts no work', async () => {
  await withServer(async (baseUrl, hits) => {
    const tempHome = mkdtempSync(path.join(os.tmpdir(), 'spark-loop-status-ledger-'));
    const ledgerPath = path.join(tempHome, 'natural-route-execution.jsonl');
    try {
      process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
      process.env.ADMIN_TELEGRAM_IDS = '8319079055';
      process.env.SPARK_BOT_TEST_MODE = '1';
      process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
      process.env.SPAWNER_UI_URL = baseUrl;
      process.env.SPAWNER_UI_PUBLIC_URL = baseUrl;
      process.env.SPARK_HOME = tempHome;
      process.env.SPARK_NATURAL_ROUTE_LEDGER = '1';
      process.env.SPARK_NATURAL_ROUTE_LEDGER_PATH = ledgerPath;

      const indexModule: any = await import('../src/index');
      const replies: string[] = [];
      const replyExtras: any[] = [];
      await indexModule.handleTextMessage(fakeCtx(
        'For QA: what is the latest PRD Writing loop-engineering state from Spawner/control-plane right now? Do not run, mutate, publish, activate, schedule, or start anything. Reply with the latest schedule/loop result, whether it is fresh or stale, and the Spawner link only.',
        replies,
        { chat: 8319079055, user: 8319079055, message: 8462 },
        replyExtras
      ));

      assert.equal(replies.length, 1);
      assert.match(replies[0], /PRD Writing is local fast path supported/i);
      assert.match(replies[0], /read from Spawner now; latest Spawner event timestamp is 2026-07-01T09:59:49\.934Z; freshness: stale \(/);
      assert.match(replies[0], /Private scheduled loop completed passed \(4\.5 -> 9\.7, 3 rounds, separated evaluator, 2026-07-01T09:59:49\.934Z\)/);
      assert.match(replies[0], /I only read Spawner here; nothing was queued or changed\./);
      assert.match(replies[0], /Details: http:\/\/127\.0\.0\.1:\d+\/loop-engineering\/domain-chip-prd-writing-proof-loop/i);
      assert.doesNotMatch(replies[0], /\b(?:I (?:activated|published|registered|scheduled|started|created)|was (?:activated|published|registered|scheduled|started)|has been (?:activated|published|registered|scheduled|started)|mission)\b/i);
      assert.deepEqual(hits, ['/api/loop-engineering/chips/domain-chip-prd-writing-proof-loop']);

      const trace = replyExtras[0]?.__sparkTraceContext;
      assert.equal(trace?.route, 'loop_engineering.status');
      assert.equal(trace?.command, 'telegram_loop_engineering_status');
      assert.equal(trace?.proofCapsule?.schema, 'spark.harness_proof.v1');
      assert.equal(trace?.proofCapsule?.route, 'loop_engineering.status');
      assert.equal(trace?.proofCapsule?.intent?.kind, 'loop_engineering.status');
      assert.equal(trace?.proofCapsule?.execution?.tool, 'spawner.loop_engineering.status');
      assert.equal(trace?.proofCapsule?.execution?.mutationClass, 'read_only');
      assert.equal(trace?.proofCapsule?.joins?.telegram, 'joined');
      assert.equal(trace?.proofCapsule?.joins?.spawner, 'joined');

      await new Promise((resolve) => setTimeout(resolve, 30));
      const rows = readFileSync(ledgerPath, 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].shadow_route, 'loop_engineering.status');
      assert.equal(rows[0].executed_route, 'loop_engineering.status');
      assert.equal(rows[0].executed_action, 'loop_engineering.read_only_status');
      assert.equal(rows[0].outcome, 'matched');
      assert.equal(rows[0].harness_proof_ref, trace.proofCapsule.turnRef);
    } finally {
      rmSync(tempHome, { recursive: true, force: true });
      restoreEnv();
    }
  });
});

test('Telegram handler routes live PRD Writing loop-state QA wording to Spawner status, not QA planning', async () => {
  await withServer(async (baseUrl, hits) => {
    process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPAWNER_UI_URL = baseUrl;
    process.env.SPAWNER_UI_PUBLIC_URL = baseUrl;

    const indexModule: any = await import('../src/index');
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx(
      'Loop QA read-only check: latest PRD Writing loop state from Spawner? Include schedule status, fresh/stale, what improved, distilled reuse without rerun, and link. Do not mutate anything.',
      replies,
      { chat: 8319079055, user: 8319079055, message: 8463 }
    ));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /PRD Writing is local fast path supported/i);
    assert.match(replies[0], /Private scheduled loop completed passed/i);
    assert.match(replies[0], /Distilled reuse: PRDs improved when acceptance criteria were tied to observable evidence, rollout risk, and owner decisions\./i);
    assert.match(replies[0], /reuse this staged lesson without rerunning the full loop/i);
    assert.match(replies[0], /I only read Spawner here; nothing was queued or changed\./);
    assert.match(replies[0], /Details: http:\/\/127\.0\.0\.1:\d+\/loop-engineering\/domain-chip-prd-writing-proof-loop/i);
    assert.doesNotMatch(replies[0], /QA planning, not a mission launch/i);
    assert.deepEqual(hits, ['/api/loop-engineering/chips/domain-chip-prd-writing-proof-loop']);
  });
});

test('Telegram handler drafts future PRDs with Spawner distilled lesson and no loop rerun', async () => {
  await withServer(async (baseUrl, hits) => {
    try {
      process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
      process.env.ADMIN_TELEGRAM_IDS = '8319079055';
      process.env.SPARK_BOT_TEST_MODE = '1';
      process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
      process.env.SPAWNER_UI_URL = baseUrl;
      process.env.SPAWNER_UI_PUBLIC_URL = baseUrl;

      const indexModule: any = await import('../src/index');
      const replies: string[] = [];
      await indexModule.handleTextMessage(fakeCtx(
        'Write a PRD for reducing invoice export failures for finance admins after CSV jobs time out. Use the PRD Writing domain chip if it fits, but do not run a benchmark, loop, schedule, activation, mission, or publication.',
        replies,
        { chat: 8319079055, user: 8319079055, message: 8464 }
      ));

      assert.equal(replies.length, 1);
      assert.match(replies[0], /Fast PRD path: Invoice Export/i);
      assert.match(replies[0], /Loop lesson reused: PRDs improved when acceptance criteria were tied to observable evidence, rollout risk, and owner decisions\./i);
      assert.match(replies[0], /reuse this staged lesson without rerunning the full loop/i);
      assert.match(replies[0], /No benchmark or self-improvement loop was started for this PRD turn\./i);
      assert.match(replies[0], /Evidence: http:\/\/127\.0\.0\.1:\d+\/loop-engineering\/domain-chip-prd-writing-proof-loop/i);
      assert.doesNotMatch(replies[0], /should use loop mode before a normal PRD draft/i);
      assert.doesNotMatch(replies[0], /\b(?:I (?:activated|published|registered|scheduled|started|created)|mission)\b/i);
      assert.deepEqual(hits, ['/api/loop-engineering/chips/domain-chip-prd-writing-proof-loop']);
    } finally {
      restoreEnv();
    }
  });
});

async function run() {
  for (const entry of tests) {
    await entry.fn();
    console.log(`ok - ${entry.name}`);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
