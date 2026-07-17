import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('route boundary handler harness keeps guarded prompts on intended routes', () => {
  const repoRoot = resolve(__dirname, '..');
  const tsNodeBin = resolve(repoRoot, 'node_modules/ts-node/dist/bin.js');
  const outputDir = mkdtempSync(join(tmpdir(), 'spark-route-boundary-handler-'));
  const reportPath = join(outputDir, 'route-boundary-handler.md');

  const result = spawnSync(
    process.execPath,
    [
      tsNodeBin,
      resolve(repoRoot, 'ops/routeBoundaryHandlerHarness.ts'),
      '--cases',
      'guard-006,guard-007,build-004,domain-chip-003',
      '--out',
      reportPath
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        SPARK_BOT_TEST_MODE: '1',
        BOT_TOKEN: '0:route-boundary-handler-test',
        SPARK_TELEGRAM_CHAT_STREAMING: '0',
        SPARK_TELEGRAM_DRAFT_PREVIEW_FULL_REPLIES: '0'
      },
      encoding: 'utf8',
      timeout: 180000
    }
  );

  assert.equal(
    result.error,
    undefined,
    [
      'routeBoundaryHandlerHarness did not finish cleanly.',
      `stdout:\n${result.stdout}`,
      `stderr:\n${result.stderr}`
    ].join('\n\n')
  );
  assert.equal(
    result.status,
    0,
    [
      'routeBoundaryHandlerHarness exited unsuccessfully.',
      `stdout:\n${result.stdout}`,
      `stderr:\n${result.stderr}`
    ].join('\n\n')
  );
  assert.match(result.stdout, /PASS guard-006: agent_doctrine\.global_blocked -> agent_doctrine\.global_blocked/);
  assert.match(result.stdout, /PASS guard-007: agent_doctrine\.global_blocked -> agent_doctrine\.global_blocked/);
  assert.match(result.stdout, /PASS build-004: conversation\.ideation -> conversation\.ideation/);
  assert.match(result.stdout, /PASS domain-chip-003: conversation\.ideation -> conversation\.ideation/);
  assert.ok(existsSync(reportPath));

  const report = readFileSync(reportPath, 'utf8');
  assert.match(report, /Summary: 4\/4 cases passed\./);
  assert.match(report, /Trace join:/);
  assert.match(report, /Status: clean/);
  assert.match(report, /Route rows: 4\/4 sampled/);
  assert.match(report, /Joined rows: 4/);
  assert.match(report, /missing reply joins: 0/);
  assert.match(report, /missing proof joins: 0/);
  assert.match(report, /Actual route: agent_doctrine\.global_blocked/);
  assert.match(report, /Actual route: conversation\.ideation/);
  assert.doesNotMatch(report, /BOT_TOKEN|TELEGRAM_BOT_TOKEN|sk-[A-Za-z0-9]/i);
});
