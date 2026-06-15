import assert from 'node:assert/strict';
import { formatCanvasReadySummary } from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const BASE_ARGS = {
  projectName: 'test-project',
  taskCount: 2,
  elapsed: 10,
  analysis: null,
  kanbanUrl: 'https://example.com/kanban',
};

test('localhost URL shows local-only explanation and SPAWNER_UI_PUBLIC_URL guidance', () => {
  const result = formatCanvasReadySummary({
    ...BASE_ARGS,
    readyCanvasUrl: 'http://localhost:3000/canvas',
  });
  assert.match(result, /only works locally/);
  assert.match(result, /SPAWNER_UI_PUBLIC_URL/);
});

test('127.0.0.1 URL shows local-only explanation', () => {
  const result = formatCanvasReadySummary({
    ...BASE_ARGS,
    readyCanvasUrl: 'http://127.0.0.1:3000/canvas',
  });
  assert.match(result, /only works locally/);
  assert.doesNotMatch(result, /• http:\/\/127\.0\.0\.1/);
});

test('IPv6 loopback ::1 shows local-only explanation', () => {
  const result = formatCanvasReadySummary({
    ...BASE_ARGS,
    readyCanvasUrl: 'http://[::1]:3000/canvas',
  });
  assert.match(result, /only works locally/);
});

test('public URL renders as plain Canvas bullet — no local-only message', () => {
  const result = formatCanvasReadySummary({
    ...BASE_ARGS,
    readyCanvasUrl: 'https://canvas.example.com/my-project',
  });
  assert.match(result, /• https:\/\/canvas\.example\.com\/my-project/);
  assert.doesNotMatch(result, /only works locally/);
});

test('empty string URL treated as non-local — URL parse fails, no local-only message', () => {
  const result = formatCanvasReadySummary({
    ...BASE_ARGS,
    readyCanvasUrl: '',
  });
  assert.doesNotMatch(result, /only works locally/);
});
