import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  CONTROL_PROOF_LIVE_CANARY_CASES,
  formatControlProofCanaryChecklist,
  formatControlProofCanaryCopyPaste,
  selectControlProofCanaryCases,
  type ControlProofCanaryCategory
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

const ROOT = resolve(__dirname, '..');

test('control-proof canary pack stays small enough for live runs', () => {
  assert.ok(CONTROL_PROOF_LIVE_CANARY_CASES.length >= 20);
  assert.ok(CONTROL_PROOF_LIVE_CANARY_CASES.length <= 30);
  assert.equal(new Set(CONTROL_PROOF_LIVE_CANARY_CASES.map((entry) => entry.id)).size, CONTROL_PROOF_LIVE_CANARY_CASES.length);
});

test('control-proof canary pack covers the current Harness Core behavior areas', () => {
  const categories = new Set(CONTROL_PROOF_LIVE_CANARY_CASES.map((entry) => entry.category));
  const required: ControlProofCanaryCategory[] = [
    'no_action',
    'authority',
    'proof',
    'streaming',
    'rich_messages',
    'builder',
    'spawner_build',
    'mission',
    'memory',
    'access',
    'web_research',
    'model_switch',
    'media',
    'voice'
  ];

  for (const category of required) {
    assert.ok(categories.has(category), `missing category ${category}`);
  }
});

test('control-proof canaries carry Harness-shaped expectations and capture fields', () => {
  for (const entry of CONTROL_PROOF_LIVE_CANARY_CASES) {
    assert.ok(entry.expectedAuthority, `${entry.id} missing expectedAuthority`);
    assert.ok(entry.expectedMutationClass, `${entry.id} missing expectedMutationClass`);
    assert.ok(entry.expectedRoute, `${entry.id} missing expectedRoute`);
    assert.ok(entry.expectedSideEffect, `${entry.id} missing expectedSideEffect`);
    assert.ok(entry.expectedProofJoin, `${entry.id} missing expectedProofJoin`);
    assert.ok(entry.passCriteria.length > 0, `${entry.id} missing pass criteria`);
    assert.equal(entry.capture.observedReply, true, `${entry.id} must capture observed reply`);
    assert.equal(typeof entry.capture.sideEffects, 'boolean');
    assert.equal(typeof entry.capture.proofPanel, 'boolean');
    assert.equal(typeof entry.capture.screenshot, 'boolean');
    assert.equal(typeof entry.capture.userConfirmation, 'boolean');
  }
});

test('default selection excludes intentional live actions but explicit selection can include them', () => {
  const selected = selectControlProofCanaryCases();
  assert.ok(selected.length < CONTROL_PROOF_LIVE_CANARY_CASES.length);
  assert.equal(selected.some((entry) => entry.risk === 'intentional_action'), false);

  const explicit = selectControlProofCanaryCases(CONTROL_PROOF_LIVE_CANARY_CASES, { caseId: 'cp-mission-001' });
  assert.deepEqual(explicit.map((entry) => entry.id), ['cp-mission-001']);
  assert.equal(explicit[0].risk, 'intentional_action');
});

test('category selection keeps non-action defaults safe', () => {
  const selected = selectControlProofCanaryCases(CONTROL_PROOF_LIVE_CANARY_CASES, { category: 'spawner_build' });

  assert.deepEqual(selected.map((entry) => entry.id), ['cp-spawner-001']);
});

test('copy-paste output keeps scoring expectations outside Telegram blocks', () => {
  const promptSheet = formatControlProofCanaryCopyPaste([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ]);

  assert.match(promptSheet, /SparkRecursive_bot Control-Proof Canary Prompts/);
  assert.match(promptSheet, /```text\nIn one sentence, what does route confidence mean for Spark\? Do not start anything\.\n```/);
  assert.doesNotMatch(promptSheet, /Expected route|Expected side effect|builder_gateway\.plain_chat|Builder gateway row should carry/);
});

test('checklist output includes proof, side-effect, visual, authority, and mutation capture', () => {
  const checklist = formatControlProofCanaryChecklist([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-proof-001')!
  ]);

  assert.match(checklist, /Expected authority:/);
  assert.match(checklist, /Expected mutation class:/);
  assert.match(checklist, /Observed reply:/);
  assert.match(checklist, /Observed side effects:/);
  assert.match(checklist, /Observed proof join:/);
  assert.match(checklist, /Screenshot\/user confirmation:/);
});

test('control-proof canary CLI lists and exports selected cases', () => {
  const list = spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
      'ops/controlProofLiveCanaryPack.ts',
      '--case',
      'cp-builder-001',
      '--list'
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );

  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /^cp-builder-001\tbuilder\tsafe\tread_only_allowed\tread_only\tnatural/m);

  const json = spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
      'ops/controlProofLiveCanaryPack.ts',
      '--case',
      'cp-builder-001',
      '--json'
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );

  assert.equal(json.status, 0, json.stderr);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.target, 'SparkRecursive_bot');
  assert.equal(parsed.cases[0].id, 'cp-builder-001');
  assert.equal(parsed.cases[0].expectedAuthority, 'read_only_allowed');
});
