import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ConversationMemory } from '../src/conversation';
import { resetJsonStateForTests } from '../src/jsonState';

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function withTempState(fn: (dir: string) => Promise<void>): Promise<void> {
  const previous = process.env.SPARK_GATEWAY_STATE_DIR;
  const dir = mkdtempSync(path.join(tmpdir(), 'spark-telegram-retention-test-'));
  process.env.SPARK_GATEWAY_STATE_DIR = dir;
  resetJsonStateForTests();
  try {
    await fn(dir);
  } finally {
    resetJsonStateForTests();
    if (previous === undefined) delete process.env.SPARK_GATEWAY_STATE_DIR;
    else process.env.SPARK_GATEWAY_STATE_DIR = previous;
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await test('bounds every persisted per-user memory map on writes', async () => {
    await withTempState(async () => {
      assert.throws(() => new ConversationMemory({ maxUsers: 0 }), /invalid conversation retention limit/i);
      assert.throws(() => new ConversationMemory({ maxUsers: 10_001 }), /invalid conversation retention limit/i);
      const memory = new ConversationMemory({ maxUsers: 3 });
      for (let id = 1; id <= 4; id += 1) {
        const user = { id };
        await memory.remember(user, `message-${id}`);
        await memory.learnAboutUser(user, `note-${id}`);
        await memory.recordInterruptedTask(user, { message: `task-${id}`, failure: `failure-${id}` });
      }

      assert.deepEqual(await memory.getRetentionDiagnostics(), {
        maxUsers: 3,
        userCounts: { recent: 3, notes: 3, interrupted: 3, frame: 3 },
        evictionCounts: { recent: 1, notes: 1, interrupted: 1, frame: 1 }
      });
      assert.equal(await memory.getContext({ id: 1 }, 'old user'), 'No prior memories.');
      assert.equal(await memory.getPendingTaskRecovery({ id: 1 }), null);
      assert.match(await memory.getContext({ id: 4 }, 'active user'), /message-4/);
    });
  });

  await test('refreshes write recency before choosing the oldest user to evict', async () => {
    await withTempState(async () => {
      const memory = new ConversationMemory({ maxUsers: 3 });
      for (let id = 1; id <= 3; id += 1) await memory.learnAboutUser({ id }, `note-${id}`);
      await memory.learnAboutUser({ id: 1 }, 'note-1-refreshed');
      await memory.learnAboutUser({ id: 4 }, 'note-4');

      assert.match(await memory.getContext({ id: 1 }, 'active'), /note-1-refreshed/);
      assert.equal(await memory.getContext({ id: 2 }, 'oldest'), 'No prior memories.');
      assert.match(await memory.getContext({ id: 4 }, 'newest'), /note-4/);
    });
  });

  await test('repairs oversized persisted snapshots before serving memory', async () => {
    await withTempState(async (dir) => {
      const ids = [1, 2, 3, 4, 5];
      const entries = <T>(value: (id: number) => T) => Object.fromEntries(ids.map((id) => [String(id), value(id)]));
      const statePath = path.join(dir, '.spark-conversation-memory.json');
      writeFileSync(statePath, JSON.stringify({
        recentByUser: entries((id) => [`User: message-${id}`]),
        notesByUser: entries((id) => [`note-${id}`]),
        interruptedByUser: entries((id) => ({ message: `task-${id}`, failure: `failure-${id}`, recordedAt: `2026-07-19T00:00:0${id}.000Z` })),
        frameStateByUser: entries(() => ({ hotTurns: [], warmSummary: '', artifacts: [] }))
      }), 'utf8');

      const memory = new ConversationMemory({ maxUsers: 3 });
      assert.deepEqual(await memory.getRetentionDiagnostics(), {
        maxUsers: 3,
        userCounts: { recent: 3, notes: 3, interrupted: 3, frame: 3 },
        evictionCounts: { recent: 2, notes: 2, interrupted: 2, frame: 2 }
      });

      const database = new DatabaseSync(path.join(dir, '.spark-gateway-state.db'), { readOnly: true });
      const row = database.prepare('SELECT json_value FROM gateway_state WHERE state_key = ?').get(statePath) as { json_value: string };
      database.close();
      const repaired = JSON.parse(row.json_value);
      for (const bucket of ['recentByUser', 'notesByUser', 'interruptedByUser', 'frameStateByUser']) {
        assert.deepEqual(Object.keys(repaired[bucket]), ['3', '4', '5'], bucket);
      }
    });
  });
}

void main();
