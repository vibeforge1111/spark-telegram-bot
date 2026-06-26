import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const ROOT = resolve(__dirname, '..');
const PROMPT_PATH = resolve(ROOT, 'docs/SPARK_CONTROL_PROOF_GOAL_PROMPT_2026-06-24.md');

test('control-proof goal prompt stays under the handoff limit', () => {
  const prompt = readFileSync(PROMPT_PATH, 'utf8');

  assert.ok(prompt.length < 4000, `goal prompt is ${prompt.length} chars; must stay under 4000`);
});

test('control-proof goal prompt preserves proof-first operating constraints', () => {
  const prompt = readFileSync(PROMPT_PATH, 'utf8');

  assert.match(prompt, /First reduce proof gaps and trace-join gaps\./);
  assert.match(prompt, /Do not expand UI, media support, or new features unless they directly close a measured control-proof gap\./);
  assert.match(prompt, /Treat every issue as proof first, implementation second, publishing last\./);
  assert.match(prompt, /Do not push, merge, publish, or open\/update PRs unless explicitly asked and the local proof gate is satisfied\./);
  assert.match(prompt, /Refresh evidence only from a clean\/source-committed state\./);
});
