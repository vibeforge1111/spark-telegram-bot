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

function shellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function writeSparkCliStub(root: string, browserUseStatus?: Record<string, unknown>): string {
  const binDir = path.join(root, 'bin');
  mkdirSync(binDir, { recursive: true });
  const browserUseStatusJson = browserUseStatus ? JSON.stringify(browserUseStatus) : null;
  if (process.platform === 'win32') {
    const filePath = path.join(binDir, 'spark.cmd');
    writeFileSync(filePath, [
      '@echo off',
      ...(browserUseStatusJson ? [
        'if "%1"=="browser-use" if "%2"=="status" if "%3"=="--json" (',
        `  echo ${browserUseStatusJson}`,
        '  exit /b 0',
        ')'
      ] : []),
      'if "%1"=="live" if "%2"=="status" (',
      '  echo [OK] Spark Live is ready',
      '  echo [OK] spawner-ui: http://127.0.0.1:3333',
      '  echo [OK] spark-telegram-bot: polling',
      '  echo Telegram profiles: qa',
      '  echo LLM roles: chat=codex',
      '  exit /b 0',
      ')',
      'if "%1"=="providers" if "%2"=="status" (',
      '  echo Spark LLM provider roles',
      '  echo [OK] chat    provider=codex model=gpt-5.5 auth=codex_oauth',
      '  echo           codex_client service_tier=fast reasoning=low',
      '  echo [OK] builder provider=codex model=gpt-5.5 auth=codex_oauth',
      '  echo           codex_client service_tier=fast reasoning=low',
      '  echo [OK] memory  provider=codex model=gpt-5.5 auth=codex_oauth',
      '  echo           codex_client service_tier=fast reasoning=low',
      '  echo [OK] mission provider=codex model=gpt-5.5 auth=codex_oauth',
      '  echo           codex_client service_tier=fast reasoning=low',
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
    ...(browserUseStatusJson ? [
      'if [ "$1" = "browser-use" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then',
      `  echo ${shellSingleQuoted(browserUseStatusJson)}`,
      '  exit 0',
      'fi'
    ] : []),
    'if [ "$1" = "live" ] && [ "$2" = "status" ]; then',
    '  echo "[OK] Spark Live is ready"',
    '  echo "[OK] spawner-ui: http://127.0.0.1:3333"',
    '  echo "[OK] spark-telegram-bot: polling"',
    '  echo "Telegram profiles: qa"',
    '  echo "LLM roles: chat=codex"',
    '  exit 0',
    'fi',
    'if [ "$1" = "providers" ] && [ "$2" = "status" ]; then',
    '  echo "Spark LLM provider roles"',
    '  echo "[OK] chat    provider=codex model=gpt-5.5 auth=codex_oauth"',
    '  echo "          codex_client service_tier=fast reasoning=low"',
    '  echo "[OK] builder provider=codex model=gpt-5.5 auth=codex_oauth"',
    '  echo "          codex_client service_tier=fast reasoning=low"',
    '  echo "[OK] memory  provider=codex model=gpt-5.5 auth=codex_oauth"',
    '  echo "          codex_client service_tier=fast reasoning=low"',
    '  echo "[OK] mission provider=codex model=gpt-5.5 auth=codex_oauth"',
    '  echo "          codex_client service_tier=fast reasoning=low"',
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

function fakeCtx(text: string, replies: string[], replyExtras?: any[]): any {
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
    reply: async (reply: unknown, extra?: any) => {
      replies.push(String(reply ?? ''));
      if (replyExtras) replyExtras.push(extra);
      return { message_id: replies.length + 1 };
    },
    telegram: {
      sendMessage: async (_chatId: unknown, reply: unknown, extra?: any) => {
        replies.push(String(reply ?? ''));
        if (replyExtras) replyExtras.push(extra);
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

  await test('current live-state wording stays on the same authoritative path', async () => {
    const { handleTextMessage } = await import('../src/index');
    const replies: string[] = [];

    await handleTextMessage(fakeCtx('what is your current live state?', replies));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Spark is healthy right now\./);
    assert.match(replies[0], /Spawner: reachable\./);
    assert.match(replies[0], /Telegram: polling\./);
  });

  await test('provider runtime config question answers from fresh provider status', async () => {
    const indexModule = await import('../src/index');
    const replies: string[] = [];
    const extras: any[] = [];

    await indexModule.handleTextMessage(fakeCtx('Provider truth QA: which provider, model, reasoning effort, and service tier are active for chat, builder, memory, and mission right now? Do not change anything.', replies, extras));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Provider runtime truth/);
    assert.match(replies[0], /fresh `spark providers status`, not memory/);
    assert.match(replies[0], /chat: codex \(gpt-5\.5\), reasoning=low, service_tier=fast/i);
    assert.match(replies[0], /builder: codex \(gpt-5\.5\), reasoning=low, service_tier=fast/i);
    assert.match(replies[0], /memory: codex \(gpt-5\.5\), reasoning=low, service_tier=fast/i);
    assert.match(replies[0], /mission: codex \(gpt-5\.5\), reasoning=low, service_tier=fast/i);
    assert.match(replies[0], /I did not change provider settings\./);
    assert.doesNotMatch(replies[0], /QA pass first|Add failing regressions|I will not start a mission/i);
    assert.deepEqual(extras[0]?.__sparkTraceContext, {
      turnId: 'telegram-update:1',
      telegramUpdateId: 1,
      route: 'spark.read_only_state.provider_runtime_config',
      command: 'read_only_state',
      replyKind: 'read_only_state'
    });

    const audit = indexModule.buildNodeOutboundAuditRecord(
      8900000001,
      replies[0],
      new Date('2026-06-16T00:00:00.000Z'),
      extras[0]?.__sparkTraceContext
    );
    assert.equal(audit.trace_context_present, true);
    assert.equal(audit.route, 'spark.read_only_state.provider_runtime_config');
    assert.equal(audit.command, 'read_only_state');
    assert.equal(audit.reply_kind, 'read_only_state');
  });

  await test('provider role status wording also answers from fresh provider status', async () => {
    const indexModule = await import('../src/index');
    const replies: string[] = [];
    const extras: any[] = [];

    await indexModule.handleTextMessage(fakeCtx('Quick unrelated check: are the chat, builder, memory, and mission roles still Codex low fast on this device?', replies, extras));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Provider runtime truth/);
    assert.match(replies[0], /fresh `spark providers status`, not memory/);
    assert.match(replies[0], /chat: codex \(gpt-5\.5\), reasoning=low, service_tier=fast/i);
    assert.match(replies[0], /mission: codex \(gpt-5\.5\), reasoning=low, service_tier=fast/i);
    assert.deepEqual(extras[0]?.__sparkTraceContext, {
      turnId: 'telegram-update:1',
      telegramUpdateId: 1,
      route: 'spark.read_only_state.provider_runtime_config',
      command: 'read_only_state',
      replyKind: 'read_only_state'
    });
  });

  await test('build-context recall reply carries trace metadata', async () => {
    const indexModule = await import('../src/index');
    const { conversation } = await import('../src/conversation');
    const replies: string[] = [];
    const extras: any[] = [];
    const user = { id: 8900000001, is_bot: false, first_name: 'RuntimeStatus', username: 'runtime_status' };

    await conversation.remember(
      user,
      'Natural context QA setup: I am shaping a quiet planning app called Trace Harbor. The direction is one screen, warm wording, and only three visible controls.'
    );
    await indexModule.handleTextMessage(fakeCtx('Where were we on Trace Harbor now?', replies, extras));

    assert.equal(replies.length, 1);
    assert.match(replies[0], /Trace Harbor/);
    assert.match(replies[0], /recent conversation context, not durable memory/i);
    assert.deepEqual(extras[0]?.__sparkTraceContext, {
      turnId: 'telegram-update:1',
      telegramUpdateId: 1,
      route: 'build_context.recall',
      command: 'build_context.recall',
      replyKind: 'build_context_recall'
    });
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

  await test('browser-use availability reads owner status before stale probe receipts', async () => {
    const indexModule = await import('../src/index');
    writeSparkCliStub(tempRoot, {
      ok: false,
      status: 'installed_unproven',
      proof_fresh: false,
      last_failure_reason: 'browser-use proof receipt is stale; rerun spark browser-use probe.',
      next_action: 'Run spark browser-use probe to create a fresh proof receipt.',
      proven_scope: ['browser-use doctor', 'public page open', 'page state read', 'screenshot capture'],
      unproven_scope: ['logged-in pages', 'cookies/profile reuse', 'Spawner browser automation']
    });
    indexModule.__setEvidenceAnswerComposerForTest(async () => '');
    const replies: string[] = [];
    const extras: any[] = [];
    try {
      await indexModule.handleTextMessage(fakeCtx('Tell me whether browser-use is currently available, but do not open a browser.', replies, extras));
    } finally {
      indexModule.__setEvidenceAnswerComposerForTest(null);
      writeSparkCliStub(tempRoot);
    }

    assert.equal(replies.length, 1);
    assert.match(replies[0], /<b>Browser-use is not currently proven ready\.<\/b>/);
    assert.match(replies[0], /<code>installed_unproven<\/code>/);
    assert.match(replies[0], /spark browser-use probe/);
    assert.doesNotMatch(replies[0], /just proved|opened a browser from this Telegram turn as proof/i);
    assert.equal(extras[0]?.parse_mode, 'HTML');
  });

  await test('browser-use availability can say scoped ready only from fresh owner proof', async () => {
    const indexModule = await import('../src/index');
    writeSparkCliStub(tempRoot, {
      ok: true,
      status: 'ready',
      proof_fresh: true,
      proofs: ['doctor', 'public_page_open', 'state_read', 'screenshot_capture'],
      proven_scope: ['browser-use doctor', 'public page open', 'page state read', 'screenshot capture'],
      unproven_scope: ['logged-in pages', 'cookies/profile reuse', 'sensitive click workflows', 'Spawner browser automation']
    });
    indexModule.__setEvidenceAnswerComposerForTest(async () => '');
    const replies: string[] = [];
    const extras: any[] = [];
    try {
      await indexModule.handleTextMessage(fakeCtx('Can you prove browser-use is available right now without opening a browser?', replies, extras));
    } finally {
      indexModule.__setEvidenceAnswerComposerForTest(null);
      writeSparkCliStub(tempRoot);
    }

    assert.equal(replies.length, 1);
    assert.match(replies[0], /<b>Browser-use is currently proven for the scoped lane\.<\/b>/);
    assert.match(replies[0], /public page open/);
    assert.match(replies[0], /Still unproven: .*logged-in pages/);
    assert.match(replies[0], /I did not open a browser from this Telegram turn\./);
    assert.equal(extras[0]?.parse_mode, 'HTML');
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
