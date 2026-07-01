import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import {
  fetchLoopEngineeringStatusPacket,
  isLoopEngineeringStatusRequest,
  resolveLoopEngineeringChipId
} from '../src/loopEngineeringStatus';

type AsyncTest = () => Promise<void> | void;
const tests: { name: string; fn: AsyncTest }[] = [];

function test(name: string, fn: AsyncTest): void {
  tests.push({ name, fn });
}

function fakeCtx(text: string, replies: string[], ids = { chat: 8319079055, user: 8319079055, message: 8461 }) {
  const chat = { id: ids.chat, type: 'private' };
  const from = { id: ids.user, username: 'qa' };
  const message = { message_id: ids.message, text, chat, from };
  return {
    chat,
    from,
    message,
    update: { update_id: ids.message, message },
    sendChatAction: async (_action: string) => {},
    reply: async (reply: string) => {
      replies.push(reply);
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
  const packet = await fetchLoopEngineeringStatusPacket('What is the Loop Engineering readiness for the Daily Schedule chip?', { fetchImpl });
  assert.ok(packet);
  assert.equal(packet.route, 'loop_engineering.status');
  assert.equal(packet.readinessLabel, 'Telegram activation blocked');
  assert.equal(packet.passCount, 10);
  assert.equal(packet.totalCount, 12);
  assert.equal(packet.resultEventCount, 3);
  assert.equal(packet.freshnessLabel, 'read from Spawner now; latest Spawner event timestamp is 2026-07-01T09:13:00.303Z.');
  assert.equal(packet.latestResultEvent?.eventType, 'loop_batch');
  assert.deepEqual(packet.topResultEvents.map((event) => event.eventType), ['benchmark_run', 'loop_batch', 'activation_gate']);
  assert.equal(packet.blockedChecks.map((check) => check.id).join(','), 'live_telegram_proof,hard_blockers');
  assert.match(packet.reply, /10\/12 checks pass/);
  assert.match(packet.reply, /Live Telegram proof, Hard blockers/);
  assert.match(packet.reply, /Freshness: read from Spawner now; latest Spawner event timestamp is 2026-07-01T09:13:00\.303Z\./);
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
    { fetchImpl }
  );

  assert.ok(packet);
  assert.equal(packet.chipId, 'domain-chip-prd-writing-proof-loop');
  assert.equal(packet.readinessLabel, 'Local fast path supported');
  assert.equal(packet.latestResultEvent?.label, 'Private scheduled loop completed');
  assert.equal(packet.latestResultEvent?.updatedAt, '2026-07-01T09:59:49.934Z');
  assert.match(packet.reply, /PRD Writing is local fast path supported: 12\/12 checks pass/i);
  assert.match(packet.reply, /Freshness: read from Spawner now; latest Spawner event timestamp is 2026-07-01T09:59:49\.934Z\./);
  assert.match(packet.reply, /Latest result: Private scheduled loop completed passed \(4\.5 -> 9\.7, 3 rounds, separated evaluator, 2026-07-01T09:59:49\.934Z\)\./);
  assert.match(packet.reply, /Details: .*\/loop-engineering\/domain-chip-prd-writing-proof-loop/);
  assert.doesNotMatch(packet.reply, /\b(?:I (?:activated|published|registered|scheduled|started|created)|was (?:activated|published|registered|scheduled|started)|has been (?:activated|published|registered|scheduled|started))\b/i);
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
    process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPAWNER_UI_URL = baseUrl;
    process.env.SPAWNER_UI_PUBLIC_URL = baseUrl;

    const indexModule: any = await import('../src/index');
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx('For QA: what is the latest PRD Writing loop-engineering state from Spawner/control-plane right now? Do not run, mutate, publish, activate, schedule, or start anything. Reply with the latest schedule/loop result, whether it is fresh or stale, and the Spawner link only.', replies));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /PRD Writing is local fast path supported: 12\/12 checks pass/i);
    assert.match(replies[0], /Private scheduled loop completed passed \(4\.5 -> 9\.7, 3 rounds, separated evaluator, 2026-07-01T09:59:49\.934Z\)/);
    assert.match(replies[0], /I only read Spawner here; no loop, benchmark, schedule, activation, or publication was queued\./);
    assert.match(replies[0], /Details: http:\/\/127\.0\.0\.1:\d+\/loop-engineering\/domain-chip-prd-writing-proof-loop/i);
    assert.doesNotMatch(replies[0], /\b(?:I (?:activated|published|registered|scheduled|started|created)|was (?:activated|published|registered|scheduled|started)|has been (?:activated|published|registered|scheduled|started)|mission)\b/i);
    assert.deepEqual(hits, ['/api/loop-engineering/chips/domain-chip-prd-writing-proof-loop']);
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
