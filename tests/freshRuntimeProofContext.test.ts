import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
