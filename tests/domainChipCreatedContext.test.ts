import assert from 'node:assert/strict';
import { parseNaturalRecursiveCommandIntent } from '../src/conversationIntent';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('extracts latest created Domain Chip as contextual recursive target', () => {
  const createdChipContext = {
    recentMessages: [
      'Domain Chip created: domain-chip-pull-request-risk-review',
      'Starter checks: 14 practice checks covering examples, hidden-style checks, no-action checks, and safety challenges, plus 3 trick cases.',
      'Still needed before anyone relies on it: a useful before/after win, review checks the chip has not seen, safety challenge review, a cold-user trial, rollback proof, an evidence audit, and human approval.'
    ]
  };
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('run the benchmark for it', createdChipContext),
    {
      rawCommand: 'start domain-chip-pull-request-risk-review rounds 1',
      reason: 'Natural-language request to start a recursive loop for Pull Request Risk Review.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('run the private check', createdChipContext),
    {
      rawCommand: 'start domain-chip-pull-request-risk-review rounds 1',
      reason: 'Natural-language request to start a recursive loop for Pull Request Risk Review.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('show me proof', createdChipContext),
    {
      rawCommand: 'evidence domain-chip-pull-request-risk-review',
      reason: 'Natural-language request for Pull Request Risk Review benchmark evidence.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('where did we land?', createdChipContext),
    {
      rawCommand: 'report path_builder_chip_domain_chip_pull_request_risk_review',
      reason: 'Natural-language request for Pull Request Risk Review recursive report.'
    }
  );
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('run the benchmark for it, do not run anything', createdChipContext),
    null
  );
});

test('created Domain Chip wins over QA evidence wording in the same receipt', () => {
  const createdChipContext = {
    recentMessages: [
      [
        'Domain Chip created: domain-chip-supplier-risk-triage',
        '',
        'QA Evidence Lane handoff: reports/qa-evidence-lane-packet.json is ready for evaluate-run; promotion remains blocked.',
        'Still needed before anyone relies on it: a useful before/after win, review checks the chip has not seen, safety challenge review, a cold-user trial, rollback proof, an evidence audit, and human approval.'
      ].join('\n')
    ]
  };
  assert.deepEqual(
    parseNaturalRecursiveCommandIntent('run the benchmark for it', createdChipContext),
    {
      rawCommand: 'start domain-chip-supplier-risk-triage rounds 1',
      reason: 'Natural-language request to start a recursive loop for Supplier Risk Triage.'
    }
  );
});
