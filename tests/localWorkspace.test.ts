import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isLocalWorkspaceInspectionOnlyRequest,
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
    assert.equal(isLocalWorkspaceInspectionRequest('can you scan my desktop and what projects i am focused on'), true);
    assert.equal(isLocalWorkspaceInspectionRequest('look at the repos in my Desktop'), true);
    assert.equal(isLocalWorkspaceInspectionRequest('inspect my local workspace folders'), true);
    assert.equal(isLocalWorkspaceInspectionRequest('what is the weather today'), false);
  });

  await test('does not let local workspace inspection steal explicit build prompts', () => {
    const prompt = [
      'Build this at C:\\Users\\USER\\Desktop\\spark-telegram-unit-smoke: a vanilla-JS static app called Spark Telegram Unit Smoke.',
      'Files: index.html, styles.css, app.js, README.md. No build step.',
      'Make a tiny dark Mission Control panel with four checklist items, a progress meter, Launch and Reset buttons, and localStorage persistence under key spark-telegram-unit-smoke:v1.',
      'When all four items are checked and Launch is clicked, show UNIT SMOKE PASSED with a subtle pulse.'
    ].join(' ');

    assert.equal(isLocalWorkspaceInspectionRequest(prompt), true, 'documents the broad heuristic collision');
    assert.equal(isLocalWorkspaceInspectionOnlyRequest(prompt), false);
  });

  await test('keeps natural workspace inspection out of chat interception', () => {
    assert.equal(isLocalWorkspaceInspectionOnlyRequest('scan my desktop projects'), false);
    assert.equal(isLocalWorkspaceInspectionOnlyRequest('/workspaces'), true);
  });

  await test('does not turn build-quality discussion into folder inventory', () => {
    assert.equal(
      isLocalWorkspaceInspectionOnlyRequest(
        'looking at how spawner UI operated in the last examples, what would you improve before we build the beauty salon appointment system?'
      ),
      false
    );
    assert.equal(
      isLocalWorkspaceInspectionOnlyRequest(
        'what would you improve in the spawner-ui repo so missions and canvas feel better?'
      ),
      false
    );
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
