import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isLocalWorkspaceInspectionRequest,
  renderLocalWorkspaceInspectionReply,
  summarizeLocalWorkspaces
} from '../src/localWorkspace';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('recognizes local workspace and desktop inspection requests', () => {
    assert.equal(isLocalWorkspaceInspectionRequest('can you analyze things in my desktop and what projects i am focused on'), true);
    assert.equal(isLocalWorkspaceInspectionRequest('look at the repos in my Desktop'), true);
    assert.equal(isLocalWorkspaceInspectionRequest('inspect my local workspace folders'), true);
    assert.equal(isLocalWorkspaceInspectionRequest('what is the weather today'), false);
  });

  await test('summarizes local folders and repository signals without reading file contents', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'spark-local-workspace-test-'));
    try {
      const repo = path.join(root, 'spark-repo');
      const app = path.join(root, 'plain-app');
      mkdirSync(path.join(repo, '.git'), { recursive: true });
      mkdirSync(app, { recursive: true });
      writeFileSync(path.join(repo, 'package.json'), '{"name":"spark-repo"}');
      writeFileSync(path.join(app, 'README.md'), '# Plain app');

      const summary = await summarizeLocalWorkspaces({ roots: [root], limit: 10 });
      const byName = new Map(summary.projects.map((project) => [project.name, project]));

      assert.equal(summary.roots[0].exists, true);
      assert.equal(summary.projects.length, 2);
      assert.equal(byName.get('spark-repo')?.isGitRepo, true);
      assert.deepEqual(byName.get('spark-repo')?.signals, ['git', 'node']);
      assert.deepEqual(byName.get('plain-app')?.signals, ['docs']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  await test('renders a compact Level 4 local workspace reply', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'spark-local-workspace-render-'));
    try {
      const repo = path.join(root, 'spark-memory');
      mkdirSync(path.join(repo, '.git'), { recursive: true });
      writeFileSync(path.join(repo, 'pyproject.toml'), '[project]\nname = "spark-memory"');

      const summary = await summarizeLocalWorkspaces({ roots: [root], limit: 5 });
      const reply = renderLocalWorkspaceInspectionReply(summary);

      assert.match(reply, /I can inspect local folders at Level 4/);
      assert.match(reply, /spark-memory/);
      assert.match(reply, /git, python/);
      assert.match(reply, /Scanned roots/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

void main();
