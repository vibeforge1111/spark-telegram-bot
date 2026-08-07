import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertLoadedRuntimeMatchesInstalled,
  captureInstalledRuntimeBuildIdentity,
  captureRuntimeBuildIdentity,
} from '../src/runtimeBuildIdentity';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function withTempRuntime(fn: (entryPath: string, siblingPath: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), 'spark-loaded-runtime-'));
  try {
    const dist = path.join(root, 'dist');
    mkdirSync(dist);
    const entryPath = path.join(dist, 'index.js');
    const siblingPath = path.join(dist, 'missionRelay.js');
    writeFileSync(entryPath, 'module.exports = "entry";\n', { encoding: 'utf8', flag: 'wx' });
    writeFileSync(siblingPath, 'module.exports = "old";\n', { encoding: 'utf8', flag: 'wx' });
    fn(entryPath, siblingPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('captures a public-safe fingerprint for the complete compiled runtime tree', () => {
  withTempRuntime((entryPath) => {
    const identity = captureRuntimeBuildIdentity(entryPath, '2026-08-07T12:00:00.000Z');
    assert.equal(identity.schema, 'spark.telegram.loaded-runtime.v1');
    assert.equal(identity.artifact, 'dist-js-tree');
    assert.equal(identity.fileCount, 2);
    assert.match(identity.sha256, /^[0-9a-f]{64}$/);
    assert.equal(identity.loadedAt, '2026-08-07T12:00:00.000Z');
    assert.doesNotMatch(JSON.stringify(identity), /spark-loaded-runtime-|\/private\/|\/Users\//);
  });
});

test('rejects a sibling-only rebuild even when index.js is unchanged', () => {
  withTempRuntime((entryPath, siblingPath) => {
    const loaded = captureRuntimeBuildIdentity(entryPath, '2026-08-07T12:00:00.000Z');
    writeFileSync(siblingPath, 'module.exports = "new";\n', 'utf8');
    const installed = captureRuntimeBuildIdentity(entryPath, '2026-08-07T12:05:00.000Z');
    assert.throws(
      () => assertLoadedRuntimeMatchesInstalled(loaded, installed),
      /running Telegram process loaded a different artifact generation/i
    );
  });
});

test('accepts the running process only when its load-time tree matches installed bytes', () => {
  withTempRuntime((entryPath) => {
    const loaded = captureRuntimeBuildIdentity(entryPath, '2026-08-07T12:00:00.000Z');
    const installed = captureRuntimeBuildIdentity(entryPath, '2026-08-07T12:05:00.000Z');
    assert.doesNotThrow(() => assertLoadedRuntimeMatchesInstalled(loaded, installed));
  });
});

test('rejects source and compiled trees as different runtime generations', () => {
  withTempRuntime((entryPath) => {
    const compiled = captureRuntimeBuildIdentity(entryPath, '2026-08-07T12:00:00.000Z');
    const source = { ...compiled, artifact: 'src-ts-tree' as const };
    assert.throws(
      () => assertLoadedRuntimeMatchesInstalled(source, compiled),
      /running Telegram process loaded a different artifact generation/i
    );
  });
});

test('rejects symlinks instead of following runtime files outside the attested tree', () => {
  withTempRuntime((entryPath) => {
    symlinkSync(entryPath, path.join(path.dirname(entryPath), 'alias.js'));
    assert.throws(
      () => captureRuntimeBuildIdentity(entryPath),
      /symbolic link/i
    );
  });
});

test('rejects a symlinked runtime tree root', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'spark-loaded-runtime-root-link-'));
  try {
    const external = path.join(root, 'external');
    const dist = path.join(root, 'dist');
    mkdirSync(external);
    writeFileSync(path.join(external, 'index.js'), 'module.exports = true;\n');
    symlinkSync(external, dist, 'dir');

    assert.throws(
      () => captureRuntimeBuildIdentity(path.join(dist, 'index.js')),
      /not a regular directory/i
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a regular file swapped to a symlink between check and open', () => {
  withTempRuntime((entryPath, siblingPath) => {
    const external = path.join(os.tmpdir(), `spark-runtime-external-${process.pid}-${Date.now()}.js`);
    writeFileSync(external, 'module.exports = "external";\n', { encoding: 'utf8', flag: 'wx' });
    try {
      assert.throws(
        () => captureRuntimeBuildIdentity(
          entryPath,
          '2026-08-07T12:00:00.000Z',
          (absolute) => {
            if (absolute !== siblingPath) return;
            rmSync(siblingPath);
            symlinkSync(external, siblingPath);
          }
        ),
        /changed while|without following links/i
      );
    } finally {
      rmSync(external, { force: true });
    }
  });
});

test('rejects the runtime root swapped to a symlink between check and open', () => {
  withTempRuntime((entryPath, siblingPath) => {
    const dist = path.dirname(entryPath);
    const moved = path.join(path.dirname(dist), 'dist-moved');
    assert.throws(
      () => captureRuntimeBuildIdentity(
        entryPath,
        '2026-08-07T12:00:00.000Z',
        (absolute) => {
          if (absolute !== siblingPath) return;
          renameSync(dist, moved);
          symlinkSync(moved, dist, 'dir');
        }
      ),
      /runtime directory changed/i
    );
  });
});

test('rejects a nested runtime directory swapped to a symlink during capture', () => {
  withTempRuntime((entryPath) => {
    const dist = path.dirname(entryPath);
    const nested = path.join(dist, 'nested');
    const moved = path.join(dist, 'nested-moved');
    const nestedFile = path.join(nested, 'worker.js');
    mkdirSync(nested);
    writeFileSync(nestedFile, 'module.exports = "worker";\n');
    assert.throws(
      () => captureRuntimeBuildIdentity(
        entryPath,
        '2026-08-07T12:00:00.000Z',
        (absolute) => {
          if (absolute !== nestedFile) return;
          renameSync(nested, moved);
          symlinkSync(moved, nested, 'dir');
        }
      ),
      /runtime directory changed/i
    );
  });
});

test('compiled health runner can verify a current source-mode process', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'spark-loaded-runtime-dev-'));
  try {
    const dist = path.join(root, 'dist');
    const src = path.join(root, 'src');
    mkdirSync(dist);
    mkdirSync(src);
    writeFileSync(path.join(dist, 'healthRuntime.js'), 'module.exports = {};\n');
    writeFileSync(path.join(dist, 'index.js'), 'module.exports = "compiled";\n');
    writeFileSync(path.join(src, 'index.ts'), 'export const mode = "source";\n');
    writeFileSync(path.join(src, 'missionRelay.ts'), 'export const relay = true;\n');

    const identity = captureInstalledRuntimeBuildIdentity(
      path.join(dist, 'healthRuntime.js'),
      'src-ts-tree'
    );

    assert.equal(identity.artifact, 'src-ts-tree');
    assert.equal(identity.fileCount, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
