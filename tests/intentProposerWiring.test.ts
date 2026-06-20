import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logIntentProposerShadow } from '../src/intentProposerLog';
import { intentProposerProviderComplete } from '../src/intentProposerCompleter';

const registered: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  registered.push([name, fn]);
}

function withTempLog<T>(fn: (logPath: string) => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'spark-intent-shadow-'));
  try {
    return fn(path.join(dir, 'shadow.jsonl'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('logger writes one valid JSONL row with the agreement fields', () => {
  withTempLog((logPath) => {
    logIntentProposerShadow(
      {
        text: 'delete the 9am schedule',
        agreement: { regexRoute: 'schedule.delete', proposerTop: 'schedule.delete', proposerConfidence: 0.95, agrees: true, abstain: false },
        proposal: { candidates: [{ route: 'schedule.delete', confidence: 0.95, rationale: 'fresh delete' }], abstain: false }
      },
      logPath
    );
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const row = JSON.parse(lines[0]);
    assert.equal(row.regex_route, 'schedule.delete');
    assert.equal(row.proposer_top, 'schedule.delete');
    assert.equal(row.agrees, true);
    assert.equal(row.candidates.length, 1);
    assert.ok(typeof row.ts === 'string' && row.ts.length > 0);
  });
});

test('logger appends (does not overwrite) and caps the text preview at 200 chars', () => {
  withTempLog((logPath) => {
    const long = 'x'.repeat(500);
    const rec = (text: string) => ({
      text,
      agreement: { regexRoute: 'plain_chat', proposerTop: 'plain_chat', proposerConfidence: 0.5, agrees: true, abstain: false },
      proposal: null
    });
    logIntentProposerShadow(rec('first'), logPath);
    logIntentProposerShadow(rec(long), logPath);
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2, 'second write must append');
    assert.equal(JSON.parse(lines[1]).text_preview.length, 200, 'preview capped');
    assert.equal(JSON.parse(lines[1]).proposed, true, 'null proposal recorded');
  });
});

test('logger is fail-safe: an unwritable path does not throw', () => {
  // a path whose parent directory does not exist should be swallowed, never thrown
  assert.doesNotThrow(() => {
    logIntentProposerShadow(
      {
        text: 'x',
        agreement: { regexRoute: 'plain_chat', proposerTop: null, proposerConfidence: null, agrees: false, abstain: false },
        proposal: null
      },
      path.join(os.tmpdir(), 'no-such-dir-xyz', 'nested', 'shadow.jsonl')
    );
  });
});

test('completer returns "" for an unsupported provider without throwing', async () => {
  const prev = process.env.SPARK_CHAT_LLM_PROVIDER;
  process.env.SPARK_CHAT_LLM_PROVIDER = 'unsupported-for-test';
  try {
    const out = await intentProposerProviderComplete({ system: 's', user: 'u' });
    assert.equal(out, '');
  } finally {
    if (prev === undefined) delete process.env.SPARK_CHAT_LLM_PROVIDER;
    else process.env.SPARK_CHAT_LLM_PROVIDER = prev;
  }
});

void (async () => {
  let failed = 0;
  for (const [name, fn] of registered) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      console.error(`not ok - ${name}`);
      console.error(err);
      failed++;
    }
  }
  if (failed) process.exitCode = 1;
})();
