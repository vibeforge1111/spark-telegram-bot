import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';

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

const originalPost = axios.post;
const originalGet = axios.get;
const originalEnv = {
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
  BOT_DEFAULT_TIER: process.env.BOT_DEFAULT_TIER,
  SPARK_AGENT_ACCESS_PROFILE: process.env.SPARK_AGENT_ACCESS_PROFILE,
  SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE,
  SPARK_CLI_COMMAND: process.env.SPARK_CLI_COMMAND,
  SPARK_CLI_PATH: process.env.SPARK_CLI_PATH,
  SPARK_GATEWAY_STATE_DIR: process.env.SPARK_GATEWAY_STATE_DIR,
  SPARK_HARNESS_CORE_LEDGER_PATH: process.env.SPARK_HARNESS_CORE_LEDGER_PATH,
  SPARK_HOME: process.env.SPARK_HOME,
  PATH: process.env.PATH
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

function restoreAxios(): void {
  (axios as any).post = originalPost;
  (axios as any).get = originalGet;
}

function removeTempRoot(tempRoot: string): void {
  try {
    rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    if (process.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EPERM') {
      console.warn(`warning - left temp access repair dir after Windows handle delay: ${tempRoot}`);
      return;
    }
    throw error;
  }
}

function loadFreshIndexModule(): any {
  const sourceRoot = `${path.sep}src${path.sep}`;
  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.includes(sourceRoot)) {
      delete require.cache[cacheKey];
    }
  }
  return require('../src/index');
}

function psSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function writeSparkShim(input: {
  binDir: string;
  callsPath: string;
  statusPath: string;
  finalStatus: Record<string, unknown>;
}): string {
  const setupReply = JSON.stringify({
    ok: true,
    effective_access_level: 4,
    recommended: { id: 'spark_workspace' },
    next: 'spark access status'
  });

  if (process.platform === 'win32') {
    const sparkShim = path.join(input.binDir, 'spark.ps1');
    writeFileSync(
      sparkShim,
      [
        'param([Parameter(ValueFromRemainingArguments=$true)][string[]]$SparkArgs)',
        `$callsPath = ${psSingleQuoted(input.callsPath)}`,
        `$statusPath = ${psSingleQuoted(input.statusPath)}`,
        'Add-Content -LiteralPath $callsPath -Value ($SparkArgs -join " ")',
        'if ($SparkArgs.Count -ge 3 -and $SparkArgs[0] -eq "access" -and $SparkArgs[1] -eq "status" -and $SparkArgs[2] -eq "--json") {',
        '  Get-Content -Raw -LiteralPath $statusPath',
        '  exit 0',
        '}',
        'if ($SparkArgs.Count -ge 3 -and $SparkArgs[0] -eq "access" -and $SparkArgs[1] -eq "setup" -and $SparkArgs[2] -eq "--json") {',
        `$finalStatus = @'\n${JSON.stringify(input.finalStatus)}\n'@`,
        '  Set-Content -LiteralPath $statusPath -Value $finalStatus -NoNewline',
        `$setupReply = @'\n${setupReply}\n'@`,
        '  Write-Output $setupReply',
        '  exit 0',
        '}',
        'Write-Error ("unexpected spark command: " + ($SparkArgs -join " "))',
        'exit 1',
        ''
      ].join('\n')
    );
    return sparkShim;
  }

  const sparkShim = path.join(input.binDir, 'spark');
  writeFileSync(
    sparkShim,
    [
      '#!/bin/sh',
      `echo "$*" >> "${input.callsPath.replace(/"/g, '\\"')}"`,
      'if [ "$1" = "access" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then',
      `  cat "${input.statusPath.replace(/"/g, '\\"')}"`,
      '  exit 0',
      'fi',
      'if [ "$1" = "access" ] && [ "$2" = "setup" ] && [ "$3" = "--json" ]; then',
      `  cat > "${input.statusPath.replace(/"/g, '\\"')}" <<'JSON'`,
      JSON.stringify(input.finalStatus),
      'JSON',
      `  echo '${setupReply}'`,
      '  exit 0',
      'fi',
      'echo "unexpected spark command: $*" >&2',
      'exit 1',
      ''
    ].join('\n')
  );
  chmodSync(sparkShim, 0o755);
  return sparkShim;
}

function fakeCtx(chatId: number, fromId: number, messageId: number, text: string, replies: string[]) {
  return {
    chat: { id: chatId },
    from: { id: fromId, username: 'cem' },
    message: { message_id: messageId, text },
    update: { update_id: messageId },
    sendChatAction: async (_action: string) => {},
    reply: async (reply: string) => {
      replies.push(reply);
    }
  };
}

async function runAccessRepairScenario(input: {
  name: string;
  initialWritable: boolean;
  firstText: string;
  includeDidYou?: boolean;
  runnerBlocked?: boolean;
}): Promise<{ replies: string[]; sparkCalls: string; spawnerCalls: Array<{ url: string; body: unknown }> }> {
  restoreAxios();
  restoreEnv();
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), `spark-access-repair-${input.name}-`));
  const binDir = path.join(tempRoot, 'bin');
  const statusPath = path.join(tempRoot, 'spark-access-status.json');
  const callsPath = path.join(tempRoot, 'spark-calls.log');
  const stateDir = input.runnerBlocked ? path.join(tempRoot, 'state-as-file') : tempRoot;
  mkdirSync(binDir, { recursive: true });
  if (input.runnerBlocked) {
    writeFileSync(stateDir, 'not a directory');
  }

  const finalStatus = {
    access_level: 4,
    effective_access_level: 4,
    workspace_path: path.join(tempRoot, 'workspace'),
    workspace_preflight: { writable: true, detail: 'Workspace write/delete preflight passed.' },
    recommended: { id: 'spark_workspace' },
    level5: { activation_state: 'blocked', service_enabled: false },
    state_machine: { requested_access_level: 4, effective_access_level: 4 }
  };
  writeFileSync(statusPath, JSON.stringify({
    ...finalStatus,
    workspace_preflight: {
      writable: input.initialWritable,
      detail: input.initialWritable
        ? 'Workspace write/delete preflight passed.'
        : 'Workspace is not created yet. Run `spark access setup`.'
    }
  }));
  const sparkCommand = writeSparkShim({ binDir, callsPath, statusPath, finalStatus });

  process.env.ADMIN_TELEGRAM_IDS = '1000000001';
  process.env.BOT_DEFAULT_TIER = 'base';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_CLI_COMMAND = sparkCommand;
  process.env.SPARK_GATEWAY_STATE_DIR = stateDir;
  process.env.SPARK_HARNESS_CORE_LEDGER_PATH = path.join(tempRoot, 'harness-ledger.jsonl');
  process.env.PATH = `${binDir}${path.delimiter}${originalEnv.PATH || ''}`;

  const spawnerCalls: Array<{ url: string; body: unknown }> = [];
  // The model router and memory proposer issue LLM completion calls through axios.post (z.ai,
  // anthropic, ollama). Those are not Spawner missions. Count only non-LLM POSTs so this measures
  // "did access repair launch a mission?", not "did any HTTP POST fire?". A real Spawner/mission
  // POST still gets counted, so the no-mission assertions stay honest.
  const isLlmCompletionPost = (url: string): boolean =>
    /\/(chat\/completions|v1\/messages|api\/(chat|generate))(\?|$)/i.test(url);
  (axios as any).post = async (url: string, body: unknown) => {
    if (!isLlmCompletionPost(String(url))) {
      spawnerCalls.push({ url, body });
    }
    return { data: { success: true, missionId: 'should-not-exist' } };
  };
  (axios as any).get = async () => ({ data: { success: true } });

  try {
    const replies: string[] = [];
    const indexModule: any = loadFreshIndexModule();
    await indexModule.handleTextMessage(fakeCtx(1000000001, 1000000001, 700, input.firstText, replies));
    if (input.includeDidYou) {
      await indexModule.handleTextMessage(fakeCtx(1000000001, 1000000001, 701, 'did you', replies));
    }
    const sparkCalls = existsSync(callsPath) ? readFileSync(callsPath, 'utf-8') : '';
    return { replies, sparkCalls, spawnerCalls };
  } finally {
    restoreAxios();
    restoreEnv();
    removeTempRoot(tempRoot);
  }
}

void (async () => {
  await test('access repair uses existing writable workspace without creating a mission', async () => {
    const result = await runAccessRepairScenario({
      name: 'already-writable',
      initialWritable: true,
      firstText: 'lets make it beyond read only then',
      includeDidYou: true
    });
    const reply = result.replies.join('\n');
    assert.match(reply, /access repair, not a Spawner mission/i);
    assert.match(reply, /safe Spark workspace was already writable/i);
    assert.match(reply, /Spark workspace writable: yes/i);
    assert.doesNotMatch(reply, /I will run that through Codex now/i);
    assert.doesNotMatch(reply, /Canvas:|Kanban:|Mission board:/i);
    assert.doesNotMatch(result.sparkCalls, /access setup --json/);
    assert.equal(result.spawnerCalls.length, 0);
  });

  await test('access repair reports setup need without auto-running workspace setup', async () => {
    const result = await runAccessRepairScenario({
      name: 'setup-needed',
      initialWritable: false,
      firstText: 'make it writable'
    });
    const reply = result.replies.join('\n');
    assert.match(reply, /access repair, not a Spawner mission/i);
    assert.match(reply, /did not run setup from natural text/i);
    assert.match(reply, /\/access_setup/);
    assert.match(reply, /Spark workspace writable: no/i);
    assert.doesNotMatch(reply, /I will run that through Codex now/i);
    assert.doesNotMatch(reply, /Canvas:|Kanban:|Mission board:/i);
    assert.match(result.sparkCalls, /access status --json/);
    assert.doesNotMatch(result.sparkCalls, /access setup --json/);
    assert.equal(result.spawnerCalls.length, 0);
  });

  await test('access repair refuses direct edit claims when Telegram runner is not writable', async () => {
    const result = await runAccessRepairScenario({
      name: 'runner-blocked',
      initialWritable: true,
      firstText: 'lets make it beyond read only then',
      runnerBlocked: true
    });
    const reply = result.replies.join('\n');
    assert.match(reply, /access repair, not a Spawner mission/i);
    assert.match(reply, /Spark workspace writable: yes/i);
    assert.match(reply, /Telegram runner writable: no/i);
    assert.match(reply, /will not claim direct edits from this Telegram runner until the writable lane proves it/i);
    assert.doesNotMatch(reply, /Spark can now work inside the safe workspace/i);
    assert.equal(result.spawnerCalls.length, 0);
  });
})();
