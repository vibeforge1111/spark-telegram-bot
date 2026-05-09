import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  checkRuntimeFreshness,
  formatRuntimeFreshnessReport,
  ROUTE_CRITICAL_RUNTIME_PATHS
} from '../src/runtimeFreshness';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function writeFile(root: string, relPath: string, content: string): void {
  const absPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf8');
}

function withTempRoots(fn: (sourceRoot: string, runtimeRoot: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-runtime-freshness-'));
  const sourceRoot = path.join(root, 'source');
  const runtimeRoot = path.join(root, 'runtime');
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(runtimeRoot, { recursive: true });
  try {
    fn(sourceRoot, runtimeRoot);
  } finally {
    const resolvedRoot = path.resolve(root);
    if (!resolvedRoot.includes('spark-runtime-freshness-')) {
      throw new Error(`Refusing to clean unexpected temp root: ${resolvedRoot}`);
    }
    fs.rmSync(resolvedRoot, { recursive: true, force: true });
  }
}

test('runtime freshness passes when route-critical paths match', () => {
  withTempRoots((sourceRoot, runtimeRoot) => {
    writeFile(sourceRoot, 'src/index.ts', 'console.log("same");\n');
    writeFile(runtimeRoot, 'src/index.ts', 'console.log("same");\n');

    const result = checkRuntimeFreshness({
      sourceRoot,
      runtimeRoot,
      paths: ['src/index.ts']
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary.checked, 1);
    assert.equal(result.summary.matched, 1);
    assert.equal(result.sourceFingerprint, result.runtimeFingerprint);
    assert.match(formatRuntimeFreshnessReport(result), /Runtime freshness: in sync/);
  });
});

test('runtime freshness reports changed and missing runtime paths without file contents', () => {
  withTempRoots((sourceRoot, runtimeRoot) => {
    writeFile(sourceRoot, 'src/index.ts', 'SECRET_SOURCE_TEXT\n');
    writeFile(runtimeRoot, 'src/index.ts', 'old runtime\n');
    writeFile(sourceRoot, 'src/conversationIntent.ts', 'new source\n');

    const result = checkRuntimeFreshness({
      sourceRoot,
      runtimeRoot,
      paths: ['src/index.ts', 'src/conversationIntent.ts']
    });
    const report = formatRuntimeFreshnessReport(result);

    assert.equal(result.ok, false);
    assert.equal(result.summary.changed, 1);
    assert.equal(result.summary.missingRuntime, 1);
    assert.deepEqual(result.paths.map((entry) => entry.status), ['changed', 'missing_runtime']);
    assert.match(report, /src\/index\.ts: changed/);
    assert.match(report, /src\/conversationIntent\.ts: missing_runtime/);
    assert.doesNotMatch(report, /SECRET_SOURCE_TEXT|old runtime|new source/);
  });
});

test('runtime freshness reports missing source as environment failure', () => {
  withTempRoots((sourceRoot, runtimeRoot) => {
    writeFile(runtimeRoot, 'dist/index.js', 'compiled runtime\n');

    const result = checkRuntimeFreshness({
      sourceRoot,
      runtimeRoot,
      paths: ['dist/index.js']
    });

    assert.equal(result.ok, false);
    assert.equal(result.summary.missingSource, 1);
    assert.equal(result.paths[0].status, 'missing_source');
  });
});

test('default runtime freshness paths cover conversational routing and sync guard files', () => {
  assert.ok(ROUTE_CRITICAL_RUNTIME_PATHS.includes('spark.toml'));
  assert.ok(ROUTE_CRITICAL_RUNTIME_PATHS.includes('src/memoryDoctorBridge.ts'));
  assert.ok(ROUTE_CRITICAL_RUNTIME_PATHS.includes('src/recursive.ts'));
  assert.ok(ROUTE_CRITICAL_RUNTIME_PATHS.includes('src/pathLoop.ts'));
  assert.ok(ROUTE_CRITICAL_RUNTIME_PATHS.includes('ops/runtimeFreshnessCheck.ts'));
  assert.ok(ROUTE_CRITICAL_RUNTIME_PATHS.includes('dist/memoryDoctorBridge.js'));
  assert.ok(ROUTE_CRITICAL_RUNTIME_PATHS.includes('dist/recursive.js'));
  assert.ok(ROUTE_CRITICAL_RUNTIME_PATHS.includes('dist/pathLoop.js'));
});
