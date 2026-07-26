import assert from 'node:assert/strict';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { probeTelegramRunnerWritability } from '../src/runnerPreflight';

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function withStateDir<T>(stateDir: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.SPARK_GATEWAY_STATE_DIR;
  process.env.SPARK_GATEWAY_STATE_DIR = stateDir;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.SPARK_GATEWAY_STATE_DIR;
    else process.env.SPARK_GATEWAY_STATE_DIR = previous;
  }
}

void (async () => {
  await test('runner preflight records writable state without leaving marker files', async () => {
    const stateDir = await mkdtemp(path.join(os.tmpdir(), 'spark-runner-preflight-'));
    try {
      const result = await withStateDir(stateDir, () => probeTelegramRunnerWritability());

      assert.equal(result.runnerWritable, 'yes');
      assert.match(result.runnerLabel, /state and temp preflight write\/read\/delete ok/);
      assert.equal(typeof result.checkedAt, 'string');
      assert.equal(typeof result.latencyMs, 'number');
      assert.equal(readdirSync(stateDir).filter((name) => name.startsWith('.spark-runner-preflight-')).length, 0);
    } finally {
      await rm(stateDir, { force: true, recursive: true });
    }
  });

  await test('runner preflight reports read-only when the state directory cannot be created', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'spark-runner-preflight-blocked-'));
    const blockedPath = path.join(parent, 'state-as-file');
    writeFileSync(blockedPath, 'not a directory');
    try {
      const result = await withStateDir(blockedPath, () => probeTelegramRunnerWritability());

      assert.equal(result.runnerWritable, 'no');
      assert.match(result.runnerLabel, /telegram bot runner read-only/);
      assert.ok(result.failureReason);
      assert.equal(existsSync(blockedPath), true);
    } finally {
      await rm(parent, { force: true, recursive: true });
    }
  });
})();
