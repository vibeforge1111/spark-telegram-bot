import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJsonFile, resetJsonStateForTests, writeJsonAtomic } from '../src/jsonState';

async function main(): Promise<void> {
  const root = mkdtempSync(path.join(os.tmpdir(), 'spark-json-state-init-'));
  const previousStateDir = process.env.SPARK_GATEWAY_STATE_DIR;
  try {
    resetJsonStateForTests();
    const blockingFile = path.join(root, 'not-a-directory');
    writeFileSync(blockingFile, 'blocked');
    process.env.SPARK_GATEWAY_STATE_DIR = path.join(blockingFile, 'child');

    await assert.rejects(
      writeJsonAtomic('state.json', { attempt: 1 }),
      /ENOTDIR|not a directory/i
    );

    process.env.SPARK_GATEWAY_STATE_DIR = path.join(root, 'recovered');
    await Promise.all(
      Array.from({ length: 24 }, (_, index) => writeJsonAtomic(`state-${index}.json`, { index }))
    );
    assert.deepEqual(await readJsonFile<{ index: number }>('state-23.json'), { index: 23 });
  } finally {
    resetJsonStateForTests();
    if (previousStateDir === undefined) delete process.env.SPARK_GATEWAY_STATE_DIR;
    else process.env.SPARK_GATEWAY_STATE_DIR = previousStateDir;
    rmSync(root, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
