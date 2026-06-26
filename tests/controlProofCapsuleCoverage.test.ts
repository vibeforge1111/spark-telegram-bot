import assert from 'node:assert/strict';
import {
  ACTION_PROOF_CAPSULE_POLICIES,
  checkProofCapsuleCoverage,
  formatProofCapsuleCoverageReport
} from '../src/controlProofCapsuleCoverage';
import { buildTelegramLegacyAuthorityInventory } from '../src/legacyAuthorityInventory';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('proof-capsule coverage is clean for action-capable inventory planes', () => {
  const result = checkProofCapsuleCoverage({ repoRoot: process.cwd() });

  assert.equal(result.ok, true);
  assert.equal(result.gaps.length, 0);
  assert.ok(result.checkedPlanes >= 10);
  assert.equal(result.policyCount, result.checkedPlanes);
  assert.match(formatProofCapsuleCoverageReport(result), /Status: clean/);
});

test('every high-agency inventory plane has exactly one proof policy', () => {
  const inventory = buildTelegramLegacyAuthorityInventory();
  const highAgencyPlanes = inventory.planes.filter((plane) => Object.values(plane.authority_risk).some(Boolean));
  const policyIds = ACTION_PROOF_CAPSULE_POLICIES.map((policy) => policy.planeId).sort();
  const planeIds = highAgencyPlanes.map((plane) => plane.plane_id).sort();

  assert.deepEqual(policyIds, planeIds);
});

test('coverage checker reports missing policy gaps', () => {
  const policies = ACTION_PROOF_CAPSULE_POLICIES.filter((policy) => policy.planeId !== 'legacy-plane:telegram-action-authority');
  const result = checkProofCapsuleCoverage({ repoRoot: process.cwd(), policies });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.planeId === 'legacy-plane:telegram-action-authority' && gap.reason === 'missing_policy'));
});

test('coverage checker reports ambiguous duplicate policy gaps', () => {
  const duplicate = ACTION_PROOF_CAPSULE_POLICIES.find((policy) => policy.planeId === 'legacy-plane:telegram-action-authority');
  assert.ok(duplicate);
  const result = checkProofCapsuleCoverage({
    repoRoot: process.cwd(),
    policies: [...ACTION_PROOF_CAPSULE_POLICIES, { ...duplicate }]
  });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.planeId === 'legacy-plane:telegram-action-authority' && gap.reason === 'ambiguous_policy'));
});

test('coverage checker reports extra policy gaps', () => {
  const result = checkProofCapsuleCoverage({
    repoRoot: process.cwd(),
    policies: [
      ...ACTION_PROOF_CAPSULE_POLICIES,
      {
        planeId: 'legacy-plane:retired-action-route',
        proofPath: {
          kind: 'joined_capsule',
          summary: 'Retired route should not have an active proof policy.'
        },
        requiredSourceMarkers: []
      }
    ]
  });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.planeId === 'legacy-plane:retired-action-route' && gap.reason === 'extra_policy'));
});

test('coverage checker reports source marker gaps', () => {
  const policies = ACTION_PROOF_CAPSULE_POLICIES.map((policy) => (
    policy.planeId === 'legacy-plane:telegram-action-authority'
      ? { ...policy, requiredSourceMarkers: [...policy.requiredSourceMarkers, 'definitely_missing_marker_for_test'] }
      : policy
  ));
  const result = checkProofCapsuleCoverage({ repoRoot: process.cwd(), policies });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.planeId === 'legacy-plane:telegram-action-authority' && gap.reason === 'missing_marker'));
});

test('coverage checker rejects markerless proof policies', () => {
  const policies = ACTION_PROOF_CAPSULE_POLICIES.map((policy) => (
    policy.planeId === 'legacy-plane:telegram-action-authority'
      ? { ...policy, requiredSourceMarkers: [] }
      : policy
  ));
  const result = checkProofCapsuleCoverage({ repoRoot: process.cwd(), policies });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => (
    gap.planeId === 'legacy-plane:telegram-action-authority' &&
    gap.reason === 'missing_marker_policy'
  )));
  assert.match(formatProofCapsuleCoverageReport(result), /missing_marker_policy/);
});

test('coverage checker rejects no-action-only policy on execution routes', () => {
  const policies = ACTION_PROOF_CAPSULE_POLICIES.map((policy) => (
    policy.planeId === 'legacy-plane:telegram-action-authority'
      ? {
          ...policy,
          proofPath: {
            kind: 'explicit_no_action' as const,
            summary: 'This execution-capable authority route is incorrectly marked as no-action only.'
          }
        }
      : policy
  ));
  const result = checkProofCapsuleCoverage({ repoRoot: process.cwd(), policies });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => (
    gap.planeId === 'legacy-plane:telegram-action-authority' &&
    gap.reason === 'incompatible_policy_kind'
  )));
});

test('coverage checker allows explicit no-action policy for pending-state followups', () => {
  const result = checkProofCapsuleCoverage({ repoRoot: process.cwd() });

  assert.equal(result.ok, true);
  assert.ok(ACTION_PROOF_CAPSULE_POLICIES.some((policy) => (
    policy.planeId === 'legacy-plane:telegram-pending-state-followups' &&
    policy.proofPath.kind === 'explicit_no_action'
  )));
});
