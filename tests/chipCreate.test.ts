import assert from 'node:assert/strict';
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

  await test('extracts JSON error from failed Python stdout', () => {
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

    assert.equal(message, 'chip-labs root not found: C:\\Users\\USER\\.spark\\domain-chip-labs');
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
