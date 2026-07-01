import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatChipLoopProcessError, runChipLoop } from '../src/chipLoop';

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
  await test('formats raw Builder loop process errors for Telegram', () => {
    const error = new Error(
      'Command failed: /usr/local/bin/python3 -m spark_intelligence.cli loops run --home /Users/example/.spark/state --chip domain-chip-codebase-optimization-loop --rounds 1'
    ) as Error & { stderr?: string };
    error.stderr = 'Traceback (most recent call last):\n  File "/Users/example/private/chip-runner.py", line 1';

    const formatted = formatChipLoopProcessError(error);

    assert.match(formatted, /Builder loop runner failed before it could complete/i);
    assert.match(formatted, /stayed private/i);
    assert.doesNotMatch(formatted, /Command failed|spark_intelligence|--chip|--home|\/Users|\/usr\/local|Traceback/i);
  });

  await test('runChipLoop hides process internals when the runner fails before JSON', async () => {
    const originalEnv = { ...process.env };
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-chip-loop-raw-fail-'));
    const fakePython = path.join(tempDir, 'fake-python.js');
    try {
      mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      writeFileSync(fakePython, [
        '#!/usr/bin/env node',
        'process.stderr.write("Command failed: /usr/local/bin/python3 -m spark_intelligence.cli loops run --home /Users/example/.spark/state --chip domain-chip-codebase-optimization-loop --rounds 1\\n");',
        'process.exit(1);',
      ].join('\n'));
      chmodSync(fakePython, 0o755);
      process.env.SPARK_BUILDER_REPO = tempDir;
      process.env.SPARK_BUILDER_PYTHON = fakePython;
      process.env.SPARK_BUILDER_HOME = path.join(tempDir, 'state');

      const result = await runChipLoop('domain-chip-codebase-optimization-loop', 1);

      assert.equal(result.ok, false);
      assert.match(result.error || '', /Builder loop runner failed before it could complete/i);
      assert.doesNotMatch(result.error || '', /Command failed|spark_intelligence|--chip|--home|\/Users|\/usr\/local/i);
    } finally {
      for (const key of Object.keys(process.env)) {
        if (!(key in originalEnv)) delete process.env[key];
      }
      Object.assign(process.env, originalEnv);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
