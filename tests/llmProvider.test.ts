import assert from 'node:assert/strict';
import { codexExecArgs, isCodexProvider } from '../src/llm';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

test('recognizes Codex as the local LLM provider', () => {
  assert.equal(isCodexProvider('codex'), true);
  assert.equal(isCodexProvider(' CODEX '), true);
  assert.equal(isCodexProvider('ollama'), false);
});

test('builds Codex exec args for non-git Spark workspaces', () => {
  assert.deepEqual(codexExecArgs('gpt-5.5', '/tmp/last-message.txt'), [
    'exec',
    '--skip-git-repo-check',
    '--model',
    'gpt-5.5',
    '--sandbox',
    'read-only',
    '--output-last-message',
    '/tmp/last-message.txt',
    '-',
  ]);
});
