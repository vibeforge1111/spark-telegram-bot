import assert from 'node:assert/strict';
import { formatCanvasReadySummary, isLocalCanvasUrl } from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const base = {
  projectName: 'test-project',
  taskCount: 2,
  elapsed: 10,
  analysis: null,
  kanbanUrl: 'https://example.com/kanban'
};

test('recognizes local-only Canvas URLs', () => {
  assert.equal(isLocalCanvasUrl('http://localhost:3000/canvas'), true);
  assert.equal(isLocalCanvasUrl('http://127.0.0.1:3000/canvas'), true);
  assert.equal(isLocalCanvasUrl('http://[::1]:3000/canvas'), true);
  assert.equal(isLocalCanvasUrl('https://canvas.example.com/project'), false);
  assert.equal(isLocalCanvasUrl(''), false);
});

test('explains local-only Canvas links without hiding the link', () => {
  const reply = formatCanvasReadySummary({ ...base, readyCanvasUrl: 'http://127.0.0.1:3000/canvas' });
  assert.match(reply, /only opens on the machine running Spark/i);
  assert.match(reply, /SPAWNER_UI_PUBLIC_URL/);
});

test('keeps public Canvas links compact', () => {
  const reply = formatCanvasReadySummary({ ...base, readyCanvasUrl: 'https://canvas.example.com/project' });
  assert.match(reply, /• https:\/\/canvas\.example\.com\/project/);
  assert.doesNotMatch(reply, /only opens/i);
});
