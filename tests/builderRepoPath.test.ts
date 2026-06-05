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

const FAKE_HOME = path.resolve('/tmp/fake-home');
const FAKE_CWD = path.resolve('/tmp/fake-cwd/spark-telegram-bot');

test('builderRepoCandidates emits the four documented search paths in priority order', () => {
  const candidates = builderRepoCandidates({ cwd: FAKE_CWD, homeDir: FAKE_HOME });

  assert.equal(candidates.length, 4);
  assert.equal(
    candidates[0],
    path.join(FAKE_HOME, '.spark', 'modules', 'spark-intelligence-builder-release', 'source')
  );
  assert.equal(
    candidates[1],
    path.join(FAKE_HOME, '.spark', 'modules', 'spark-intelligence-builder', 'source')
  );
  assert.equal(candidates[2], path.join(FAKE_CWD, '..', 'spark-intelligence-builder'));
  assert.equal(candidates[3], path.join(FAKE_HOME, 'Desktop', 'spark-intelligence-builder'));
});

test('resolveBuilderRepoPath returns the configured repo path when provided', () => {
  const explicit = resolveBuilderRepoPath({
    configuredRepo: '/explicit/path/to/builder',
    cwd: FAKE_CWD,
    homeDir: FAKE_HOME,
    exists: () => false
  });

  assert.equal(explicit, path.resolve('/explicit/path/to/builder'));
});

test('resolveBuilderRepoPath trims whitespace on configured repo', () => {
  const explicit = resolveBuilderRepoPath({
    configuredRepo: '   /explicit/path  ',
    cwd: FAKE_CWD,
    homeDir: FAKE_HOME,
    exists: () => false
  });

  assert.equal(explicit, path.resolve('/explicit/path'));
});

test('resolveBuilderRepoPath returns the first candidate whose cli.py exists', () => {
  const expectedHit = path.resolve(
    path.join(FAKE_HOME, '.spark', 'modules', 'spark-intelligence-builder', 'source')
  );
  const cliMarker = path.join(expectedHit, 'src', 'spark_intelligence', 'cli.py');

  const resolved = resolveBuilderRepoPath({
    cwd: FAKE_CWD,
    homeDir: FAKE_HOME,
    exists: (target) => target === cliMarker
  });

  assert.equal(resolved, expectedHit);
});

test('resolveBuilderRepoPath falls back to the first candidate when no marker exists', () => {
  const resolved = resolveBuilderRepoPath({
    cwd: FAKE_CWD,
    homeDir: FAKE_HOME,
    exists: () => false
  });

  // The first candidate (release source) is preferred even without the marker.
  assert.equal(
    resolved,
    path.resolve(path.join(FAKE_HOME, '.spark', 'modules', 'spark-intelligence-builder-release', 'source'))
  );
});

test('resolveBuilderRepoPath dedupes resolved candidates that point to the same path', () => {
  // When cwd happens to resolve to a directory whose parent collides with one of the home-relative
  // candidates, the dedupe guard prevents double-checking the same path. The marker exists only
  // for the second-priority candidate, so resolve must still find it.
  const expectedHit = path.resolve(
    path.join(FAKE_HOME, '.spark', 'modules', 'spark-intelligence-builder', 'source')
  );
  const cliMarker = path.join(expectedHit, 'src', 'spark_intelligence', 'cli.py');
  const visited: string[] = [];

  const resolved = resolveBuilderRepoPath({
    cwd: FAKE_CWD,
    homeDir: FAKE_HOME,
    exists: (target) => {
      visited.push(target);
      return target === cliMarker;
    }
  });

  assert.equal(resolved, expectedHit);
  // No duplicate marker probes -- the dedupe guard kept the visited list tight.
  const probedDirs = visited.map((v) => path.dirname(path.dirname(path.dirname(v))));
  const uniqueProbed = new Set(probedDirs);
  assert.equal(probedDirs.length, uniqueProbed.size);
});
