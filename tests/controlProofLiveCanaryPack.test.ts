import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  CONTROL_PROOF_LIVE_CANARY_CASES,
  buildControlProofCanaryObservationTemplate,
  formatControlProofCanaryObservationSummary,
  formatControlProofCanaryChecklist,
  formatControlProofCanaryCoverage,
  formatControlProofCanaryCopyPaste,
  formatControlProofCanaryLiveRunGuide,
  recordControlProofCanaryObservation,
  selectControlProofCanaryCases,
  summarizeControlProofCanaryCoverage,
  summarizeControlProofCanaryObservations,
  withControlProofCanaryRuntimeEvidence,
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
const CLEAN_CONTROL_PROOF_AUDIT = [
  'missing evidence: 0',
  'missing trace joins: 0',
  'missing proof capsules: 0',
  'legacy proof gaps: 4',
  'raw ref leaks: 0',
  'robotic failure reasons: 0',
  'stack-like leaks: 0'
].join('\n');
const CLEAN_PROOF_PANEL = [
  'Harness Proof',
  'Intent: builder_gateway.plain_chat',
  'Authority: allowed by spark.turn_intent.v1',
  'Governor: allow, verified',
  'Execution: not_started',
  'Reply: delivered as natural',
  'Audit blocking: clean',
  'Legacy proof gaps visible: 4'
].join('\n');

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
    'audio',
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
    for (const ref of entry.sourceRefs || []) {
      assert.ok(ref.catalog, `${entry.id} has source ref without catalog`);
      assert.ok(ref.caseId, `${entry.id} has source ref without case id`);
      assert.ok(ref.relationship, `${entry.id} has source ref without relationship`);
    }
  }
});

test('promoted canaries keep traceable legacy source references', () => {
  const byId = new Map(CONTROL_PROOF_LIVE_CANARY_CASES.map((entry) => [entry.id, entry]));

  assert.deepEqual(
    byId.get('cp-builder-001')?.sourceRefs,
    [
      { catalog: 'natural-language-live-commands.json', caseId: 'memory-004', relationship: 'derived_from' }
    ]
  );
  assert.ok(
    byId.get('cp-spawner-001')?.sourceRefs?.some((ref) => ref.catalog === 'natural-language-live-commands.json' && ref.caseId === 'build-004'),
    'cp-spawner-001 should point back to the old no-build design prompt'
  );
  assert.ok(
    byId.get('cp-mission-001')?.sourceRefs?.some((ref) => ref.catalog === 'genesis-live-telegram-100.json' && ref.caseId === 'genesis-061'),
    'cp-mission-001 should point back to the Genesis no-edit mission smoke'
  );
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

test('streaming and rich-message canaries stay visual release checks', () => {
  const selected = selectControlProofCanaryCases(CONTROL_PROOF_LIVE_CANARY_CASES, {
    caseIds: ['cp-streaming-001', 'cp-streaming-002']
  });

  assert.deepEqual(selected.map((entry) => entry.category), ['streaming', 'rich_messages']);
  for (const entry of selected) {
    assert.equal(entry.capture.screenshot, true, `${entry.id} needs Telegram visual capture`);
    assert.equal(entry.capture.userConfirmation, true, `${entry.id} needs user confirmation capture`);
    assert.match(entry.passCriteria.join('\n'), /duplicate|render|settings/i);
  }
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
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ]);

  assert.match(checklist, /Expected authority:/);
  assert.match(checklist, /Expected mutation class:/);
  assert.match(checklist, /Source refs: natural-language-live-commands\.json:memory-004:derived_from/);
  assert.match(checklist, /Observed reply:/);
  assert.match(checklist, /Observed side effects:/);
  assert.match(checklist, /Observed proof join:/);
  assert.match(checklist, /Screenshot\/user confirmation:/);
});

test('coverage output summarizes categories, action risk, and mutation classes', () => {
  const coverage = formatControlProofCanaryCoverage(CONTROL_PROOF_LIVE_CANARY_CASES);

  assert.match(coverage, /Control-Proof Canary Coverage/);
  assert.match(coverage, /Cases: 27/);
  assert.match(coverage, /Intentional action cases: 4/);
  assert.match(coverage, /Manual media cases: 4/);
  assert.match(coverage, /Required category coverage: complete/);
  assert.match(coverage, /Missing required categories: none/);
  assert.match(coverage, /- mission: 1/);
  assert.match(coverage, /- streaming: 1/);
  assert.match(coverage, /- rich_messages: 1/);
  assert.match(coverage, /- launches_mission: 1/);
  assert.match(coverage, /- confirmation_required_or_allowed:/);

  const narrow = formatControlProofCanaryCoverage([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ]);
  const narrowSummary = summarizeControlProofCanaryCoverage([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ]);
  assert.equal(narrowSummary.coverageComplete, false);
  assert.ok(narrowSummary.missingRequiredCategories.includes('mission'));
  assert.match(narrow, /Required category coverage: missing/);
  assert.match(narrow, /Missing required categories: .*mission/);
});

test('live run guide pairs Telegram prompts with record commands', () => {
  const guide = formatControlProofCanaryLiveRunGuide([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!,
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-streaming-001')!
  ], { observationsPath: '/tmp/live-canary-observations.json' });

  assert.match(guide, /SparkRecursive_bot Control-Proof Live Run Guide/);
  assert.match(guide, /Observation packet: \/tmp\/live-canary-observations\.json/);
  assert.match(guide, /```text\nIn one sentence, what does route confidence mean for Spark\? Do not start anything\.\n```/);
  assert.match(guide, /Proof inspection prompt:\n```text\n\/proof\n```/);
  assert.match(guide, /--observations '\/tmp\/live-canary-observations\.json' --record-case cp-builder-001/);
  assert.match(guide, /--reply-file '\/tmp\/cp-builder-001-reply\.txt'/);
  assert.match(guide, /--mission-started <true\|false\|unknown>/);
  assert.match(guide, /--screenshot-ref '\/tmp\/cp-streaming-001\.png'/);
  assert.doesNotMatch(guide, /```text\n(?:(?!```).)*Expected route/s);
});

test('live run guide omits proof inspection for cases without proof-panel capture', () => {
  const guide = formatControlProofCanaryLiveRunGuide([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-streaming-001')!
  ]);

  assert.match(guide, /cp-streaming-001/);
  assert.doesNotMatch(guide, /Proof inspection prompt/);
  assert.doesNotMatch(guide, /--proof-panel/);
});

test('observation template records expected fields and empty live observations', () => {
  const template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });

  assert.equal(template.target, 'SparkRecursive_bot');
  assert.equal(template.generatedAt, '2026-06-24T00:00:00.000Z');
  assert.deepEqual(template.verdictValues, ['pass', 'fail', 'blocked', 'needs-retest', 'untested']);
  assert.equal(template.evidence.sparkLiveStatus, null);
  assert.equal(template.evidence.controlProofAudit, null);
  assert.equal(template.cases[0].id, 'cp-builder-001');
  assert.deepEqual(template.cases[0].sourceRefs, [
    { catalog: 'natural-language-live-commands.json', caseId: 'memory-004', relationship: 'derived_from' }
  ]);
  assert.equal(template.cases[0].expected.route, 'builder_gateway.plain_chat');
  assert.equal(template.cases[0].expected.proofJoin, 'Builder gateway row should carry harnessProofRef; Telegram delivery keeps matching capsule.');
  assert.equal(template.cases[0].observed.verdict, 'untested');
  assert.equal(template.cases[0].observed.reply, null);
  assert.equal(template.cases[0].observed.proofJoin, null);
  assert.equal(template.cases[0].observed.sideEffects.missionStarted, null);
  assert.deepEqual(template.cases[0].observed.screenshotRefs, []);
  assert.equal(template.cases[0].observed.userConfirmation, null);
});

test('observation summary requires pass verdicts and all requested capture evidence', () => {
  let template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
  template = withControlProofCanaryRuntimeEvidence(template, {
    sparkLiveStatus: 'Spark Live healthy: primary and sparkqa-bot running.',
    providerStatus: 'chat provider ping OK.',
    runtimeSync: 'runtime in sync.',
    controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
    notes: null
  });
  template.cases[0].observed = {
    ...template.cases[0].observed,
    verdict: 'pass',
    reply: 'Route confidence means Spark is justified in taking this route now.',
    sideEffects: {
      ...template.cases[0].observed.sideEffects,
      missionStarted: false,
      notes: 'No mission or mutation observed.'
    },
    proofJoin: 'Builder gateway joined with redacted proof ref.',
    proofPanel: CLEAN_PROOF_PANEL,
    screenshotRefs: ['/tmp/spark-recursive-builder.png'],
    userConfirmation: 'User confirmed Telegram reply rendered once.'
  };

  const summary = summarizeControlProofCanaryObservations(template);
  assert.equal(summary.readyForRelease, true);
  assert.equal(summary.verdictCounts.pass, 1);
  assert.deepEqual(summary.missingPacketEvidence, []);
  assert.deepEqual(summary.cases[0].missingCaptures, []);
  assert.match(formatControlProofCanaryObservationSummary(summary), /Release gate: ready/);

  template.cases[0].observed.screenshotRefs = [];
  const missing = summarizeControlProofCanaryObservations(template);
  assert.equal(missing.readyForRelease, false);
  assert.deepEqual(missing.cases[0].missingCaptures, ['screenshot']);
  assert.match(formatControlProofCanaryObservationSummary(missing), /missing screenshot/);

  template.cases[0].observed.screenshotRefs = ['Telegram screenshot captured'];
  const vagueScreenshotRef = summarizeControlProofCanaryObservations(template);
  assert.equal(vagueScreenshotRef.readyForRelease, false);
  assert.deepEqual(vagueScreenshotRef.cases[0].missingCaptures, ['screenshot_ref']);

  template.cases[0].observed.screenshotRefs = ['telegram-screenshot: file_id hidden'];
  const rawScreenshotRef = summarizeControlProofCanaryObservations(template);
  assert.equal(rawScreenshotRef.readyForRelease, false);
  assert.deepEqual(rawScreenshotRef.cases[0].missingCaptures, ['screenshot_raw_leak']);

  template.cases[0].observed.screenshotRefs = ['/tmp/spark-recursive-builder.png'];
  template.cases[0].observed.sideEffects.missionStarted = null;
  template.cases[0].observed.sideEffects.notes = 'No mission or mutation observed.';
  const sideEffectNotesOnly = summarizeControlProofCanaryObservations(template);
  assert.equal(sideEffectNotesOnly.readyForRelease, false);
  assert.deepEqual(sideEffectNotesOnly.cases[0].missingCaptures, ['side_effects']);

  template.cases[0].observed.sideEffects.missionStarted = true;
  const unexpectedMutation = summarizeControlProofCanaryObservations(template);
  assert.equal(unexpectedMutation.readyForRelease, false);
  assert.deepEqual(unexpectedMutation.cases[0].missingCaptures, ['side_effects_unexpected_mutation']);

  template.cases[0].observed.sideEffects.missionStarted = false;
  template.cases[0].observed.proofJoin = 'missing proof';
  const missingProofJoin = summarizeControlProofCanaryObservations(template);
  assert.equal(missingProofJoin.readyForRelease, false);
  assert.deepEqual(missingProofJoin.cases[0].missingCaptures, ['proof_join_missing']);

  template.cases[0].observed.proofJoin = 'trace:raw-proof-command joined';
  const leakyProofJoin = summarizeControlProofCanaryObservations(template);
  assert.equal(leakyProofJoin.readyForRelease, false);
  assert.deepEqual(leakyProofJoin.cases[0].missingCaptures, ['proof_join_raw_leak']);

  template.cases[0].observed.proofJoin = 'Builder gateway joined with redacted proof ref.';
  template.cases[0].observed.proofPanel = 'Harness Proof\nEvidence joined: Telegram final';
  const malformedProofPanel = summarizeControlProofCanaryObservations(template);
  assert.equal(malformedProofPanel.readyForRelease, false);
  assert.deepEqual(malformedProofPanel.cases[0].missingCaptures, [
    'proof_panel_audit_status',
    'proof_panel_legacy_gap_status'
  ]);

  template.cases[0].observed.proofPanel = `${CLEAN_PROOF_PANEL}\ntool_not_allowed_by_policy /Users/example/private`;
  const leakyProofPanel = summarizeControlProofCanaryObservations(template);
  assert.equal(leakyProofPanel.readyForRelease, false);
  assert.deepEqual(leakyProofPanel.cases[0].missingCaptures, ['proof_panel_raw_leak']);

  template.cases[0].observed.proofPanel = CLEAN_PROOF_PANEL;
  template.cases[0].observed.userConfirmation = 'Looks good.';
  const vagueConfirmation = summarizeControlProofCanaryObservations(template);
  assert.equal(vagueConfirmation.readyForRelease, false);
  assert.deepEqual(vagueConfirmation.cases[0].missingCaptures, ['user_confirmation', 'user_confirmation_surface']);

  template.cases[0].observed.userConfirmation = 'Confirmed.';
  const missingConfirmationSurface = summarizeControlProofCanaryObservations(template);
  assert.equal(missingConfirmationSurface.readyForRelease, false);
  assert.deepEqual(missingConfirmationSurface.cases[0].missingCaptures, ['user_confirmation_surface']);

  template.cases[0].observed.userConfirmation = 'User confirmed Telegram reply rendered once.';
  template.evidence.controlProofAudit = null;
  const missingPacketEvidence = summarizeControlProofCanaryObservations(template);
  assert.equal(missingPacketEvidence.readyForRelease, false);
  assert.deepEqual(missingPacketEvidence.missingPacketEvidence, ['control_proof_audit']);
  assert.match(formatControlProofCanaryObservationSummary(missingPacketEvidence), /Packet evidence missing: control_proof_audit/);
});

test('observation summary rejects dirty runtime evidence even when packet fields are filled', () => {
  let template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
  template = withControlProofCanaryRuntimeEvidence(template, {
    sparkLiveStatus: 'Spark Live healthy.',
    providerStatus: 'Provider ping OK.',
    runtimeSync: 'runtime in sync.',
    controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
    notes: null
  });
  template.cases[0].observed = {
    ...template.cases[0].observed,
    verdict: 'pass',
    reply: 'Route confidence means Spark is justified in taking this route now.',
    sideEffects: {
      ...template.cases[0].observed.sideEffects,
      missionStarted: false,
      notes: 'No mutation observed.'
    },
    proofJoin: 'Builder joined.',
    proofPanel: CLEAN_PROOF_PANEL,
    screenshotRefs: ['/tmp/spark-recursive-builder.png'],
    userConfirmation: 'Confirmed in SparkRecursive_bot.'
  };

  template.evidence.controlProofAudit = 'missing evidence: 0\nmissing trace joins: 0\nmissing proof capsules: 1';
  const dirtyAudit = summarizeControlProofCanaryObservations(template);
  assert.equal(dirtyAudit.readyForRelease, false);
  assert.deepEqual(dirtyAudit.invalidPacketEvidence, ['control_proof_audit']);
  assert.match(formatControlProofCanaryObservationSummary(dirtyAudit), /Packet evidence invalid: control_proof_audit/);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT;
  template.evidence.providerStatus = 'Provider ping failed.';
  const dirtyProvider = summarizeControlProofCanaryObservations(template);
  assert.equal(dirtyProvider.readyForRelease, false);
  assert.deepEqual(dirtyProvider.invalidPacketEvidence, ['provider_status']);
});

test('observation summary rejects unfilled run-guide placeholders as missing captures', () => {
  let template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
  template = withControlProofCanaryRuntimeEvidence(template, {
    sparkLiveStatus: 'Spark Live healthy.',
    providerStatus: 'Provider ping OK.',
    runtimeSync: 'runtime in sync.',
    controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
    notes: null
  });
  template.cases[0].observed = {
    ...template.cases[0].observed,
    verdict: 'pass',
    reply: '<observed reply>',
    sideEffects: {
      ...template.cases[0].observed.sideEffects,
      missionStarted: false,
      notes: '<what changed, or no mutation observed>'
    },
    proofJoin: '<proof join observed, or missing proof>',
    proofPanel: '<proof panel text, or not shown>',
    screenshotRefs: ['<screenshot path>'],
    userConfirmation: '<confirmed in SparkRecursive_bot>'
  };

  const summary = summarizeControlProofCanaryObservations(template);
  assert.equal(summary.readyForRelease, false);
  assert.deepEqual(summary.cases[0].missingCaptures, [
    'observed_reply',
    'proof_join',
    'proof_panel',
    'screenshot',
    'user_confirmation'
  ]);
  assert.match(formatControlProofCanaryObservationSummary(summary), /missing observed_reply, proof_join, proof_panel, screenshot, user_confirmation/);
});

test('observation recorder updates one case while preserving packet evidence', () => {
  let template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
  template = withControlProofCanaryRuntimeEvidence(template, {
    sparkLiveStatus: 'Spark Live healthy.',
    providerStatus: 'Provider ping OK.',
    runtimeSync: 'runtime in sync.',
    controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
    notes: 'Collected locally.'
  });

  const recorded = recordControlProofCanaryObservation(template, {
    id: 'cp-builder-001',
    verdict: 'pass',
    reply: 'Route confidence means Spark is justified in taking this route now.',
    sideEffects: {
      missionStarted: false,
      notes: 'No mission or mutation observed.'
    },
    proofJoin: 'Builder gateway joined with redacted proof ref.',
    proofPanel: CLEAN_PROOF_PANEL,
    screenshotRefs: ['/tmp/spark-recursive-builder.png'],
    userConfirmation: 'User confirmed Telegram reply rendered once.'
  });

  assert.equal(recorded.evidence.notes, 'Collected locally.');
  assert.equal(recorded.cases[0].observed.verdict, 'pass');
  assert.equal(recorded.cases[0].observed.sideEffects.missionStarted, false);
  assert.deepEqual(recorded.cases[0].observed.screenshotRefs, ['/tmp/spark-recursive-builder.png']);
  assert.equal(summarizeControlProofCanaryObservations(recorded).readyForRelease, true);

  const partiallyUpdated = recordControlProofCanaryObservation(recorded, {
    id: 'cp-builder-001',
    notes: 'Retested after runtime sync.'
  });
  assert.deepEqual(partiallyUpdated.cases[0].observed.screenshotRefs, ['/tmp/spark-recursive-builder.png']);
  assert.equal(partiallyUpdated.cases[0].observed.notes, 'Retested after runtime sync.');
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
  assert.equal(parsed.cases[0].sourceRefs[0].caseId, 'memory-004');

  const observationTemplate = spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
      'ops/controlProofLiveCanaryPack.ts',
      '--case',
      'cp-builder-001',
      '--observation-template'
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );

  assert.equal(observationTemplate.status, 0, observationTemplate.stderr);
  const observed = JSON.parse(observationTemplate.stdout);
  assert.equal(observed.target, 'SparkRecursive_bot');
  assert.equal(observed.cases[0].sourceRefs[0].caseId, 'memory-004');
  assert.equal(observed.cases[0].expected.route, 'builder_gateway.plain_chat');
  assert.equal(observed.cases[0].observed.verdict, 'untested');
  assert.deepEqual(observed.cases[0].observed.screenshotRefs, []);

  const runGuide = spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
      'ops/controlProofLiveCanaryPack.ts',
      '--case',
      'cp-builder-001',
      '--run-guide',
      '--observations',
      '/tmp/live-canary-observations.json'
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );

  assert.equal(runGuide.status, 0, runGuide.stderr);
  assert.match(runGuide.stdout, /Control-Proof Live Run Guide/);
  assert.match(runGuide.stdout, /Proof inspection prompt:\n```text\n\/proof\n```/);
  assert.match(runGuide.stdout, /--record-case cp-builder-001/);
  assert.doesNotMatch(runGuide.stdout, /Unexpected token|ENOENT/);

  const coverage = spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
      'ops/controlProofLiveCanaryPack.ts',
      '--include-actions',
      '--coverage'
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );

  assert.equal(coverage.status, 0, coverage.stderr);
  assert.match(coverage.stdout, /Cases: 27/);
  assert.match(coverage.stdout, /Intentional action cases: 4/);

  const strictCoverage = spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
      'ops/controlProofLiveCanaryPack.ts',
      '--case',
      'cp-builder-001',
      '--coverage',
      '--coverage-strict'
    ],
    { cwd: ROOT, encoding: 'utf8' }
  );

  assert.equal(strictCoverage.status, 1);
  assert.match(strictCoverage.stdout, /Required category coverage: missing/);

  const tempRoot = mkdtempSync(resolve(tmpdir(), 'spark-canary-observations-'));
  try {
    const outTemplatePath = resolve(tempRoot, 'template.json');
    const outTemplate = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--case',
        'cp-builder-001',
        '--observation-template',
        '--out',
        outTemplatePath
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(outTemplate.status, 0, outTemplate.stderr);
    assert.match(outTemplate.stdout, /Wrote control-proof observation template/);
    assert.equal(JSON.parse(readFileSync(outTemplatePath, 'utf8')).cases[0].id, 'cp-builder-001');

    observed.cases[0].observed = {
      ...observed.cases[0].observed,
      verdict: 'pass',
      reply: 'Route confidence means Spark is justified in taking this route now.',
      sideEffects: {
        ...observed.cases[0].observed.sideEffects,
        missionStarted: false,
        notes: 'No mutation observed.'
      },
      proofJoin: 'Builder joined.',
      proofPanel: CLEAN_PROOF_PANEL,
      screenshotRefs: ['/tmp/spark-recursive-builder.png'],
      userConfirmation: 'Confirmed in SparkRecursive_bot.'
    };
    observed.evidence = {
      sparkLiveStatus: 'Spark Live healthy.',
      providerStatus: 'Provider ping OK.',
      runtimeSync: 'runtime in sync.',
      controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
      notes: null
    };
    const observationsPath = resolve(tempRoot, 'observations.json');
    writeFileSync(observationsPath, JSON.stringify(observed, null, 2), 'utf8');
    const summary = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        observationsPath
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(summary.status, 0, summary.stderr);
    assert.match(summary.stdout, /Release gate: ready/);

    const releaseCheck = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        observationsPath,
        '--release-check'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(releaseCheck.status, 1);
    assert.match(releaseCheck.stdout, /Release gate: ready/);
    assert.match(releaseCheck.stdout, /Required category coverage: missing/);

    const replyPath = resolve(tempRoot, 'reply.txt');
    writeFileSync(replyPath, 'Route confidence means Spark is justified in taking this route now.\n', 'utf8');
    const recordedPath = resolve(tempRoot, 'recorded.json');
    const recordedSummaryPath = resolve(tempRoot, 'recorded-summary.md');
    const proofPanelPath = resolve(tempRoot, 'proof-panel.txt');
    writeFileSync(proofPanelPath, `${CLEAN_PROOF_PANEL}\n`, 'utf8');
    const record = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        observationsPath,
        '--out',
        recordedPath,
        '--record-case',
        'cp-builder-001',
        '--verdict',
        'pass',
        '--reply-file',
        replyPath,
        '--mission-started',
        'false',
        '--side-effects-notes',
        'No mutation observed.',
        '--proof-join',
        'Builder joined.',
        '--proof-panel-file',
        proofPanelPath,
        '--screenshot-ref',
        '/tmp/spark-recursive-builder.png',
        '--summary-out',
        recordedSummaryPath,
        '--user-confirmation',
        'Confirmed in SparkRecursive_bot.'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(record.status, 0, record.stderr);
    assert.match(record.stdout, /Recorded control-proof observation for cp-builder-001/);
    assert.match(record.stdout, /Wrote control-proof observation summary/);
    assert.match(record.stdout, /Release gate: ready/);
    const recorded = JSON.parse(readFileSync(recordedPath, 'utf8'));
    assert.equal(recorded.cases[0].observed.reply, 'Route confidence means Spark is justified in taking this route now.');
    assert.equal(recorded.cases[0].observed.sideEffects.missionStarted, false);
    assert.match(readFileSync(recordedSummaryPath, 'utf8'), /Release gate: ready/);

    const bundleDir = resolve(tempRoot, 'bundle');
    const releaseBundle = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--case',
        'cp-builder-001',
        '--release-bundle',
        '--out-dir',
        bundleDir
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(releaseBundle.status, 0, releaseBundle.stderr);
    assert.match(releaseBundle.stdout, /Wrote control-proof live canary bundle/);
    assert.match(releaseBundle.stdout, /Release gate: not ready/);
    const bundledObservationsPath = resolve(bundleDir, 'live-canary-observations.json');
    const bundledGuidePath = resolve(bundleDir, 'live-canary-run-guide.md');
    const bundledSummaryPath = resolve(bundleDir, 'live-canary-summary.md');
    const bundledReadmePath = resolve(bundleDir, 'README.md');
    const bundledCoveragePath = resolve(bundleDir, 'live-canary-coverage.md');
    assert.equal(JSON.parse(readFileSync(bundledObservationsPath, 'utf8')).cases[0].id, 'cp-builder-001');
    assert.match(releaseBundle.stdout, /README:/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /Control-Proof Live Canary Bundle/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /refreshes the current summary/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), new RegExp(`--observations '${escapeRegExp(bundledObservationsPath)}' --release-check`));
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /Coverage:/);
    assert.match(readFileSync(bundledGuidePath, 'utf8'), new RegExp(`--observations '${escapeRegExp(bundledObservationsPath)}' --record-case cp-builder-001`));
    assert.match(readFileSync(bundledGuidePath, 'utf8'), new RegExp(`--summary-out '${escapeRegExp(bundledSummaryPath)}'`));
    assert.match(readFileSync(bundledCoveragePath, 'utf8'), /Cases: 1/);
    assert.match(readFileSync(resolve(bundleDir, 'live-canary-copy-paste.md'), 'utf8'), /Control-Proof Canary Prompts/);
    assert.match(readFileSync(resolve(bundleDir, 'live-canary-checklist.md'), 'utf8'), /Control-Proof Canary Checklist/);
    assert.match(readFileSync(bundledSummaryPath, 'utf8'), /Release gate: not ready/);

    const fullBundleDir = resolve(tempRoot, 'full-bundle');
    const fullReleaseBundle = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--include-actions',
        '--release-bundle',
        '--out-dir',
        fullBundleDir
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(fullReleaseBundle.status, 0, fullReleaseBundle.stderr);
    assert.equal(JSON.parse(readFileSync(resolve(fullBundleDir, 'live-canary-observations.json'), 'utf8')).cases.length, 27);
    assert.match(readFileSync(resolve(fullBundleDir, 'live-canary-coverage.md'), 'utf8'), /Required category coverage: complete/);

    observed.evidence.controlProofAudit = null;
    writeFileSync(observationsPath, JSON.stringify(observed, null, 2), 'utf8');
    const strictSummary = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        observationsPath,
        '--strict'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(strictSummary.status, 1);
    assert.match(strictSummary.stdout, /Packet evidence missing: control_proof_audit/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('runtime evidence collection keeps the audit tail needed for strict validation', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'spark-canary-runtime-evidence-'));
  try {
    const binRoot = resolve(tempRoot, 'bin');
    const outTemplatePath = resolve(tempRoot, 'observations.json');
    mkdirSync(binRoot);
    const sparkPath = resolve(binRoot, 'spark');
    const npmPath = resolve(binRoot, 'npm');
    writeFileSync(sparkPath, [
      '#!/bin/sh',
      'if [ "$1 $2" = "live status" ]; then echo "Spark Live healthy"; exit 0; fi',
      'if [ "$1 $2 $3" = "providers test --role" ]; then echo "chat provider PING_OK"; exit 0; fi',
      'echo "unexpected spark args: $*" >&2',
      'exit 1'
    ].join('\n'), 'utf8');
    writeFileSync(npmPath, [
      '#!/bin/sh',
      'if [ "$1 $2" = "run sync:check" ]; then echo "[check] runtime in sync."; exit 0; fi',
      'if [ "$1 $2" = "run control:proof:audit" ]; then',
      '  case " $* " in *" --blocking-strict "*) ;; *) echo "missing --blocking-strict" >&2; exit 1;; esac',
      '  i=0',
      '  while [ "$i" -lt 80 ]; do echo "audit detail line $i before summary"; i=$((i + 1)); done',
      '  echo "Blocking status: clean"',
      '  echo "Gap counts:"',
      '  echo "- missing evidence: 0"',
      '  echo "- missing trace joins: 0"',
      '  echo "- missing proof capsules: 0"',
      '  echo "- legacy proof gaps: 4"',
      '  echo "- raw ref leaks: 0"',
      '  echo "- robotic failure reasons: 0"',
      '  echo "- stack-like leaks: 0"',
      '  exit 0',
      'fi',
      'echo "unexpected npm args: $*" >&2',
      'exit 1'
    ].join('\n'), 'utf8');
    chmodSync(sparkPath, 0o755);
    chmodSync(npmPath, 0o755);

    const collected = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--case',
        'cp-builder-001',
        '--observation-template',
        '--collect-runtime-evidence',
        '--out',
        outTemplatePath
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${binRoot}:${process.env.PATH || ''}` }
      }
    );
    assert.equal(collected.status, 0, collected.stderr);
    const observed = JSON.parse(readFileSync(outTemplatePath, 'utf8'));
    assert.match(observed.evidence.controlProofAudit, /audit detail line 0 before summary/);
    assert.match(observed.evidence.controlProofAudit, /Blocking status: clean/);
    assert.match(observed.evidence.controlProofAudit, /missing proof capsules: 0/);

    observed.cases[0].observed = {
      ...observed.cases[0].observed,
      verdict: 'pass',
      reply: 'Route confidence means Spark is justified in taking this route now.',
      sideEffects: {
        ...observed.cases[0].observed.sideEffects,
        missionStarted: false,
        notes: 'No mutation observed.'
      },
      proofJoin: 'Builder joined.',
      proofPanel: CLEAN_PROOF_PANEL,
      screenshotRefs: ['/tmp/spark-recursive-builder.png'],
      userConfirmation: 'Confirmed in SparkRecursive_bot.'
    };
    const summary = summarizeControlProofCanaryObservations(observed);
    assert.equal(summary.readyForRelease, true);
    assert.deepEqual(summary.invalidPacketEvidence, []);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
