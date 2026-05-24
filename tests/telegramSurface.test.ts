import assert from 'node:assert/strict';
import {
  applyPlainWordsSurfaceRequest,
  isPlainWordsSurfaceRequest
} from '../src/telegramSurface';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('detects plain-word and no-list surface requests', () => {
  assert.equal(isPlainWordsSurfaceRequest('What should Spark Thread QA improve next, in plain words?'), true);
  assert.equal(isPlainWordsSurfaceRequest('Say it in one or two natural teammate sentences. No headings, no bullets.'), true);
  assert.equal(isPlainWordsSurfaceRequest('Give me the detailed status report'), false);
});

test('keeps helpful lists when user asks for plain words without banning bullets', () => {
  const reply = [
    'Spark Thread QA should improve route confidence next.',
    '',
    'The useful check is whether Spark is:',
    '• talking',
    '• inspecting',
    '• building',
    '• running'
  ].join('\n');

  assert.equal(
    applyPlainWordsSurfaceRequest('What should Spark Thread QA improve next, in plain words?', reply),
    reply
  );
});

test('keeps plain paragraphs and removes numbered plan tail for explicit no-list requests', () => {
  const reply = [
    'Spark Thread QA should improve route confidence next.',
    '',
    'In plain words: before Spark answers or acts, it should show whether the user is asking to talk, inspect, build, run, remember, or diagnose.',
    '',
    'The sharp v1:',
    '1. Detect the intended lane.',
    '2. Show why Spark chose it.'
  ].join('\n');

  assert.equal(
    applyPlainWordsSurfaceRequest('Say that in one or two natural teammate sentences. No headings, no bullets.', reply),
    [
      'Spark Thread QA should improve route confidence next.',
      '',
      'In plain words: before Spark answers or acts, it should show whether the user is asking to talk, inspect, build, run, remember, or diagnose.'
    ].join('\n')
  );
});

test('does not rewrite normal detailed answers when the user did not ask for plain words', () => {
  const reply = ['Plan:', '1. Inspect route.', '2. Patch test.'].join('\n');
  assert.equal(applyPlainWordsSurfaceRequest('Give me the detailed plan', reply), reply);
});
