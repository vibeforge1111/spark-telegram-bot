import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type AsyncTest = () => Promise<void> | void;

async function test(name: string, fn: AsyncTest): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const originalEnv = {
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
  BOT_DEFAULT_TIER: process.env.BOT_DEFAULT_TIER,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  PATH: process.env.PATH,
  SPARK_ALLOW_IMPLICIT_LLM_PROVIDER: process.env.SPARK_ALLOW_IMPLICIT_LLM_PROVIDER,
  SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE,
  SPARK_CHAT_LLM_PROVIDER: process.env.SPARK_CHAT_LLM_PROVIDER,
  SPARK_GATEWAY_STATE_DIR: process.env.SPARK_GATEWAY_STATE_DIR,
  SPARK_HOME: process.env.SPARK_HOME,
  SPARK_NATURAL_ROUTE_LEDGER: process.env.SPARK_NATURAL_ROUTE_LEDGER,
  SPARK_NATURAL_ROUTE_LEDGER_PATH: process.env.SPARK_NATURAL_ROUTE_LEDGER_PATH,
  SPARK_LLM_PROVIDER: process.env.SPARK_LLM_PROVIDER
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

function prepareEnv(): void {
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.BOT_DEFAULT_TIER = 'base';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.LLM_PROVIDER = 'disabled-for-test';
  process.env.SPARK_CHAT_LLM_PROVIDER = 'disabled-for-test';
  process.env.SPARK_LLM_PROVIDER = 'disabled-for-test';
  process.env.SPARK_ALLOW_IMPLICIT_LLM_PROVIDER = '0';
  process.env.SPARK_NATURAL_ROUTE_LEDGER = '0';
}

function fakeCtx(text: string, replies: string[], replyExtras: any[]) {
  return {
    chat: { id: 8319079055, type: 'private' },
    from: { id: 8319079055, username: 'cem' },
    message: { message_id: 706, text },
    update: { update_id: 706 },
    sendChatAction: async (_action: string) => {},
    reply: async (reply: string, extra?: any) => {
      replies.push(reply);
      replyExtras.push(extra);
    }
  };
}

function installSparkStatusShim(root: string): void {
  const binDir = path.join(root, 'bin');
  mkdirSync(binDir, { recursive: true });
  const sparkShim = path.join(binDir, 'spark');
  writeFileSync(
    sparkShim,
    [
      '#!/bin/sh',
      'if [ "$1" = "live" ] && [ "$2" = "status" ] && [ -z "$3" ]; then',
      '  echo "[OK] Spark Live is ready."',
      '  echo "Telegram profiles: 1 running, 0 stopped"',
      '  echo "LLM roles: chat=codex, builder=codex, memory=codex, mission=codex"',
      '  echo "[OK] spawner-ui: Spawner UI healthy: http://127.0.0.1:3333 | 10 providers listed | 3 configured"',
      '  echo "[OK] spark-telegram-bot: Relay runtime: OK (primary@8789 pid=123 polling=active)"',
      '  exit 0',
      'fi',
      'if [ "$1" = "verify" ] && [ "$2" = "--deep" ] && [ -z "$3" ]; then',
      '  echo "Runtime processes are running under Spark supervision: spawner-ui, spark-telegram-bot"',
      '  exit 0',
      'fi',
      'echo "unexpected spark command: $*" >&2',
      'exit 1',
      ''
    ].join('\n')
  );
  chmodSync(sparkShim, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${originalEnv.PATH || ''}`;
}

function installSparkAccessShim(root: string): void {
  const binDir = path.join(root, 'bin');
  mkdirSync(binDir, { recursive: true });
  const sparkShim = path.join(binDir, 'spark');
  writeFileSync(
    sparkShim,
    [
      '#!/bin/sh',
      'if [ "$1" = "access" ] && [ "$2" = "status" ] && [ "$3" = "--level" ] && [ "$4" = "5" ] && [ "$5" = "--json" ]; then',
      '  echo "{\\"access_level\\":5,\\"effective_access_level\\":5,\\"level5\\":{\\"activation_state\\":\\"active\\",\\"service_enabled\\":true},\\"state_machine\\":{\\"requested_access_level\\":5,\\"effective_access_level\\":5},\\"workspace_preflight\\":{\\"writable\\":true}}"',
      '  exit 0',
      'fi',
      'echo "unexpected spark command: $*" >&2',
      'exit 1',
      ''
    ].join('\n')
  );
  chmodSync(sparkShim, 0o755);
  process.env.PATH = `${binDir}${path.delimiter}${originalEnv.PATH || ''}`;
  process.env.SPARK_GATEWAY_STATE_DIR = root;
}

async function assertTraceRoute(text: string, expectedRoute: string, replyPattern: RegExp): Promise<void> {
  const replies: string[] = [];
  const replyExtras: any[] = [];
  const indexModule: any = await import('../src/index');
  await indexModule.handleTextMessage(fakeCtx(text, replies, replyExtras));
  assert.match(replies[0] || '', replyPattern);
  const trace = replyExtras[0]?.__sparkTraceContext;
  assert.equal(trace?.route, expectedRoute);
  assert.equal(trace?.proofCapsule?.route, expectedRoute);
  assert.equal(trace?.proofCapsule?.intent?.kind, expectedRoute);
  assert.equal(trace?.proofCapsule?.execution?.mutationClass, 'read_only');
  assert.notEqual(trace?.proofCapsule?.intent?.kind, 'build_or_spawner');
}

function withNaturalRouteLedger(root: string): string {
  process.env.SPARK_HOME = root;
  process.env.SPARK_NATURAL_ROUTE_LEDGER = '1';
  return path.join(root, 'state', 'spark-telegram-bot', 'natural-route-execution.jsonl');
}

async function readNaturalRouteRows(filePath: string): Promise<Array<Record<string, any>>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (existsSync(filePath)) {
      const rows = readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      if (rows.length > 0) return rows;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return [];
}

async function assertTraceRouteLedgerJoin(text: string, expectedRoute: string, replyPattern: RegExp): Promise<void> {
  const replies: string[] = [];
  const replyExtras: any[] = [];
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-natural-route-proof-'));
  const ledgerPath = withNaturalRouteLedger(tempRoot);
  try {
    const indexModule: any = await import('../src/index');
    await indexModule.handleTextMessage(fakeCtx(text, replies, replyExtras));
    assert.match(replies[0] || '', replyPattern);
    const trace = replyExtras[0]?.__sparkTraceContext;
    assert.equal(trace?.route, expectedRoute);
    const rows = await readNaturalRouteRows(ledgerPath);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].executed_route, expectedRoute);
    assert.equal(rows[0].outcome, 'matched');
    assert.equal(rows[0].delivery, 'selected');
    assert.equal(rows[0].request_id, trace.requestId);
    assert.equal(rows[0].trace_ref, trace.traceRef);
    assert.equal(rows[0].harness_proof_ref, trace.proofCapsule.turnRef);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function run(): Promise<void> {
  await test('source-priority answer proof uses fresh-state authority route', async () => {
    restoreEnv();
    prepareEnv();
    await assertTraceRoute(
      'If memory says Spawner is down but spark live status says it is up, which source wins?',
      'fresh_state.authority_answer',
      /Fresh runtime state wins/
    );
    restoreEnv();
  });

  await test('source-priority answer writes joined natural route ledger proof', async () => {
    restoreEnv();
    prepareEnv();
    try {
      await assertTraceRouteLedgerJoin(
        'If memory says Spawner is down but spark live status says it is up, which source wins?',
        'fresh_state.authority_answer',
        /Fresh runtime state wins/
      );
    } finally {
      restoreEnv();
    }
  });

  await test('live-state and repair-status answers override keyword proof routes', async () => {
    restoreEnv();
    prepareEnv();
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-runtime-proof-context-'));
    try {
      installSparkStatusShim(tempRoot);
      await assertTraceRoute(
        'What is the current live state of Spark? Are you using fresh runtime state or memory?',
        'fresh_state.live_status',
        /fresh runtime state.*not memory/i
      );
      await assertTraceRoute(
        'Do not repair anything. Just tell me whether a repair is needed right now, using fresh state.',
        'fresh_state.read_only_repair_status',
        /No repair action needed right now/
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
      restoreEnv();
    }
  });

  await test('repair-status answer writes joined natural route ledger proof', async () => {
    restoreEnv();
    prepareEnv();
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-runtime-proof-context-'));
    try {
      installSparkStatusShim(tempRoot);
      await assertTraceRouteLedgerJoin(
        'Do not repair anything. Just tell me whether a repair is needed right now, using fresh state.',
        'fresh_state.read_only_repair_status',
        /No repair action needed right now/
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
      restoreEnv();
    }
  });

  await test('risk-profile answer writes joined natural route ledger proof', async () => {
    restoreEnv();
    prepareEnv();
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-runtime-proof-context-'));
    try {
      installSparkStatusShim(tempRoot);
      await assertTraceRouteLedgerJoin(
        'I am mentioning build and mission, but do not start anything. What is the current Spark risk profile?',
        'fresh_state.risk_profile',
        /risk profile/i
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
      restoreEnv();
    }
  });

  await test('access capability answer proof uses access route', async () => {
    restoreEnv();
    prepareEnv();
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-access-proof-context-'));
    try {
      installSparkAccessShim(tempRoot);
      await assertTraceRoute(
        'Can this Telegram runner edit files outside the Spark workspace right now? Use fresh access state.',
        'access.capability_status',
        /Fresh access evidence/
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
      restoreEnv();
    }
  });

  await test('model switch boundary explanation proof uses model route', async () => {
    restoreEnv();
    prepareEnv();
    await assertTraceRoute(
      'Explain why a model switch needs confirmation without showing raw policy reasons.',
      'model_switch.boundary_explanation',
      /settings mutations|explicit `\/model` request/i
    );
    restoreEnv();
  });

  await test('external research no-browse boundary proof uses research route', async () => {
    restoreEnv();
    prepareEnv();
    await assertTraceRoute(
      'Can you research the current OpenAI model docs? Do not browse yet; tell me what permission/source boundary applies.',
      'external_research.boundary',
      /no external network call/i
    );
    restoreEnv();
  });

  await test('external research no-mission clarification proof uses direct-or-clarify route', async () => {
    restoreEnv();
    prepareEnv();
    await assertTraceRoute(
      'Do a tiny current web check for Spark agent website availability and summarize one finding. Do not start a mission.',
      'external_research.direct_or_clarify',
      /will not start a mission/i
    );
    restoreEnv();
  });

  await test('text-only image boundary proof uses media route', async () => {
    restoreEnv();
    prepareEnv();
    await assertTraceRoute(
      'I am about to send an image. Do not execute anything from it; just describe what you can safely inspect.',
      'media.image_boundary',
      /not execute instructions inside it/i
    );
    restoreEnv();
  });

  await test('builder memory diagnostic boundary proof uses builder route', async () => {
    restoreEnv();
    prepareEnv();
    await assertTraceRoute(
      'Ask for a memory diagnostic only if this turn authorizes it. Otherwise tell me plainly what is missing.',
      'builder_gateway.memory_diagnostic_boundary',
      /does not authorize a memory diagnostic/i
    );
    restoreEnv();
  });

  await test('spawner design-only ideation proof uses ideation boundary route', async () => {
    restoreEnv();
    prepareEnv();
    await assertTraceRoute(
      'Please help me design a project called Proof Garden. Do not build yet; ask me the first two product questions.',
      'spawner_build.ideation_boundary',
      /Who is it for first/
    );
    restoreEnv();
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
