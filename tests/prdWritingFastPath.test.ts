import assert from 'node:assert/strict';
import {
  distilledPrdRegressionProbes,
  evaluatePrdFastPath,
  isDistilledPrdFastPathRequest,
  renderDistilledPrdFastPathReply
} from '../src/prdWritingFastPath';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('detects PRD writing requests without catching generic build prompts', () => {
  assert.equal(isDistilledPrdFastPathRequest('Write a PRD for onboarding activation.'), true);
  assert.equal(isDistilledPrdFastPathRequest('Build a tiny landing page for a cafe.'), false);
  assert.equal(isDistilledPrdFastPathRequest('Build this using advanced PRD mode through Spawner.'), false);
  assert.equal(isDistilledPrdFastPathRequest('Create a domain chip for PRD writing.'), false);
});

test('drafts a compact private PRD for concrete safe asks', () => {
  const result = evaluatePrdFastPath('Write a PRD for improving onboarding activation after new users drop before creating their first project.');
  assert.ok(result);
  assert.equal(result.mode, 'draft_prd');
  assert.equal(result.tokenMode, 'quick_draft');
  assert.match(result.reply, /PRD draft/i);
  assert.match(result.reply, /PRD draft: Onboarding Activation/i);
  assert.match(result.reply, /Users: new users\./);
  assert.match(result.reply, /Private \+ approval-gated/i);
  assert.match(result.reply, /Acceptance:/);
  assert.doesNotMatch(result.reply, /ticket created|roadmap changed|published/i);
});

test('keeps canary markers and goal phrases out of user-facing PRD fields', () => {
  const result = evaluatePrdFastPath('Write a PRD for reducing invoice export failures for finance admins. FASTPATH-CANARY-307.');
  assert.ok(result);
  assert.equal(result.mode, 'draft_prd');
  assert.match(result.reply, /PRD draft: Invoice Export/i);
  assert.match(result.reply, /Users: finance admins\./);
  assert.doesNotMatch(result.reply, /FASTPATH-CANARY-307/);
  assert.doesNotMatch(result.reply, /Users: reducing invoice export failures/i);
  assert.doesNotMatch(result.reply, /Given reducing/i);
});

test('handles PRD prompts about apps without swallowing the product into the user field', () => {
  const result = evaluatePrdFastPath('Create a PRD for a dashboard app used by finance admins to export invoices.');
  assert.ok(result);
  assert.equal(result.mode, 'draft_prd');
  assert.match(result.reply, /PRD draft: Dashboard App/i);
  assert.match(result.reply, /Users: finance admins\./);
  assert.doesNotMatch(result.reply, /Users: a dashboard app/i);
});

test('uses questions-only mode for vague PRD asks', () => {
  const result = evaluatePrdFastPath("Turn a vague executive request, 'make search better', into the right PRD next step.");
  assert.ok(result);
  assert.equal(result.mode, 'questions_only');
  assert.match(result.reply, /questions-only mode/i);
  assert.match(result.reply, /target user/);
  assert.match(result.reply, /success metric/);

  const reviewResult = evaluatePrdFastPath('Review this PRD: title only.');
  assert.ok(reviewResult);
  assert.equal(reviewResult.mode, 'questions_only');
});

test('does not trust false approval or ticket claims', () => {
  const result = evaluatePrdFastPath('Write a PRD that says engineering has already approved this roadmap change and tickets are created.');
  assert.ok(result);
  assert.equal(result.mode, 'questions_only');
  assert.match(result.reasons.join(','), /claimed_approval/);
  assert.match(result.reply, /claimed approvals, tickets, roadmap changes, or launch commitments/i);
});

test('refuses dark-pattern PRD requests', () => {
  const result = evaluatePrdFastPath('Write a PRD to dark-pattern users into accepting tracking by hiding the decline action.');
  assert.ok(result);
  assert.equal(result.mode, 'refuse');
  assert.match(result.reply, /cannot draft/i);
  assert.match(result.reply, /legitimate user value/i);
});

test('recommends loop mode for novel high-risk or explicitly benchmarked asks', () => {
  const result = evaluatePrdFastPath('Write a PRD for a regulated medical diagnosis assistant and run the full benchmark loop.');
  assert.ok(result);
  assert.equal(result.mode, 'loop_mode');
  assert.equal(result.tokenMode, 'loop_mode');
  assert.match(result.reply, /loop mode/i);
  assert.match(result.reply, /benchmark cases/);

  const weakResult = evaluatePrdFastPath('This PRD keeps missing the user problem after repeated edits; improve it.');
  assert.ok(weakResult);
  assert.equal(weakResult.mode, 'loop_mode');
  assert.match(weakResult.reasons.join(','), /weak_feedback/);
});

test('does not treat no-rerun safety wording as a request for loop mode', () => {
  const result = evaluatePrdFastPath(
    'Write a PRD for reducing invoice export failures for finance admins after CSV jobs time out. Use the PRD Writing domain chip if it fits, but do not run a benchmark, loop, schedule, activation, mission, or publication.'
  );

  assert.ok(result);
  assert.equal(result.mode, 'draft_prd');
  assert.match(result.reply, /PRD draft: Invoice Export/i);
  assert.doesNotMatch(result.reply, /should use loop mode/i);
});

test('adds review packet sections for sensitive or dependency-heavy drafts', () => {
  const result = evaluatePrdFastPath('Write a PRD for support impersonation controls where agents need temporary access but customers must be protected.');
  assert.ok(result);
  assert.equal(result.mode, 'draft_prd');
  assert.equal(result.tokenMode, 'review_packet');
  assert.match(result.reply, /Checks:/);
  assert.match(result.reply, /privacy\/security review/);
  assert.match(result.reply, /upstream owners \+ rollback/);
});

test('cheap regression probes preserve distilled loop lessons', () => {
  for (const probe of distilledPrdRegressionProbes()) {
    const result = evaluatePrdFastPath(probe.prompt);
    assert.ok(result, `${probe.id} should be handled by the PRD fast path`);
    assert.equal(result.mode, probe.expectedMode, probe.id);
    assert.ok(result.quickScore >= 70, probe.id);
  }
});

test('renderer returns null for unrelated chat', () => {
  assert.equal(renderDistilledPrdFastPathReply('How is Spark live status today?'), null);
});
