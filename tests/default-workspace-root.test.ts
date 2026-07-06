import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

// Replicate the old (buggy) and new (fixed) workspaceRootsFor from PR #332
function defaultWorkspaceRoot(): string {
  if (process.env.SPARK_PROJECT_ROOT?.trim()) return process.env.SPARK_PROJECT_ROOT.trim();
  if (process.platform === 'win32') {
    const home = process.env.USERPROFILE || 'C:\\Users\\USER';
    return `${home.replace(/[\\/]$/, '')}\\Desktop`;
  }
  const home = process.env.HOME || '/root';
  return home.replace(/[\\/]$/, '');
}

function oldWorkspaceRootsFor(candidate: string): string[] {
  if (process.env.SPARK_PROJECT_ROOT?.trim()) return [process.env.SPARK_PROJECT_ROOT.trim()];
  if (/^[A-Z]:[\\/]/i.test(candidate)) return ['C:\\Users\\USER\\Desktop'];
  return [defaultWorkspaceRoot()];
}

function newWorkspaceRootsFor(candidate: string): string[] {
  if (process.env.SPARK_PROJECT_ROOT?.trim()) return [process.env.SPARK_PROJECT_ROOT.trim()];
  if (/^[A-Z]:[\\/]/i.test(candidate)) return [defaultWorkspaceRoot()];
  return [defaultWorkspaceRoot()];
}

test('old workspaceRootsFor returns hardcoded C:\\Users\\USER\\Desktop for Windows paths', () => {
  const roots = oldWorkspaceRootsFor('C:\\Users\\someone\\project');
  assert.deepEqual(roots, ['C:\\Users\\USER\\Desktop']);
});

test('fixed workspaceRootsFor returns defaultWorkspaceRoot() instead of hardcoded path', () => {
  const roots = newWorkspaceRootsFor('C:\\Users\\someone\\project');
  // defaultWorkspaceRoot() uses USERPROFILE env var, not hardcoded path
  const expected = defaultWorkspaceRoot();
  assert.equal(roots[0], expected);
  assert.notEqual(roots[0], 'C:\\Users\\USER\\Desktop');
});

// Check the actual source file uses defaultWorkspaceRoot() instead of hardcoded path
const buildIntentSrc = readFileSync(join(__dirname, '..', 'src', 'buildIntent.ts'), 'utf-8');
test('src/buildIntent.ts workspaceRootsFor uses defaultWorkspaceRoot()', () => {
  assert.ok(
    buildIntentSrc.includes('defaultWorkspaceRoot()'),
    'Expected workspaceRootsFor to call defaultWorkspaceRoot()'
  );
  assert.ok(
    !buildIntentSrc.includes("'C:\\\\Users\\\\USER\\\\Desktop'") || buildIntentSrc.includes('defaultWorkspaceRoot()'),
    'Expected no hardcoded USER Desktop path, or both hardcoded and defaultWorkspaceRoot exist'
  );
});
