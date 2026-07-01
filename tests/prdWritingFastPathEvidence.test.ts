import assert from 'node:assert/strict';
import { renderDistilledPrdFastPathReplyWithEvidence } from '../src/prdWritingFastPath';
import { sanitizeOutbound } from '../src/outboundSanitize';
import type { LoopEngineeringFetchLike } from '../src/loopEngineeringStatus';

type AsyncTest = () => Promise<void>;

async function test(name: string, fn: AsyncTest): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('future PRD drafts reuse Spawner distilled PRD lesson without starting a loop', async () => {
    const hits: string[] = [];
    const fetchImpl: LoopEngineeringFetchLike = async (url) => {
      hits.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          chip: {
            summary: {
              id: 'domain-chip-prd-writing-proof-loop',
              domain: 'PRD Writing',
              updatedAt: '2026-07-01T10:02:00.000Z',
              activation: { liveTelegramProven: true },
              nextAction: 'Use the staged checklist before spending a full loop.'
            },
            readiness: {
              label: 'Local fast path supported',
              passCount: 12,
              totalCount: 12,
              nextAction: 'Use the staged checklist before spending a full loop.',
              checks: []
            },
            events: [{
              eventType: 'distillation',
              label: 'Evaluator-backed lessons distilled',
              status: 'passed',
              previousScore: 72,
              candidateScore: 91,
              utilityDelta: 19,
              roundsObserved: 4,
              evaluatorSeparated: true,
              nextAction: 'Reuse the lesson on matching PRD prompts.',
              updatedAt: '2026-07-01T10:02:00.000Z'
            }],
            distillations: [{
              id: 'distill-prd-1',
              status: 'staged',
              lessons: [
                'Start with owner, affected user, success metric, acceptance criteria, rollout risk, rollback, and evidence refs before implementation detail.'
              ],
              runtimeNotes: 'Use as staged PRD Writing guidance.',
              tokenBudgetHint: 'Next matching PRDs can reuse this staged lesson without rerunning the full loop unless the user asks for fresh evidence.',
              updatedAt: '2026-07-01T10:02:00.000Z'
            }]
          }
        })
      };
    };

    const reply = await renderDistilledPrdFastPathReplyWithEvidence(
      'Write a PRD for reducing invoice export failures for finance admins after CSV jobs time out.',
      { fetchImpl, timeoutMs: 1000 }
    );

    assert.ok(reply);
    assert.equal(hits.length, 1);
    assert.match(hits[0], /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop/);
    assert.match(reply, /PRD draft: Invoice Export/i);
    assert.match(reply, /Loop lesson reused: Start with owner, affected user, success metric, acceptance criteria, rollout risk, rollback, and evidence refs/i);
    assert.match(reply, /without rerunning the full loop/i);
    assert.match(reply, /I did not start a benchmark or self-improvement loop for this PRD turn\./);
    assert.doesNotMatch(reply, /I only read Spawner here/);
    assert.doesNotMatch(sanitizeOutbound(reply), /\*\*/);
    assert.match(sanitizeOutbound(reply), /PRD draft: Invoice Export/i);
  });

  await test('harmful PRD requests refuse without spending a Spawner status fetch', async () => {
    const hits: string[] = [];
    const fetchImpl: LoopEngineeringFetchLike = async (url) => {
      hits.push(url);
      throw new Error('fetch should not run for refused PRD requests');
    };

    const reply = await renderDistilledPrdFastPathReplyWithEvidence(
      'Write a PRD to dark-pattern users into accepting tracking by hiding the decline action.',
      { fetchImpl, timeoutMs: 1000 }
    );

    assert.ok(reply);
    assert.equal(hits.length, 0);
    assert.match(reply, /cannot draft/i);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
