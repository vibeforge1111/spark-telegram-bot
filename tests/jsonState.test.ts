import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  readJsonFile,
  resetJsonStateForTests,
  resolveStatePath,
  writeJsonAtomic
} from '../src/jsonState';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function withTempState(fn: () => Promise<void>): Promise<void> {
  const previousStateDir = process.env.SPARK_GATEWAY_STATE_DIR;
  const previousAllowStale = process.env.SPARK_GATEWAY_STATE_DB_ALLOW_STALE_FALLBACK;
  const previousMaxAgeHours = process.env.SPARK_GATEWAY_STATE_DB_MAX_AGE_HOURS;
  const dir = mkdtempSync(path.join(tmpdir(), 'spark-json-state-test-'));

  process.env.SPARK_GATEWAY_STATE_DIR = dir;
  delete process.env.SPARK_GATEWAY_STATE_DB_ALLOW_STALE_FALLBACK;
  delete process.env.SPARK_GATEWAY_STATE_DB_MAX_AGE_HOURS;

  try {
    await fn();
  } finally {
    resetJsonStateForTests();
    restoreEnv('SPARK_GATEWAY_STATE_DIR', previousStateDir);
    restoreEnv('SPARK_GATEWAY_STATE_DB_ALLOW_STALE_FALLBACK', previousAllowStale);
    restoreEnv('SPARK_GATEWAY_STATE_DB_MAX_AGE_HOURS', previousMaxAgeHours);
    rmSync(dir, { recursive: true, force: true });
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function markGatewayStateRowStale(filePath: string): void {
  resetJsonStateForTests();
  const stateDb = new DatabaseSync(resolveStatePath('.spark-gateway-state.db'));
  try {
    stateDb
      .prepare('UPDATE gateway_state SET updated_at = ? WHERE state_key = ?')
      .run('2026-05-15T00:00:00.000Z', filePath);
  } finally {
    stateDb.close();
  }
}

async function captureWarnings(fn: () => Promise<void>): Promise<string[]> {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };

  try {
    await fn();
  } finally {
    console.warn = originalWarn;
  }

  return warnings;
}

async function main(): Promise<void> {
  await test('restores fresh gateway DB state rows', async () => {
    await withTempState(async () => {
      const stateFile = resolveStatePath('.spark-conversation-memory.json');
      await writeJsonAtomic(stateFile, { restored: 'fresh' });
      resetJsonStateForTests();

      assert.deepEqual(await readJsonFile(stateFile), { restored: 'fresh' });
    });
  });

  await test('ignores stale gateway DB rows by default', async () => {
    await withTempState(async () => {
      const stateFile = resolveStatePath('.spark-conversation-memory.json');
      await writeJsonAtomic(stateFile, { restored: 'stale' });
      markGatewayStateRowStale(stateFile);

      const warnings = await captureWarnings(async () => {
        assert.equal(await readJsonFile(stateFile), null);
      });

      assert.match(warnings.join('\n'), /Ignoring stale gateway DB row/);
      assert.doesNotMatch(warnings.join('\n'), new RegExp(escapeRegExp(path.dirname(stateFile))));
    });
  });

  await test('uses stale gateway DB rows only with explicit cold-start fallback', async () => {
    await withTempState(async () => {
      const stateFile = resolveStatePath('.spark-conversation-memory.json');
      await writeJsonAtomic(stateFile, { restored: 'stale opt-in' });
      markGatewayStateRowStale(stateFile);
      process.env.SPARK_GATEWAY_STATE_DB_ALLOW_STALE_FALLBACK = '1';

      const warnings = await captureWarnings(async () => {
        assert.deepEqual(await readJsonFile(stateFile), { restored: 'stale opt-in' });
      });

      assert.match(warnings.join('\n'), /Using stale gateway DB row/);
    });
  });

  await test('falls back to legacy JSON files when stale gateway DB rows are ignored', async () => {
    await withTempState(async () => {
      const stateFile = resolveStatePath('.spark-conversation-memory.json');
      await writeJsonAtomic(stateFile, { restored: 'stale db' });
      markGatewayStateRowStale(stateFile);
      writeFileSync(stateFile, JSON.stringify({ restored: 'legacy json' }), 'utf-8');

      const warnings = await captureWarnings(async () => {
        assert.deepEqual(await readJsonFile(stateFile), { restored: 'legacy json' });
      });

      assert.match(warnings.join('\n'), /Ignoring stale gateway DB row/);
      assert.equal(existsSync(stateFile), true);
    });
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
