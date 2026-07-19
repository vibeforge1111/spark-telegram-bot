import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSafeOperatorAction, runSafeOperatorAction } from '../src/operatorActions';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

(async () => {
  await test('parses the bounded Level 5 temp-file smoke test', () => {
    const action = parseSafeOperatorAction(
      'Run a safe Level 5 smoke test: create a tiny file at C:\\Users\\USER\\AppData\\Local\\Temp\\spark-telegram-level5-smoke.txt, write "level5 ok", read it back, then delete it. Do not touch anything else. Tell me each step.',
      { USERPROFILE: 'C:\\Users\\USER' } as NodeJS.ProcessEnv
    );
    assert.deepEqual(action, {
      kind: 'level5_smoke',
      filePath: 'C:\\Users\\USER\\AppData\\Local\\Temp\\spark-telegram-level5-smoke.txt'
    });
  });

  await test('rejects unbounded file creation as an operator smoke test', () => {
    assert.equal(parseSafeOperatorAction('Create a tiny file at C:\\Users\\USER\\Documents\\anything.txt and tell me it worked.'), null);
  });

  await test('parses the bounded Desktop folder-list check', () => {
    const action = parseSafeOperatorAction(
      'Check whether C:\\Users\\USER\\Desktop exists. If it exists, list only the first 5 top-level folder names. Do not open files or read file contents.',
      { USERPROFILE: 'C:\\Users\\USER' } as NodeJS.ProcessEnv
    );
    assert.deepEqual(action, {
      kind: 'folder_list',
      folderPath: 'C:\\Users\\USER\\Desktop',
      limit: 5
    });
  });

  await test('runs the smoke test by writing, reading, and deleting one file', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'spark-operator-actions-'));
    const filePath = path.join(root, 'spark-telegram-level5-smoke.txt');
    try {
      const reply = await runSafeOperatorAction({ kind: 'level5_smoke', filePath });
      assert.match(reply, /Level 5 smoke test passed/);
      assert.match(reply, /Read back: level5 ok/);
      assert.match(reply, /Deleted: yes/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  await test('lists only top-level folder names for the bounded Desktop check', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'spark-folder-list-'));
    try {
      await mkdir(path.join(root, 'Beta'));
      await mkdir(path.join(root, 'Alpha'));
      const reply = await runSafeOperatorAction({ kind: 'folder_list', folderPath: root, limit: 5 });
      assert.match(reply, /Folder exists:/);
      assert.match(reply, /- Alpha/);
      assert.match(reply, /- Beta/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
})();
