import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  quoteWindowsArg,
  resolveWindowsCommand,
  windowsCmdShimArgs,
  windowsPowerShellShimArgs,
  withHiddenWindows
} from '../src/hiddenProcess';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

test('hidden process options always request hidden Windows windows', () => {
  assert.deepEqual(withHiddenWindows({ cwd: 'C:\\Spark' }), {
    cwd: 'C:\\Spark',
    windowsHide: true,
  });
});

test('Windows cmd shims preserve spaced paths without shell interpolation', () => {
  assert.equal(quoteWindowsArg('C:\\Users\\Example\\.npm-global\\codex.cmd'), 'C:\\Users\\Example\\.npm-global\\codex.cmd');
  assert.deepStrictEqual(
    windowsCmdShimArgs('C:\\Program Files\\Spark\\spark.cmd', ['run', 'hello world']),
    ['/d', '/s', '/c', '""C:\\Program Files\\Spark\\spark.cmd" run "hello world""']
  );
});

test('Windows command resolver finds cmd shims from PATH', () => {
  if (process.platform !== 'win32') return;
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-hidden-process-'));
  try {
    writeFileSync(path.join(tempDir, 'claude.cmd'), '@echo off\r\n');
    const resolved = resolveWindowsCommand('claude', {
      PATH: tempDir,
      PATHEXT: '.COM;.EXE;.BAT;.CMD'
    });
    assert.match(resolved, /claude\.cmd$/i);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('PowerShell shim args run scripts without shell interpolation', () => {
  assert.deepEqual(windowsPowerShellShimArgs('C:\\Spark Tools\\claude.ps1', ['-p', 'hello world']), [
    '-NoLogo',
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    'C:\\Spark Tools\\claude.ps1',
    '-p',
    'hello world',
  ]);
});

test('Builder and chip Python bridges use hidden Windows exec options', () => {
  for (const file of ['builderBridge.ts', 'chipCreate.ts', 'chipLoop.ts']) {
    const source = readFileSync(path.join(__dirname, '..', 'src', file), 'utf-8');
    assert.match(source, /withHiddenWindows\(/, `${file} should hide Python subprocess windows`);
    assert.doesNotMatch(source, /execFileAsync\([^)]*\{[\s\S]*?windowsHide:\s*true/, `${file} should use the shared helper`);
  }
});
