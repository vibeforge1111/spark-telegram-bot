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
      '--out',
      reportPath
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        SPARK_BOT_TEST_MODE: '1',
        BOT_TOKEN: '0:route-boundary-handler-test'
      },
      encoding: 'utf8'
    }
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
  assert.match(result.stdout, /PASS domain-chip-003: conversation\.ideation -> conversation\.ideation/);
  assert.ok(existsSync(reportPath));

  const report = readFileSync(reportPath, 'utf8');
  assert.match(report, /Summary: 2\/2 cases passed\./);
  assert.match(report, /Actual route: agent_doctrine\.global_blocked/);
  assert.match(report, /Actual route: conversation\.ideation/);
  assert.doesNotMatch(report, /BOT_TOKEN|TELEGRAM_BOT_TOKEN|sk-[A-Za-z0-9]/i);
});
