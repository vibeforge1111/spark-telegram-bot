import assert from 'node:assert/strict';
import {
  buildTelegramLegacyAuthorityInventory,
  buildTelegramLegacyAuthorityPlanes
} from '../src/legacyAuthorityInventory';
import type { LegacyAuthorityRisk } from '@spark/harness-core';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function hasHighAgencyRisk(risk: LegacyAuthorityRisk): boolean {
  return Object.values(risk).some(Boolean);
}

test('Telegram legacy authority inventory is promotion-ready under the Harness Core contract', () => {
  const inventory = buildTelegramLegacyAuthorityInventory();

  assert.equal(inventory.schema_version, 'legacy-authority-inventory-v1');
  assert.equal(inventory.scope.owner_repo, 'spark-telegram-bot');
  assert.deepEqual(inventory.scope.surfaces, ['telegram']);
  assert.equal(inventory.release_gate.zero_high_agency_legacy_local_gates, true);
  assert.equal(inventory.release_gate.ready_for_readiness_promotion, true);
  assert.ok('ready_for_readiness_promotion' in inventory.release_gate);
  assert.equal(inventory.summary.release_blocker_count, 0);
  assert.deepEqual(inventory.release_gate.blockers, []);
  assert.ok(inventory.summary.plane_count >= 18);
  assert.equal(inventory.summary.plane_count, inventory.planes.length);
});

test('old Telegram regex and parser planes are evidence only', () => {
  const evidenceOnlyPlanes = buildTelegramLegacyAuthorityPlanes().filter((plane) => (
    plane.disposition === 'evidence_adapter'
  ));

  assert.ok(evidenceOnlyPlanes.length >= 6);
  for (const plane of evidenceOnlyPlanes) {
    assert.equal(hasHighAgencyRisk(plane.authority_risk), false, `${plane.plane_id} retained high-agency risk`);
    assert.equal(plane.harness_binding.evidence_only, true, `${plane.plane_id} must be evidence-only`);
    assert.equal(plane.harness_binding.consumer_of_governor, false, `${plane.plane_id} must not consume Governor as an authority`);
    assert.equal(plane.harness_binding.ledger_required, false, `${plane.plane_id} must not claim execution ledger authority`);
    assert.equal(plane.blockers.length, 0, `${plane.plane_id} has blockers`);
  }
});

test('high-agency Telegram planes are Harness Core consumers with Governor and ledger required', () => {
  const inventory = buildTelegramLegacyAuthorityInventory();
  const highAgencyPlanes = inventory.planes.filter((plane) => hasHighAgencyRisk(plane.authority_risk));

  assert.ok(highAgencyPlanes.length >= 10);
  assert.equal(highAgencyPlanes.length, inventory.summary.high_agency_risk_count);

  for (const plane of highAgencyPlanes) {
    assert.equal(plane.disposition, 'canonical_consumer', `${plane.plane_id} must be canonical consumer, not local authority`);
    assert.equal(plane.harness_binding.governor_required, true, `${plane.plane_id} must require Governor`);
    assert.equal(plane.harness_binding.consumer_of_governor, true, `${plane.plane_id} must consume Governor`);
    assert.equal(plane.harness_binding.ledger_required, true, `${plane.plane_id} must require ledger evidence`);
    assert.equal(plane.blockers.length, 0, `${plane.plane_id} has blockers`);
  }
});

test('Spawner bridge authority summary uses Loop Engineering public wording', () => {
  const plane = buildTelegramLegacyAuthorityPlanes().find((entry) => (
    entry.source_ref.id === 'artifact:telegram-spawner-creator-bridge:source'
  ));

  assert.ok(plane);
  const summary = plane.evidence.map((entry) => entry.summary).join(' ');
  assert.match(summary, /Spawner Loop Engineering/);
  assert.match(summary, /legacy creator mission API/);
  assert.doesNotMatch(summary, /^Spawner, creator mission,/);
});

test('Telegram inventory names the known old patch planes that could fight routing', () => {
  const planeIds = new Set(buildTelegramLegacyAuthorityPlanes().map((plane) => plane.source_ref.id));

  [
    'artifact:telegram-intent-gate-v2:source',
    'artifact:telegram-natural-route-decision:source',
    'artifact:telegram-route-firewall:source',
    'artifact:telegram-build-intent-parser:source',
    'artifact:telegram-conversation-intent-extractors:source',
    'artifact:telegram-pending-state-followups:source',
    'artifact:telegram-memory-wiki-bridge:source',
    'artifact:telegram-recursive-sparkqa-startup:source'
  ].forEach((id) => assert.ok(planeIds.has(id), `missing inventory plane ${id}`));
});
