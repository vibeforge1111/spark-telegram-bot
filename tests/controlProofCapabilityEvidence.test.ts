import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CAPABILITY_EVIDENCE_POLICIES,
  checkCapabilityEvidence,
  formatCapabilityEvidenceReport
} from '../src/controlProofCapabilityEvidence';
import {
  type ControlProofCanaryObservationCase,
  type ControlProofCanaryObservationTemplate
} from '../src/controlProofLiveCanaryPack';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function passingTemplate(): ControlProofCanaryObservationTemplate {
  const packetPath = resolve(__dirname, '..', 'outputs', 'live-canary-full', 'live-canary-observations.json');
  return JSON.parse(readFileSync(packetPath, 'utf8')) as ControlProofCanaryObservationTemplate;
}

test('capability evidence is clean for full passing canary observations', () => {
  const result = checkCapabilityEvidence({ observations: passingTemplate() });

  assert.equal(result.ok, true);
  assert.equal(result.gaps.length, 0);
  assert.equal(result.capabilityCount, CAPABILITY_EVIDENCE_POLICIES.length);
  assert.ok(result.records.every((record) => record.lastSuccessAt));
  assert.ok(result.records.every((record) => record.lastFailureOrBoundaryAt));
  assert.match(formatCapabilityEvidenceReport(result), /Status: clean/);
});

test('capability evidence policies cover current capability lanes', () => {
  const keys = CAPABILITY_EVIDENCE_POLICIES.map((policy) => policy.capabilityKey).sort();

  assert.deepEqual(keys, [
    'access',
    'builder_gateway',
    'fresh_authority_status',
    'media_voice_audio',
    'memory',
    'mission_launch',
    'model_switch',
    'proof_panel',
    'publish_registry',
    'spawner_build',
    'streaming_rich_messages',
    'telegram_no_action_boundary',
    'web_research'
  ]);
});

test('capability evidence reports failed success cases', () => {
  const template = passingTemplate();
  const entry = template.cases.find((item: ControlProofCanaryObservationCase) => item.id === 'cp-builder-001');
  assert.ok(entry);
  entry.observed.verdict = 'fail';

  const result = checkCapabilityEvidence({ observations: template });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.capabilityKey === 'builder_gateway' && gap.caseId === 'cp-builder-001' && gap.reason === 'case_not_passed'));
});

test('capability evidence reports missing boundary captures', () => {
  const template = passingTemplate();
  const entry = template.cases.find((item: ControlProofCanaryObservationCase) => item.id === 'cp-memory-002');
  assert.ok(entry);
  entry.observed.proofJoin = null;

  const result = checkCapabilityEvidence({ observations: template });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.capabilityKey === 'memory' && gap.caseId === 'cp-memory-002' && gap.reason === 'missing_capture'));
});

test('publish capability requires publish-not-ready handoff evidence', () => {
  const template = passingTemplate();
  template.evidence.sparkOsCompile = JSON.stringify({ publish_handoffs: null });

  const result = checkCapabilityEvidence({ observations: template });

  assert.equal(result.ok, false);
  assert.ok(result.gaps.some((gap) => gap.capabilityKey === 'publish_registry' && gap.reason === 'missing_publish_handoff'));
});
