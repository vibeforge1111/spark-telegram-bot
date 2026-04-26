import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePythonCommand } from '../src/pythonCommand';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'spark-python-command-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('resolves SPARK_BUILDER_PYTHON to an absolute executable path', () => {
  withTempDir((dir) => {
    const executable = path.join(dir, process.platform === 'win32' ? 'python.exe' : 'python');
    writeFileSync(executable, '');

    assert.equal(resolvePythonCommand('python', dir), executable);
  });
});

test('rejects configured Python commands that are not on PATH', () => {
  assert.throws(
    () => resolvePythonCommand('python-does-not-exist-for-spark', ''),
    /SPARK_BUILDER_PYTHON was not found on PATH/
  );
});

test('rejects Windows shell wrappers for the configured Python command', () => {
  if (process.platform !== 'win32') {
    return;
  }

  withTempDir((dir) => {
    const wrapper = path.join(dir, 'python.cmd');
    writeFileSync(wrapper, '@echo off\n');

    assert.throws(
      () => resolvePythonCommand(wrapper, ''),
      /cannot point to a shell script/
    );
  });
});
