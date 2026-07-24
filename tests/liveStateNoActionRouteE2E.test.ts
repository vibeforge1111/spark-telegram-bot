import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';

type AsyncTest = () => Promise<void> | void;
type CapturedCall = { url: string; body: any };

const originalPost = axios.post;
const originalGet = axios.get;
const originalEnv = {
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
  BOT_DEFAULT_TIER: process.env.BOT_DEFAULT_TIER,
  SPARK_AGENT_ACCESS_PROFILE: process.env.SPARK_AGENT_ACCESS_PROFILE,
  SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE,
  SPAWNER_UI_PUBLIC_URL: process.env.SPAWNER_UI_PUBLIC_URL,
  SPAWNER_UI_URL: process.env.SPAWNER_UI_URL
};

async function test(name: string, fn: AsyncTest): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function restore(): void {
  (axios as any).post = originalPost;
  (axios as any).get = originalGet;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

function makeFakeCtx(replies: string[], replyExtras: any[]) {
  return {
    chat: { id: 8319079055, type: 'private' },
    from: { id: 8319079055, username: 'cem' },
    message: { message_id: 607, text: '' },
    update: { update_id: 607 },
    sendChatAction: async (_action: string) => {},
    reply: async (text: string, extra?: any) => {
      replies.push(text);
      replyExtras.push(extra);
    }
  };
}

function installSparkLiveStatusShim(): { cleanup: () => void } {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-live-state-noaction-'));
  const binDir = path.join(tempRoot, 'bin');
  const oldPath = process.env.PATH || '';
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
      '  echo "[OK] spawner-ui: Spawner UI healthy: http://127.0.0.1:3333 | 10 providers listed | 3 configured | workspace=<spark-home>/workspaces/.health-smoke"',
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
  process.env.PATH = `${binDir}${path.delimiter}${oldPath}`;
  return {
    cleanup: () => {
      process.env.PATH = oldPath;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  };
}

async function run(): Promise<void> {
  await test('connection-check no-action live-state prompt stays fresh-state read-only', async () => {
    restore();
    Object.assign(process.env, {
      ADMIN_TELEGRAM_IDS: '8319079055',
      BOT_DEFAULT_TIER: 'base',
      SPARK_BOT_TEST_MODE: '1'
    });
    const shim = installSparkLiveStatusShim();
    try {
      const captured: CapturedCall[] = [];
      (axios as any).post = async (url: string, body: any) => {
        captured.push({ url, body });
        return { data: { success: true } };
      };

      const replies: string[] = [];
      const replyExtras: any[] = [];
      const ctx = makeFakeCtx(replies, replyExtras);
      ctx.message.text = 'Connection check only: can you reply with the current live state? Do not start, create, run, benchmark, or repair anything.';
      const indexModule: any = await import('../src/index');
      await indexModule.handleTextMessage(ctx);

      const reply = replies[0] || '';
      assert.match(reply, /Spark is healthy right now/);
      assert.match(reply, /fresh runtime state.*not memory/i);
      assert.match(reply, /Spawner is reachable, Telegram is polling, and Mission Control is ready/i);
      assert.doesNotMatch(reply, /Live loop|^\s*•/m);
      assert.equal(captured.length, 0, 'connection-check live-state prompt must not launch or post work');
      assert.equal(replyExtras[0]?.__sparkTraceContext?.route, 'fresh_state.live_status');
      assert.doesNotMatch(reply, /Choose the specialization path|benchmark level|level 1-10|Mission:|Provider:|Move:|Status:/i);
    } finally {
      shim.cleanup();
      restore();
    }
  });

  await test('benchmark pack staging clarification survives do-not-run constraint', async () => {
    restore();
    Object.assign(process.env, {
      ADMIN_TELEGRAM_IDS: '8319079055',
      BOT_DEFAULT_TIER: 'base',
      SPAWNER_UI_URL: 'http://stub-spawner.test',
      SPAWNER_UI_PUBLIC_URL: 'http://stub-spawner.test',
      SPARK_AGENT_ACCESS_PROFILE: 'developer',
      SPARK_BOT_TEST_MODE: '1'
    });

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { ok: true, missionId: 'mission-should-not-start', taskCount: 3 } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const ctx = makeFakeCtx(replies, []);
    ctx.message.text = 'create a benchmark pack, but do not run it yet';
    const indexModule: any = await import('../src/index');
    await indexModule.handleTextMessage(ctx);

    assert.equal(captured.length, 0, 'benchmark staging clarification must not run work');
    assert.match(replies.join('\n'), /benchmark level first/i);
    assert.match(replies.join('\n'), /1-10/);
    assert.doesNotMatch(replies.join('\n'), /Mission:/);
  });
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(restore);
