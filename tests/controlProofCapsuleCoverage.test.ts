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
