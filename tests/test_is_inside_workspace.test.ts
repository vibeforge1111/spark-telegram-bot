import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { isInsideWorkspace } from '../src/buildIntent';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const savedRoot = process.env.SPARK_PROJECT_ROOT;
const workspace = path.join(os.homedir(), 'test-workspace-12345');

function withWorkspace(fn: () => void): void {
  const prev = process.env.SPARK_PROJECT_ROOT;
  process.env.SPARK_PROJECT_ROOT = workspace;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.SPARK_PROJECT_ROOT;
    else process.env.SPARK_PROJECT_ROOT = prev;
  }
}

test('path with .. segments that escape workspace is rejected', () => {
  withWorkspace(() => {
    const traversal = path.join(workspace, '..', '..', 'etc', 'passwd');
    assert.equal(isInsideWorkspace(traversal), false);
  });
});

test('Windows-style .. traversal rejected on any platform', () => {
  withWorkspace(() => {
    // Simulate the raw string a user might include in a message
    const traversal = workspace + path.sep + '..' + path.sep + '..' + path.sep + 'windows';
    assert.equal(isInsideWorkspace(traversal), false);
  });
});

test('valid path directly inside workspace is accepted', () => {
  withWorkspace(() => {
    const valid = path.join(workspace, 'my-project');
    assert.equal(isInsideWorkspace(valid), true);
  });
});

test('workspace root itself is accepted', () => {
  withWorkspace(() => {
    assert.equal(isInsideWorkspace(workspace), true);
  });
});

test('empty string is rejected', () => {
  withWorkspace(() => {
    assert.equal(isInsideWorkspace(''), false);
  });
});

test('path outside workspace without traversal is rejected', () => {
  withWorkspace(() => {
    const outside = path.join(os.homedir(), 'other-dir', 'project');
    assert.equal(isInsideWorkspace(outside), false);
  });
});
