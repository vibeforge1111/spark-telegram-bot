import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

function writeSparkCliStub(root: string): string {
  const binDir = path.join(root, 'bin');
  mkdirSync(binDir, { recursive: true });
  if (process.platform === 'win32') {
    const filePath = path.join(binDir, 'spark.cmd');
    writeFileSync(filePath, [
      '@echo off',
      'if "%1"=="live" if "%2"=="status" (',
      '  echo [OK] Spark Live is ready',
      '  echo [OK] spawner-ui: http://127.0.0.1:3333',
      '  echo [OK] spark-telegram-bot: polling',
      '  echo Telegram profiles: qa',
      '  echo LLM roles: chat=codex',
      '  exit /b 0',
      ')',
      'if "%1"=="verify" if "%2"=="--deep" (',
      '  echo Runtime processes are running under Spark supervision: spawner-ui, spark-telegram-bot.',
      '  exit /b 0',
      ')',
      'echo [OK] stub',
      'exit /b 0',
      ''
    ].join('\r\n'), 'utf8');
    return filePath;
  }

  const filePath = path.join(binDir, 'spark');
  writeFileSync(filePath, [
    '#!/usr/bin/env sh',
    'if [ "$1" = "live" ] && [ "$2" = "status" ]; then',
    '  echo "[OK] Spark Live is ready"',
    '  echo "[OK] spawner-ui: http://127.0.0.1:3333"',
    '  echo "[OK] spark-telegram-bot: polling"',
    '  echo "Telegram profiles: qa"',
    '  echo "LLM roles: chat=codex"',
    '  exit 0',
    'fi',
    'if [ "$1" = "verify" ] && [ "$2" = "--deep" ]; then',
    '  echo "Runtime processes are running under Spark supervision: spawner-ui, spark-telegram-bot."',
    '  exit 0',
    'fi',
    'echo "[OK] stub"',
    ''
  ].join('\n'), { encoding: 'utf8', mode: 0o755 });
  return filePath;
}

function writeFailingSparkCliStub(root: string): string {
  const binDir = path.join(root, 'bin');
  mkdirSync(binDir, { recursive: true });
  if (process.platform === 'win32') {
    const filePath = path.join(binDir, 'spark.cmd');
    writeFileSync(filePath, [
      '@echo off',
      'echo stale temp spark shim 1>&2',
      'exit /b 9',
      ''
    ].join('\r\n'), 'utf8');
    return filePath;
  }

  const filePath = path.join(binDir, 'spark');
  writeFileSync(filePath, [
    '#!/usr/bin/env sh',
    'echo "stale temp spark shim" >&2',
    'exit 9',
    ''
  ].join('\n'), { encoding: 'utf8', mode: 0o755 });
  return filePath;
}

function fakeCtx(text: string, replies: string[]): any {
  const user = { id: 8900000001, is_bot: false, first_name: 'RuntimeStatus', username: 'runtime_status' };
  const chat = { id: 8900000001, type: 'private', first_name: 'RuntimeStatus', username: 'runtime_status' };
  return {
    update: {
      update_id: 1,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat,
        from: user,
        text
      }
    },
    from: user,
    chat,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat,
      from: user,
      text
    },
    sendChatAction: async () => undefined,
    reply: async (reply: unknown) => {
      replies.push(String(reply ?? ''));
      return { message_id: replies.length + 1 };
    },
    telegram: {
      sendMessage: async (_chatId: unknown, reply: unknown) => {
        replies.push(String(reply ?? ''));
        return { message_id: replies.length + 1 };
      }
    }
  };
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-runtime-status-natural-'));
const oldPath = process.env.PATH || '';
process.env.SPARK_SKIP_ENV_OVERRIDE = '1';
process.env.SPARK_BOT_TEST_MODE = '1';
process.env.BOT_TOKEN = '0:runtime-status-natural-test';
process.env.ADMIN_TELEGRAM_IDS = '8900000001';
process.env.ALLOWED_TELEGRAM_IDS = '8900000001';
process.env.SPARK_HOME = tempRoot;
process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
const sparkCliStub = writeSparkCliStub(tempRoot);
process.env.PATH = `${path.dirname(sparkCliStub)}${path.delimiter}${oldPath}`;
process.env.SPARK_AGENT_PERSONA_BUILDER_SYNC = '0';
process.env.SPARK_BUILDER_BRIDGE_MODE = 'off';
process.env.SPARK_TELEGRAM_CHAT_STREAMING = '0';

process.on('exit', () => {
  try {
    rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; a locked SQLite handle should not fail this test.
  }
});

async function main(): Promise<void> {
  await test('direct natural health prompt answers from Spark live status', async () => {
    const { handleTextMessage } = await import('../src/index');
    const replies: string[] = [];

    await handleTextMessage(fakeCtx('are you healthy right now?', replies));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Spark is healthy right now\./);
    assert.match(replies[0], /fresh runtime state here, not memory/);
    assert.doesNotMatch(replies[0], /setup conversation|\/access_setup|Owner setup/i);
  });

  await test('explicit short health prompt uses compact Telegram status shape', async () => {
    const { handleTextMessage } = await import('../src/index');
    const replies: string[] = [];

    await handleTextMessage(fakeCtx('Is Spark healthy right now? Keep it short.', replies));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Spark is healthy right now\./);
    assert.match(replies[0], /Fresh runtime state, not memory/i);
    assert.match(replies[0], /Spawner reachable, Telegram polling, Mission Control ready\./);
    assert.doesNotMatch(replies[0], /Live loop|Raw proof|No repair action needed/i);
    assert.ok(
      replies[0].split(/\n/).filter((line) => line.trim()).length <= 2,
      `expected compact reply, got: ${replies[0]}`
    );
  });

  await test('current live-state wording stays on the same authoritative path', async () => {
    const { handleTextMessage } = await import('../src/index');
    const replies: string[] = [];

    await handleTextMessage(fakeCtx('what is your current live state?', replies));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Spark is healthy right now\./);
    assert.match(replies[0], /Spawner: reachable\./);
    assert.match(replies[0], /Telegram: polling\./);
  });

  await test('check whether Spark is healthy stays read-only and does not repair', async () => {
    const { handleTextMessage } = await import('../src/index');
    const replies: string[] = [];

    await handleTextMessage(fakeCtx('Check whether Spark is healthy, but do not repair anything.', replies));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Spark is healthy right now\./);
    assert.match(replies[0], /fresh runtime state here, not memory/);
    assert.match(replies[0], /No repair action needed right now\./);
    assert.doesNotMatch(replies[0], /setup conversation|\/access_setup|Owner setup/i);
  });

  await test('healthy build ideation is not hijacked by runtime status', async () => {
    const { llm } = await import('../src/llm');
    const { handleTextMessage } = await import('../src/index');
    const replies: string[] = [];
    const originalChat = llm.chat;
    (llm as any).chat = async () => 'Healthy build ideas can stay conversational.';
    try {
      await handleTextMessage(fakeCtx('what else would be healthy to build for updates/upgrades besides the ledger?', replies));
    } finally {
      (llm as any).chat = originalChat;
    }

    assert.equal(replies.length, 1);
    assert.equal(replies[0], 'Healthy build ideas can stay conversational.');
    assert.doesNotMatch(replies[0], /Spark is healthy right now|fresh runtime state here/);
  });

  await test('Spark home wrapper outranks stale PATH spark shims', async () => {
    const { handleTextMessage } = await import('../src/index');
    const staleRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-runtime-stale-path-'));
    const staleCli = writeFailingSparkCliStub(staleRoot);
    const previousPath = process.env.PATH || '';
    process.env.PATH = `${path.dirname(staleCli)}${path.delimiter}${oldPath}`;
    const replies: string[] = [];
    try {
      await handleTextMessage(fakeCtx('I am mentioning build and mission, but do not start anything. What is the current Spark risk profile?', replies));
    } finally {
      process.env.PATH = previousPath;
      rmSync(staleRoot, { recursive: true, force: true });
    }

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Current Spark risk profile: low\./);
    assert.doesNotMatch(replies[0], /stale temp spark shim|Current Spark risk profile: unknown/i);
    assert.match(replies[0], /I did not start a mission or repair action\./);
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
