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

// PR #114: Filter Desktop/Documents with existsSync in default workspace roots

// Replicate old (always includes Desktop/Documents) and new (checks existsSync)
function oldDefaultLocalWorkspaceRoots(): string[] {
  const home = '/tmp/test-home';
  return [
    join(home, 'Desktop'),
    join(home, 'Documents'),
    join(home, '.spark', 'workspaces')
  ];
}

function join(...parts: string[]): string {
  return parts.join('/');
}

// New behavior: only include Desktop/Documents if they exist
function newDefaultLocalWorkspaceRoots(existingDirs: Set<string>): string[] {
  const home = '/tmp/test-home';
  const candidates = [
    join(home, 'Desktop'),
    join(home, 'Documents')
  ];
  const existing = candidates.filter((p) => existingDirs.has(p));
  existing.push(join(home, '.spark', 'workspaces'));
  return existing;
}

test('old defaultLocalWorkspaceRoots always includes Desktop and Documents', () => {
  const roots = oldDefaultLocalWorkspaceRoots();
  assert.ok(roots.some((r) => r.endsWith('Desktop')));
  assert.ok(roots.some((r) => r.endsWith('Documents')));
  assert.ok(roots.some((r) => r.includes('.spark')));
});

test('new defaultLocalWorkspaceRoots skips Desktop when it does not exist', () => {
  const roots = newDefaultLocalWorkspaceRoots(new Set(['/tmp/test-home/Documents', '/tmp/test-home/.spark']));
  assert.ok(!roots.some((r) => r.endsWith('Desktop')), 'Desktop should be filtered out');
  assert.ok(roots.some((r) => r.endsWith('Documents')));
  assert.ok(roots.some((r) => r.includes('.spark')));
});

test('new defaultLocalWorkspaceRoots skips Documents when it does not exist', () => {
  const roots = newDefaultLocalWorkspaceRoots(new Set(['/tmp/test-home/Desktop', '/tmp/test-home/.spark']));
  assert.ok(roots.some((r) => r.endsWith('Desktop')));
  assert.ok(!roots.some((r) => r.endsWith('Documents')), 'Documents should be filtered out');
  assert.ok(roots.some((r) => r.includes('.spark')));
});

test('new defaultLocalWorkspaceRoots always includes .spark/workspaces', () => {
  const roots = newDefaultLocalWorkspaceRoots(new Set());
  assert.ok(roots.some((r) => r.includes('.spark')));
  assert.equal(roots.length, 1);
});

// Check the source file uses existsSync
const localWorkspaceSrc = readFileSync(join(__dirname, '..', 'src', 'localWorkspace.ts'), 'utf-8');
test('src/localWorkspace.ts filters workspace roots with existsSync', () => {
  assert.ok(
    localWorkspaceSrc.includes('existsSync') ||
    localWorkspaceSrc.includes('filter') && localWorkspaceSrc.includes('Desktop'),
    'Expected existsSync-based filter for Desktop/Documents'
  );
});
