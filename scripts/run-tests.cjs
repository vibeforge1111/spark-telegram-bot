#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Every skipped test must name the superseded or external lane that owns it.
const SKIP = new Map([
  [
    'tests/scheduleParser.test.ts',
    'Superseded legacy SPARK_MODEL_ROUTER parser. Governed Spawner schedule mutation is covered by schedule.test.ts, spawnerAuth.test.ts, telegramCommandAuthority.test.ts, scheduleEmptyState.test.ts, and scheduleRenderContract.test.ts.'
  ]
]);

const testsDir = path.join(__dirname, '..', 'tests');
const tests = fs.readdirSync(testsDir)
  .filter((fileName) => fileName.endsWith('.test.ts'))
  .sort()
  .map((fileName) => `tests/${fileName}`)
  .filter((testFile) => !SKIP.has(testFile));

const requireRealToken = process.argv.includes('--require-real-token');
const token = process.env.BOT_TOKEN || '';
const runIndex = process.argv.indexOf('--run');
const requestedTests = runIndex >= 0
  ? process.argv.slice(runIndex + 1).filter((arg) => arg && !arg.startsWith('--'))
  : [];
const testsToRun = requestedTests.length > 0 ? requestedTests : tests;

if (requireRealToken && (!token || token === '123:test' || token === '0:telegram-smoke-token')) {
  console.error('BOT_TOKEN must be set to a real tester bot token for this test mode.');
  process.exit(1);
}

const env = {
  ...process.env,
  BOT_TOKEN: token || '123:test',
  SPARK_NATURAL_ROUTE_LEDGER: process.env.SPARK_NATURAL_ROUTE_LEDGER || '0'
};

const tsNodeBin = path.join(__dirname, '..', 'node_modules', 'ts-node', 'dist', 'bin.js');

for (const testFile of testsToRun) {
  console.log(`[test] ${testFile}`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-telegram-test-'));
  const testEnv = {
    ...env,
    SPARK_TURN_TRACE_PATH: path.join(tempDir, 'turn-trace.jsonl')
  };
  const result = spawnSync(process.execPath, [tsNodeBin, testFile], {
    env: testEnv,
    stdio: 'inherit'
  });
  fs.rmSync(tempDir, { recursive: true, force: true });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
