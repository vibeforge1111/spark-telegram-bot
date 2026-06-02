import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { formatChipCreateProcessError, parseChipCreateJson } from '../src/chipCreate';
import {
  buildChipCreateMissionContext,
  ChipCreateMissionReporter,
  type MissionControlEvent,
} from '../src/missionControl';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('parses successful chip create JSON', () => {
    const result = parseChipCreateJson(JSON.stringify({
      ok: true,
      chip_key: 'domain-chip-ascii-art',
      chip_path: 'C:\\Users\\USER\\.spark\\chips\\domain-chip-ascii-art',
      router_invokable: true,
      warnings: [],
      error: null,
    }));

    assert.deepEqual(result, {
      ok: true,
      chipKey: 'domain-chip-ascii-art',
      chipPath: 'C:\\Users\\USER\\.spark\\chips\\domain-chip-ascii-art',
      routerInvokable: true,
      warnings: [],
      error: undefined,
    });
  });

  await test('redacts local paths from failed Python stdout JSON errors', () => {
    const message = formatChipCreateProcessError({
      message: 'Command failed: python -m spark_intelligence.cli chips create',
      stdout: JSON.stringify({
        ok: false,
        chip_key: null,
        chip_path: null,
        router_invokable: false,
        warnings: [],
        error: 'chip-labs root not found: C:\\Users\\USER\\.spark\\domain-chip-labs',
      }),
      stderr: '',
    });

    assert.equal(message, 'chip-labs root not found: <local-path>');
    assert.doesNotMatch(message, /C:\\Users\\USER/);
  });

  await test('redacts local paths from chip create stderr fallbacks', () => {
    const message = formatChipCreateProcessError({
      message: 'Command failed: /Users/jumperz/.spark/bin/python -m spark_intelligence.cli chips create',
      stdout: '',
      stderr: 'failed to write /Users/jumperz/.spark/chips/domain-chip-failure/out.json',
    });

    assert.equal(message, 'Command failed: <local-path> -m spark_intelligence.cli chips create: failed to write <local-path>');
    assert.doesNotMatch(message, /\/Users\/jumperz/);
  });

  await test('telegram chip create failure reply redacts local paths', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'spark-chip-create-telegram-'));
    const previousEnv = {
      adminIds: process.env.ADMIN_TELEGRAM_IDS,
      allowedIds: process.env.ALLOWED_TELEGRAM_IDS,
      botToken: process.env.BOT_TOKEN,
      testMode: process.env.SPARK_BOT_TEST_MODE,
      python: process.env.SPARK_BUILDER_PYTHON,
      builderRepo: process.env.SPARK_BUILDER_REPO,
      builderHome: process.env.SPARK_BUILDER_HOME,
      outputDir: process.env.CHIP_CREATE_OUTPUT_DIR,
      chipLabsRoot: process.env.CHIP_LABS_ROOT,
      spawnerUrl: process.env.SPAWNER_UI_URL,
    };
    try {
      const fakePython = path.join(root, 'python');
      writeFileSync(fakePython, [
        '#!/bin/sh',
        'cat <<\'JSON\'',
        JSON.stringify({
          ok: false,
          chip_key: null,
          chip_path: null,
          router_invokable: false,
          warnings: [],
          error: 'chip-labs root not found: /Users/jumperz/.spark/domain-chip-labs',
        }),
        'JSON',
        ''
      ].join('\n'));
      chmodSync(fakePython, 0o755);

      process.env.ADMIN_TELEGRAM_IDS = '8900000001';
      process.env.ALLOWED_TELEGRAM_IDS = '8900000001';
      process.env.BOT_TOKEN = '0:chip-create-handler-test';
      process.env.SPARK_BOT_TEST_MODE = '1';
      process.env.SPARK_BUILDER_PYTHON = fakePython;
      process.env.SPARK_BUILDER_REPO = root;
      process.env.SPARK_BUILDER_HOME = path.join(root, 'builder-home');
      process.env.CHIP_CREATE_OUTPUT_DIR = path.join(root, 'chips');
      process.env.CHIP_LABS_ROOT = path.join(root, 'domain-chip-labs');
      process.env.SPAWNER_UI_URL = 'http://127.0.0.1:4174';

      const { handleChipCommand } = await import('../src/index');
      const replies: string[] = [];
      await handleChipCommand({
        from: { id: 8900000001, is_bot: false, first_name: 'Chip' },
        chat: { id: 8900000001, type: 'private' },
        message: { text: '/chip create path-safe failure chip' },
        sendChatAction: async () => undefined,
        reply: async (text: unknown) => {
          replies.push(String(text ?? ''));
          return { message_id: replies.length };
        },
      });

      assert.equal(replies[0], 'Scaffolding new domain chip from your brief...');
      assert.equal(replies[1], 'Chip create failed: chip-labs root not found: <local-path>');
      assert.doesNotMatch(replies.join('\n'), /\/Users\/jumperz/);
    } finally {
      if (previousEnv.adminIds === undefined) delete process.env.ADMIN_TELEGRAM_IDS;
      else process.env.ADMIN_TELEGRAM_IDS = previousEnv.adminIds;
      if (previousEnv.allowedIds === undefined) delete process.env.ALLOWED_TELEGRAM_IDS;
      else process.env.ALLOWED_TELEGRAM_IDS = previousEnv.allowedIds;
      if (previousEnv.botToken === undefined) delete process.env.BOT_TOKEN;
      else process.env.BOT_TOKEN = previousEnv.botToken;
      if (previousEnv.testMode === undefined) delete process.env.SPARK_BOT_TEST_MODE;
      else process.env.SPARK_BOT_TEST_MODE = previousEnv.testMode;
      if (previousEnv.python === undefined) delete process.env.SPARK_BUILDER_PYTHON;
      else process.env.SPARK_BUILDER_PYTHON = previousEnv.python;
      if (previousEnv.builderRepo === undefined) delete process.env.SPARK_BUILDER_REPO;
      else process.env.SPARK_BUILDER_REPO = previousEnv.builderRepo;
      if (previousEnv.builderHome === undefined) delete process.env.SPARK_BUILDER_HOME;
      else process.env.SPARK_BUILDER_HOME = previousEnv.builderHome;
      if (previousEnv.outputDir === undefined) delete process.env.CHIP_CREATE_OUTPUT_DIR;
      else process.env.CHIP_CREATE_OUTPUT_DIR = previousEnv.outputDir;
      if (previousEnv.chipLabsRoot === undefined) delete process.env.CHIP_LABS_ROOT;
      else process.env.CHIP_LABS_ROOT = previousEnv.chipLabsRoot;
      if (previousEnv.spawnerUrl === undefined) delete process.env.SPAWNER_UI_URL;
      else process.env.SPAWNER_UI_URL = previousEnv.spawnerUrl;
      rmSync(root, { recursive: true, force: true });
    }
  });

  await test('emits mission-control lifecycle events for chip creation', async () => {
    const previousUrl = process.env.SPAWNER_UI_URL;
    process.env.SPAWNER_UI_URL = 'http://127.0.0.1:4174';
    try {
      const events: MissionControlEvent[] = [];
      const context = buildChipCreateMissionContext('creates us cool images out of ASCII patterns');
      const reporter = new ChipCreateMissionReporter(context, async (_url, payload) => {
        events.push(payload);
      });

      await reporter.created();
      await reporter.taskStarted('task-scaffold', 'Scaffold Spark-compatible domain chip', ['domain-chip-creator']);
      await reporter.taskCompleted('task-scaffold', 'Scaffold Spark-compatible domain chip', {
        chipKey: 'domain-chip-ascii-art',
        routerInvokable: true,
      });
      await reporter.completed({ chipKey: 'domain-chip-ascii-art' });

      assert.equal(events.length, 4);
      assert.match(events[0].missionId, /^spark-chip-create-/);
      assert.equal(events[0].type, 'mission_created');
      assert.equal(events[1].taskId, 'task-scaffold');
      assert.equal(events[2].type, 'task_completed');
      assert.equal(events[3].type, 'mission_completed');
      assert.deepEqual(events[0].data?.plannedTasks, context.plannedTasks);
    } finally {
      if (previousUrl === undefined) delete process.env.SPAWNER_UI_URL;
      else process.env.SPAWNER_UI_URL = previousUrl;
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
