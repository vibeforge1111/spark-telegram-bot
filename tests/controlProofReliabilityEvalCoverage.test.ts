import assert from 'node:assert/strict';
import {
  RELIABILITY_EVAL_REQUIREMENTS,
  checkReliabilityEvalCoverage,
  formatReliabilityEvalCoverageReport
} from '../src/controlProofReliabilityEvalCoverage';
import { CONTROL_PROOF_LIVE_CANARY_CASES } from '../src/controlProofLiveCanaryPack';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('reliability eval coverage is clean for required old-edge categories', () => {
  const result = checkReliabilityEvalCoverage();

  assert.equal(result.ok, true);
  assert.equal(result.gaps.length, 0);
  assert.equal(result.requirementCount, 8);
  assert.ok(result.checkedCaseCount >= 12);
  assert.match(formatReliabilityEvalCoverageReport(result), /Status: clean/);
});

test('reliability eval requirements name the ladder categories', () => {
  const ids = RELIABILITY_EVAL_REQUIREMENTS.map((requirement) => requirement.id).sort();

  assert.deepEqual(ids, [
    'audio',
    'build_mission_mentions',
    'do_not_run',
    'images',
    'just_explain',
    'publish_handoffs',
    'stale_memory_conflicts',
    'streaming_rich_messages'
  ]);
  assert.equal(
    RELIABILITY_EVAL_REQUIREMENTS.every((requirement) => requirement.requiredCaptures?.includes('observedReply')),
    true
  );
  assert.equal(
    RELIABILITY_EVAL_REQUIREMENTS.every((requirement) => requirement.requiredCaptures?.includes('sideEffects')),
    true
  );
  assert.equal(
    RELIABILITY_EVAL_REQUIREMENTS.every((requirement) => requirement.allowedMutationClasses?.length),
    true
  );
  assert.equal(
    RELIABILITY_EVAL_REQUIREMENTS.every((requirement) => requirement.allowedCategories?.length),
    true
  );
  assert.equal(
    RELIABILITY_EVAL_REQUIREMENTS.every((requirement) => requirement.allowedAuthorities?.length),
    true
  );
});

test('coverage checker reports missing canary cases', () => {
  const cases = CONTROL_PROOF_LIVE_CANARY_CASES.filter((entry) => entry.id !== 'cp-noaction-002');
  const result = checkReliabilityEvalCoverage({ cases });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.requirementId === 'just_explain' && gap.reason === 'missing_case'));
});

test('coverage checker rejects requirements without canary cases', () => {
  const result = checkReliabilityEvalCoverage({
    requirements: [{
      id: 'empty_requirement',
      label: 'Empty requirement',
      requiredCaseIds: [],
      promptPattern: /empty/i,
      routePattern: /plain_chat/,
      allowedRisks: ['safe'],
      allowedAuthorities: ['chat_only'],
      allowedMutationClasses: ['none'],
      allowedReplyShapes: ['natural'],
      requiredCaptures: ['observedReply', 'sideEffects']
    }]
  });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => (
    gap.requirementId === 'empty_requirement' &&
    gap.reason === 'missing_requirement_cases'
  )));
  assert.match(formatReliabilityEvalCoverageReport(result), /missing_requirement_cases/);
});

test('coverage checker rejects requirements without boundary policy expectations', () => {
  const result = checkReliabilityEvalCoverage({
    requirements: [{
      id: 'weak_requirement',
      label: 'Weak requirement',
      requiredCaseIds: ['cp-noaction-001'],
      requiredCaptures: ['observedReply']
    }]
  });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => (
    gap.requirementId === 'weak_requirement' &&
    gap.reason === 'missing_requirement_policy' &&
    /canary categories/.test(gap.detail)
  )));
  assert.ok(result.gaps.some((gap) => (
    gap.requirementId === 'weak_requirement' &&
    gap.reason === 'missing_requirement_policy' &&
    /route pattern/.test(gap.detail)
  )));
  assert.ok(result.gaps.some((gap) => (
    gap.requirementId === 'weak_requirement' &&
    gap.reason === 'missing_requirement_policy' &&
    /sideEffects/.test(gap.detail)
  )));
  assert.match(formatReliabilityEvalCoverageReport(result), /missing_requirement_policy/);
});

test('coverage checker reports prompt and route drift', () => {
  const cases = CONTROL_PROOF_LIVE_CANARY_CASES.map((entry) => (
    entry.id === 'cp-publish-001'
      ? { ...entry, prompt: 'hello', expectedRoute: 'plain_chat' }
      : entry
  ));
  const result = checkReliabilityEvalCoverage({ cases });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.requirementId === 'publish_handoffs' && gap.reason === 'prompt_mismatch'));
  assert.ok(result.gaps.some((gap) => gap.requirementId === 'publish_handoffs' && gap.reason === 'route_mismatch'));
});

test('coverage checker reports canary category drift', () => {
  const cases = CONTROL_PROOF_LIVE_CANARY_CASES.map((entry) => (
    entry.id === 'cp-streaming-001'
      ? { ...entry, category: 'memory' as const }
      : entry
  ));
  const result = checkReliabilityEvalCoverage({ cases });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) =>
    gap.requirementId === 'streaming_rich_messages' &&
    gap.caseId === 'cp-streaming-001' &&
    gap.reason === 'category_mismatch'
  ));
  assert.match(formatReliabilityEvalCoverageReport(result), /category_mismatch/);
});

test('coverage checker reports capture drift at the route boundary', () => {
  const cases = CONTROL_PROOF_LIVE_CANARY_CASES.map((entry) => (
    entry.id === 'cp-noaction-002'
      ? { ...entry, capture: { ...entry.capture, proofPanel: false } }
      : entry
  ));
  const result = checkReliabilityEvalCoverage({ cases });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) =>
    gap.requirementId === 'just_explain' &&
    gap.caseId === 'cp-noaction-002' &&
    gap.reason === 'capture_mismatch'
  ));
  assert.match(formatReliabilityEvalCoverageReport(result), /capture_mismatch/);
});

test('coverage checker reports authority and mutation drift for no-action cases', () => {
  const cases = CONTROL_PROOF_LIVE_CANARY_CASES.map((entry) => (
    entry.id === 'cp-noaction-001'
      ? {
          ...entry,
          risk: 'intentional_action' as const,
          expectedAuthority: 'confirmation_required_or_allowed' as const,
          expectedMutationClass: 'launches_mission' as const,
          expectedReplyShape: 'compact_card' as const
        }
      : entry
  ));
  const result = checkReliabilityEvalCoverage({ cases });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.requirementId === 'do_not_run' && gap.reason === 'risk_mismatch'));
  assert.ok(result.gaps.some((gap) => gap.requirementId === 'do_not_run' && gap.reason === 'authority_mismatch'));
  assert.ok(result.gaps.some((gap) => gap.requirementId === 'do_not_run' && gap.reason === 'mutation_mismatch'));
  assert.ok(result.gaps.some((gap) => gap.requirementId === 'do_not_run' && gap.reason === 'reply_shape_mismatch'));
});

test('coverage checker reports publish handoff mutation drift', () => {
  const cases = CONTROL_PROOF_LIVE_CANARY_CASES.map((entry) => (
    entry.id === 'cp-publish-001'
      ? {
          ...entry,
          expectedMutationClass: 'writes_files' as const,
          expectedAuthority: 'confirmation_required_or_allowed' as const
        }
      : entry
  ));
  const result = checkReliabilityEvalCoverage({ cases });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.requirementId === 'publish_handoffs' && gap.reason === 'mutation_mismatch'));
  assert.ok(result.gaps.some((gap) => gap.requirementId === 'publish_handoffs' && gap.reason === 'authority_mismatch'));
});
