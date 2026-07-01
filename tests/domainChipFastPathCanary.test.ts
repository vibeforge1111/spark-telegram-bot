import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runDomainChipFastPathCanary } from '../ops/domainChipFastPathCanary';

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('R30 fast-path canary proves local handler replay without live sends', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'r30-fastpath-canary-'));
  const report = await runDomainChipFastPathCanary({ outputDir });

  assert.equal(report.summary.status, 'pass');
  assert.equal(report.live_send_performed, false);
  assert.equal(report.external_mutation_performed, false);
  assert.equal(report.reran_full_loop, false);
  assert.equal(report.cases.length, 8);
  assert.ok(report.cases.every((entry) => entry.status === 'pass'));
  assert.ok(report.cases.some((entry) => entry.id === 'r30-prd-fast-001' && /PRD draft:/i.test(entry.reply)));
  assert.ok(report.cases.some((entry) => entry.id === 'r30-daily-fast-001' && /keep this read-only/i.test(entry.reply)));
  assert.ok(report.cases.some((entry) => entry.id === 'r30-boundary-meta-timezone-001' && !/Daily Schedule private fast path/i.test(entry.reply)));
  assert.ok(report.summary.disallowed_claims.some((claim) => /Live Telegram deployment readiness is proven/i.test(claim)));
  assert.ok(!report.summary.allowed_claims.some((claim) => /Live Telegram deployment readiness is proven/i.test(claim)));

  const saved = JSON.parse(await readFile(path.join(outputDir, 'local-handler-canary.json'), 'utf8'));
  assert.equal(saved.summary.status, 'pass');
  const summary = await readFile(path.join(outputDir, 'local-handler-canary.md'), 'utf8');
  assert.match(summary, /Claim scope: local_telegram_handler_replay_only/);
  assert.match(summary, /## Disallowed Claims[\s\S]*Live Telegram deployment readiness is proven/);
  assert.doesNotMatch(summary, /## Allowed Claims[\s\S]*Live Telegram deployment readiness is proven[\s\S]*## Disallowed Claims/);
});
