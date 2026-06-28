import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function makeFakeCtx(chatId: number, fromId: number, messageId: number, replies: string[]) {
  return {
    chat: { id: chatId },
    from: { id: fromId, username: 'cem' },
    message: { message_id: messageId, text: '' },
    update: { update_id: messageId },
    sendChatAction: async (_action: string) => {},
    reply: async (text: string) => {
      replies.push(text);
    },
  };
}

function installSparkStatusShim(binDir: string, tempRoot: string): void {
  const statusPayload = JSON.stringify({
    ok: true,
    access_level: 5,
    effective_access_level: 5,
    level5: {
      activation_state: 'active_for_services',
      service_enabled: true,
      service_codex_sandbox: 'danger-full-access',
      effective_codex_sandbox: 'danger-full-access',
    },
    state_machine: {
      requested_access_level: 5,
      effective_access_level: 5,
      can_operate_whole_computer: true,
      service_can_operate_whole_computer: true,
    },
    workspace_preflight: { writable: true },
  });
  const sparkShim = path.join(binDir, 'spark');
  writeFileSync(
    sparkShim,
    [
      '#!/bin/sh',
      `printf '%s\\n' "$*" >> "${path.join(tempRoot, 'spark-command-log.txt').replace(/"/g, '\\"')}"`,
      'if [ "$1" = "access" ] && [ "$2" = "status" ] && [ "$3" = "--level" ] && [ "$4" = "5" ] && [ "$5" = "--json" ]; then',
      `  printf '%s\\n' '${statusPayload.replace(/'/g, "'\\''")}'`,
      '  exit 0',
      'fi',
      'echo "unexpected spark command: $*" >&2',
      'exit 1',
      '',
    ].join('\n'),
    'utf8'
  );
  chmodSync(sparkShim, 0o755);
}

async function run(): Promise<void> {
  const originalEnv = {
    ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
    BOT_DEFAULT_TIER: process.env.BOT_DEFAULT_TIER,
    PATH: process.env.PATH,
    SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE,
    SPARK_GATEWAY_STATE_DIR: process.env.SPARK_GATEWAY_STATE_DIR,
  };
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-natural-access-level5-'));
  const binDir = path.join(tempRoot, 'bin');
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_GATEWAY_STATE_DIR = tempRoot;
    mkdirSync(binDir, { recursive: true });
    installSparkStatusShim(binDir, tempRoot);
    process.env.PATH = `${binDir}${path.delimiter}${originalEnv.PATH || ''}`;

    const accessPolicy = await import('../src/accessPolicy');
    const indexModule: any = await import('../src/index');
    for (const [startingProfile, label] of [
      ['chat', 'one'],
      ['agent', 'three'],
      ['developer', 'four'],
    ] as const) {
      await accessPolicy.setSparkAccessProfile(615, startingProfile);
      writeFileSync(path.join(tempRoot, 'spark-command-log.txt'), '', 'utf8');

      const replies: string[] = [];
      const ctx = makeFakeCtx(615, 8319079055, 615, replies);
      ctx.message.text = `Change my access level from ${label} to five confirm`;
      await indexModule.handleTextMessage(ctx);

      const reply = replies.join('\n');
      const commandLog = readFileSync(path.join(tempRoot, 'spark-command-log.txt'), 'utf8');
      assert.match(reply, /Access level 5/i);
      assert.match(reply, /effective Codex sandbox|whole-computer work/i);
      assert.doesNotMatch(reply, /read-only|did not switch this chat/i);
      assert.match(commandLog, /access status --level 5 --json/);
      assert.doesNotMatch(commandLog, /access setup/);
      assert.equal(await accessPolicy.getSparkAccessProfile(615), 'operator');
    }
  } finally {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
      else (process.env as Record<string, string>)[key] = value;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().then(
  () => {
    console.log('ok - natural access raising from lower levels requires fresh Level 5 full-permission proof');
  },
  (error) => {
    console.error('not ok - natural access raising from lower levels requires fresh Level 5 full-permission proof');
    console.error(error);
    process.exitCode = 1;
  }
);
