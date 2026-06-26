import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  checkSurfaceEval,
  formatSurfaceEvalReport
} from '../src/controlProofSurfaceEval';
import type { ControlProofCanaryObservationTemplate } from '../src/controlProofLiveCanaryPack';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function fullPacket(): ControlProofCanaryObservationTemplate {
  const packetPath = resolve(__dirname, '..', 'outputs', 'live-canary-full', 'live-canary-observations.json');
  return JSON.parse(readFileSync(packetPath, 'utf8')) as ControlProofCanaryObservationTemplate;
}

test('surface eval is clean for the checked full canary packet', () => {
  const result = checkSurfaceEval({ observations: fullPacket() });

  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
  assert.ok(result.checkedCases >= 24);
  assert.ok(result.skippedCases >= 2);
  assert.match(formatSurfaceEvalReport(result), /Status: clean/);
});

test('surface eval ignores proof panels but checks natural replies', () => {
  const packet = fullPacket();
  const proof = packet.cases.find((entry) => entry.id === 'cp-proof-001');
  const natural = packet.cases.find((entry) => entry.id === 'cp-builder-001');
  assert.ok(proof);
  assert.ok(natural);
  proof.observed.reply = 'Harness Proof\nMission\nProvider\nMove';
  natural.observed.reply = 'Mission\nProvider\nMove';

  const result = checkSurfaceEval({ observations: packet });

  assert.equal(result.ok, false);
  assert.ok(result.cases.find((entry) => entry.caseId === 'cp-proof-001')?.checked === false);
  assert.ok(result.issues.some((issue) => issue.caseId === 'cp-builder-001' && issue.code === 'report_card_voice'));
});

test('surface eval catches raw internals and generic chatbot voice', () => {
  const packet = fullPacket();
  const entry = packet.cases.find((item) => item.id === 'cp-memory-001');
  assert.ok(entry);
  entry.observed.reply = 'Certainly! Here is the answer. Blocked by tool_not_allowed_by_policy with trace:telegram:abcdef1234567890.';

  const result = checkSurfaceEval({ observations: packet });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.caseId === 'cp-memory-001' && issue.code === 'generic_chatbot_voice'));
  assert.ok(result.issues.some((issue) => issue.caseId === 'cp-memory-001' && issue.code === 'raw_reason_code'));
  assert.ok(result.issues.some((issue) => issue.caseId === 'cp-memory-001' && issue.code === 'raw_trace_ref'));
});

test('surface eval catches legacy source references in observed replies', () => {
  const packet = fullPacket();
  const entry = packet.cases.find((item) => item.id === 'cp-authority-001');
  assert.ok(entry);
  entry.observed.reply = 'The Genesis live Telegram 100 benchmark says this is current.';

  const result = checkSurfaceEval({ observations: packet });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) =>
    issue.caseId === 'cp-authority-001' &&
    issue.code === 'legacy_source_reference'
  ));
  assert.match(formatSurfaceEvalReport(result), /legacy_source_reference/);
});

test('surface eval catches missing replies and oversized paragraphs', () => {
  const packet = fullPacket();
  const missing = packet.cases.find((item) => item.id === 'cp-authority-001');
  const long = packet.cases.find((item) => item.id === 'cp-authority-002');
  assert.ok(missing);
  assert.ok(long);
  missing.observed.reply = null;
  long.observed.reply = Array.from({ length: 80 }, (_, index) => `word${index}`).join(' ');

  const result = checkSurfaceEval({ observations: packet });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.caseId === 'cp-authority-001' && issue.code === 'missing_reply'));
  assert.ok(result.issues.some((issue) => issue.caseId === 'cp-authority-002' && issue.code === 'paragraph_too_long'));
});
