import assert from 'node:assert/strict';
import path from 'node:path';
import { builderRepoCandidates, resolveBuilderRepoPath } from '../src/builderRepoPath';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('uses managed and sibling Builder lanes without a Desktop fallback', () => {
  const candidates = builderRepoCandidates({
    cwd: '/work/telegram',
    homeDir: '/home/operator',
    env: { SPARK_HOME: '/srv/spark' } as NodeJS.ProcessEnv
  });

  assert.ok(candidates.includes(path.join('/srv/spark', 'modules', 'spark-intelligence-builder', 'local')));
  assert.ok(candidates.includes(path.join('/work/telegram', '..', 'spark-intelligence-builder')));
  assert.equal(candidates.some((candidate) => candidate.includes(`${path.sep}Desktop${path.sep}`)), false);
});

test('keeps installed source ahead of the managed local fallback', () => {
  const source = path.resolve('/srv/spark/modules/spark-intelligence-builder/source');
  const resolved = resolveBuilderRepoPath({
    cwd: '/work/telegram',
    homeDir: '/home/operator',
    env: { SPARK_HOME: '/srv/spark' } as NodeJS.ProcessEnv,
    exists: (candidate) => candidate === path.join(source, 'src', 'spark_intelligence', 'cli.py')
  });

  assert.equal(resolved, source);
});
