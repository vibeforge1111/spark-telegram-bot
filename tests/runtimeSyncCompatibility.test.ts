import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('runtime sync includes capability upgrade/eval fixtures', () => {
  const script = readFileSync('scripts/sync-runtime.cjs', 'utf-8');
  const testRunner = readFileSync('scripts/run-tests.cjs', 'utf-8');

  assert.match(script, /ops\/capability-natural-language-matrix\.json/);
  assert.match(script, /package-lock\.json/);
  assert.match(script, /tsconfig\.json/);
  assert.match(script, /spark\.toml/);
  assert.match(testRunner, /const SKIP = new Map/);
  assert.match(testRunner, /fs\.readdirSync\(testsDir\)/);
  assert.match(testRunner, /fileName\.endsWith\('\.test\.ts'\)/);
  assert.match(testRunner, /scheduleParser\.test\.ts/);
  assert.match(testRunner, /Superseded legacy SPARK_MODEL_ROUTER parser/);
  assert.match(testRunner, /SPARK_TURN_TRACE_PATH/);
  assert.match(testRunner, /SPARK_NATURAL_ROUTE_LEDGER/);
  assert.match(script, /dir:\s*'src'/);
  assert.match(script, /dir:\s*'dist'/);
  assert.match(script, /dir:\s*'ops'/);
  assert.match(script, /dir:\s*'vendor\/harness-core'/);
  assert.match(script, /--check/);
});

test('runtime sync archives stale compiled files and then passes strict drift checks', () => {
  const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-telegram-runtime-sync-'));
  const stalePath = path.join(runtimeRoot, 'dist', 'stale-runtime-only.js');

  try {
    mkdirSync(path.dirname(stalePath), { recursive: true });
    writeFileSync(stalePath, 'module.exports = \"stale\";\n', 'utf8');

    const env = { ...process.env, SPARK_TELEGRAM_RUNTIME_ROOT: runtimeRoot };
    const sync = spawnSync(process.execPath, ['scripts/sync-runtime.cjs'], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8'
    });

    assert.equal(sync.status, 0, sync.stderr || sync.stdout);
    assert.match(sync.stdout, /archived 1 stale dist path/);
    assert.equal(existsSync(stalePath), false);

    const backupBase = path.join(runtimeRoot, '.spark-runtime-sync-backups');
    const backupNames = readdirSync(backupBase);
    assert.equal(backupNames.length, 1);
    const backupRoot = path.join(backupBase, backupNames[0]);
    assert.equal(existsSync(path.join(backupRoot, 'dist', 'stale-runtime-only.js')), true);
    const manifest = JSON.parse(readFileSync(path.join(backupRoot, 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest.moved, ['dist/stale-runtime-only.js']);

    const check = spawnSync(
      process.execPath,
      ['scripts/sync-runtime.cjs', '--check', '--require-runtime'],
      { cwd: process.cwd(), env, encoding: 'utf8' }
    );
    assert.equal(check.status, 0, check.stderr || check.stdout);
    assert.match(check.stdout, /runtime in sync/);
  } finally {
    rmSync(runtimeRoot, { recursive: true, force: true });
  }
});
