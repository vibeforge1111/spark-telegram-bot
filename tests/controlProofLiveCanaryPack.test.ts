import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
const TEST_RUNTIME_COLLECTED_AT = new Date().toISOString();
function cleanControlProofAudit(generatedAt = TEST_RUNTIME_COLLECTED_AT): string {
  return [
  '$ npm run control:proof:audit -- --sample 100 --fresh-strict',
  'exit=0',
  `Generated: ${generatedAt}`,
  'Blocking status: clean',
  'Gap posture: backed legacy gaps only; no blocking or latest proof gaps',
  '- telegram_final_answer: 100/100 sampled | latest_gap no',
  '- telegram_route_confidence: 100/100 sampled | proof_gap 97 | gap_capsule 97 | gap_capsule_valid 97 | gap_ref 97 | gap_backing complete | latest_gap no',
  '- builder_gateway: 100/100 sampled | proof_gap 62 | gap_capsule 62 | gap_capsule_valid 62 | gap_ref 62 | gap_backing complete | latest_gap no',
  '- spawner_prd_trace: 100/100 sampled | proof_gap 94 | gap_capsule 94 | gap_capsule_valid 94 | gap_ref 94 | gap_backing complete | latest_gap no',
  '- memory_movement_index: 1/1 sampled | proof 0/1 | proof_n/a 1 | proof_gap 0 | gap_backing n/a | latest_gap no',
  '- voice_surface_view: 1/1 sampled | proof 0/1 | proof_n/a 1 | proof_gap 0 | gap_backing n/a | latest_gap no',
  '- voice_runtime_state: 1/1 sampled | proof 0/1 | proof_n/a 1 | proof_gap 0 | gap_backing n/a | latest_gap no',
  'missing evidence: 0',
  'missing trace joins: 0',
  'missing proof capsules: 0',
  'legacy proof gaps: 3',
  'incomplete legacy gap backing: 0',
  'latest proof gaps: 0',
  'raw ref leaks: 0',
  'robotic failure reasons: 0',
  'stack-like leaks: 0',
  'Gap planes:',
  '- legacy proof gaps: telegram_route_confidence, builder_gateway, spawner_prd_trace'
].join('\n');
}
const CLEAN_CONTROL_PROOF_AUDIT = cleanControlProofAudit();
function cleanSparkOsCompile(generatedAt = TEST_RUNTIME_COLLECTED_AT): string {
  return [
  '$ spark os compile --json',
  'exit=0',
  JSON.stringify({
    generated_at: generatedAt,
    ok: true,
    gaps: 0,
    duplicate_truths: { item_count: 2 },
    repo_board: { dirty_repo_count: 0, blocked_release_count: 0, critical_repo_count: 0, duplicate_truth_count: 2, critical_duplicate_truth_count: 1 },
    gate: { dirty_repo_count: 0, broad_dirty_repo_count: 0 },
    privacy: {
      raw_secret_values_read: false,
      raw_logs_read: false,
      raw_conversation_content_read: false,
      raw_memory_evidence_read: false,
      sqlite_row_contents_read: false
    }
  }, null, 2)
].join('\n');
}
const CLEAN_SPARK_OS_COMPILE = cleanSparkOsCompile();
const CLEAN_SPARK_LIVE_STATUS = [
  '$ spark live status',
  'exit=0',
  'Spark Live',
  '[OK] Spark Live is ready.',
  '[OK] spark-telegram-bot: Relay runtime: OK (primary@<redacted-port> pid=<redacted-pid> polling=active)'
].join('\n');
const CLEAN_PROVIDER_STATUS = [
  '$ spark providers test --role chat',
  'exit=0',
  'Spark provider test',
  '[OK] chat -> codex: PING_OK'
].join('\n');
const CLEAN_RUNTIME_SYNC = [
  '$ npm run sync:check',
  'exit=0',
  '[check] runtime in sync.'
].join('\n');
const CLEAN_PROOF_PANEL = [
  'Harness Proof',
  'Intent: builder_gateway.plain_chat',
  'Authority: allowed by spark.turn_intent.v1',
  'Governor: allow, verified',
  'Execution: not_started',
  'Reply: delivered as natural',
  'Audit blocking: clean',
  'Legacy proof gaps visible: 3'
].join('\n');
const STABLE_SCREENSHOT_REF = 'screenshot:sha256:45b02d5985721f4374ca537d39ed9bcd60b481a7aef860cb3682cd422ad610b7';
const STABLE_SCREENSHOT_REF_TWO = 'screenshot:sha256:2911385c0329829d3cd072611b0fb859e86e12018474614e38c1e73bd9b16968';

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
    'publish',
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

test('checked-in full canary summary JSON matches the observation packet', () => {
  const observations = JSON.parse(readFileSync(resolve(ROOT, 'outputs/live-canary-full/live-canary-observations.json'), 'utf8'));
  const summaryJson = JSON.parse(readFileSync(resolve(ROOT, 'outputs/live-canary-full/live-canary-summary.json'), 'utf8'));
  const summary = summarizeControlProofCanaryObservations(observations, {
    maxRuntimeEvidenceAgeHours: 1,
    now: observations.evidence.collectedAt
  });
  const observedCases = selectControlProofCanaryCases(CONTROL_PROOF_LIVE_CANARY_CASES, {
    caseIds: observations.cases.map((entry: { id: string }) => entry.id),
    includeActions: true
  });
  const coverage = summarizeControlProofCanaryCoverage(observedCases);

  assert.equal(summaryJson.summary.runtimeEvidenceCollectedAt, observations.evidence.collectedAt);
  assert.equal(summaryJson.summary.runtimeEvidenceMaxAgeHours, summary.runtimeEvidenceMaxAgeHours);
  assert.equal(summaryJson.summary.runtimeEvidenceExpiresAt, summary.runtimeEvidenceExpiresAt);
  assert.equal(summaryJson.summary.readyForRelease, summary.readyForRelease);
  assert.equal(summaryJson.summary.readyForPublish, summary.readyForPublish);
  assert.deepEqual(summaryJson.summary.gateDecisionDetails, summary.gateDecisionDetails);
  assert.equal(summaryJson.summary.totalCases, summary.totalCases);
  assert.deepEqual(summaryJson.summary.verdictCounts, summary.verdictCounts);
  assert.equal(summaryJson.coverage.totalCases, coverage.totalCases);
  assert.equal(summaryJson.coverage.coverageComplete, coverage.coverageComplete);
  assert.equal(summaryJson.coverage.releasePackComplete, coverage.releasePackComplete);
  assert.deepEqual(summaryJson.summary.missingPacketEvidence, []);
  assert.deepEqual(summaryJson.summary.invalidPacketEvidence, []);
  assert.deepEqual(summaryJson.summary.stalePacketEvidence, []);
  assert.deepEqual(summaryJson.summary.packetEvidenceDetails, summary.packetEvidenceDetails);
  assert.deepEqual(summaryJson.summary.controlProofAuditDetails, summary.controlProofAuditDetails);
  assert.deepEqual(summaryJson.summary.releaseCaveats, summary.releaseCaveats);
  assert.deepEqual(summaryJson.summary.releaseHandoffs, summary.releaseHandoffs);
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

  const richMessage = CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-streaming-002');
  assert.ok(richMessage);
  assert.match(richMessage.expectedProofJoin, /rich-message reply came through the live Telegram profile path/);
  assert.match(richMessage.passCriteria.join('\n'), /rich-message final delivery through the active Telegram profile path/);
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
  assert.match(coverage, /Cases: 28/);
  assert.match(coverage, /Intentional action cases: 4/);
  assert.match(coverage, /Manual media cases: 4/);
  assert.match(coverage, /Required category coverage: complete/);
  assert.match(coverage, /Missing required categories: none/);
  assert.match(coverage, /Full release pack: complete/);
  assert.match(coverage, /Missing release cases: none/);
  assert.match(coverage, /- mission: 1/);
  assert.match(coverage, /- publish: 1/);
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
  assert.equal(narrowSummary.releasePackComplete, false);
  assert.ok(narrowSummary.missingRequiredCategories.includes('mission'));
  assert.ok(narrowSummary.missingReleaseCaseIds.includes('cp-proof-001'));
  assert.match(narrow, /Required category coverage: missing/);
  assert.match(narrow, /Full release pack: missing/);
  assert.match(narrow, /Missing required categories: .*mission/);
});

test('live run guide pairs Telegram prompts with record commands', () => {
  const guide = formatControlProofCanaryLiveRunGuide([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!,
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-access-002')!,
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-streaming-001')!
  ], { observationsPath: '/tmp/live-canary-observations.json' });

  assert.match(guide, /SparkRecursive_bot Control-Proof Live Run Guide/);
  assert.match(guide, /Observation packet: \/tmp\/live-canary-observations\.json/);
  assert.match(guide, /```text\nIn one sentence, what does route confidence mean for Spark\? Do not start anything\.\n```/);
  assert.match(guide, /Proof inspection prompt:\n```text\n\/proof\n```/);
  assert.match(guide, /--observations '\/tmp\/live-canary-observations\.json' --record-case cp-builder-001/);
  assert.match(guide, /--reply-file '\/tmp\/cp-builder-001-reply\.txt'/);
  assert.match(guide, /--mission-started <true\|false\|unknown>/);
  assert.match(guide, /--record-case cp-builder-001[\s\S]*--no-other-side-effects/);
  assert.match(guide, /--record-case cp-streaming-001[\s\S]*--no-other-side-effects/);
  assert.match(guide, /--record-case cp-access-002[\s\S]*--access-changed <true\|false\|unknown>[\s\S]*--no-other-side-effects/);
  assert.match(guide, /cp-builder-001[\s\S]*Capture proof panel: yes/);
  assert.match(guide, /cp-streaming-001[\s\S]*Capture proof panel: no/);
  assert.match(guide, /--screenshot-file '\/tmp\/cp-streaming-001\.png'/);
  assert.doesNotMatch(guide, /```text\n(?:(?!```).)*Expected route/s);
});

test('live run guide omits proof inspection for cases without proof-panel capture', () => {
  const guide = formatControlProofCanaryLiveRunGuide([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-streaming-001')!
  ]);

  assert.match(guide, /cp-streaming-001/);
  assert.match(guide, /Capture proof panel: no/);
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
  assert.equal(template.evidence.collectedAt, null);
  assert.equal(template.evidence.sparkLiveStatus, null);
  assert.equal(template.evidence.controlProofAudit, null);
  assert.equal(template.cases[0].id, 'cp-builder-001');
  assert.deepEqual(template.cases[0].sourceRefs, [
    { catalog: 'natural-language-live-commands.json', caseId: 'memory-004', relationship: 'derived_from' }
  ]);
  assert.equal(template.cases[0].expected.route, 'plain_conversation');
  assert.equal(template.cases[0].expected.proofJoin, 'Telegram proof should show a no-execution plain conversation with a Builder-backed reply.');
  assert.equal(template.cases[0].observed.verdict, 'untested');
  assert.equal(template.cases[0].observed.reply, null);
  assert.equal(template.cases[0].observed.proofJoin, null);
  assert.equal(template.cases[0].observed.sideEffects.missionStarted, null);
  assert.deepEqual(template.cases[0].observed.screenshotRefs, []);
  assert.equal(template.cases[0].observed.userConfirmation, null);
});

test('observation summary rejects duplicate canary rows', () => {
  const template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!,
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });

  assert.throws(
    () => summarizeControlProofCanaryObservations(template),
    /Duplicate observed canary id: cp-builder-001/
  );
});

test('observation summary requires pass verdicts and all requested capture evidence', () => {
  let template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
  template = withControlProofCanaryRuntimeEvidence(template, {
    sparkLiveStatus: CLEAN_SPARK_LIVE_STATUS,
    providerStatus: CLEAN_PROVIDER_STATUS,
    runtimeSync: CLEAN_RUNTIME_SYNC,
    sparkOsCompile: CLEAN_SPARK_OS_COMPILE,
    controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
    notes: null
  });
  template.cases[0].observed = {
    ...template.cases[0].observed,
    verdict: 'pass',
    reply: 'Route confidence means Spark is justified in taking this route now.',
    sideEffects: {
      ...template.cases[0].observed.sideEffects,
      filesChanged: false,
      memoryWritten: false,
      missionStarted: false,
      externalNetworkCalled: false,
      accessChanged: false,
      providerChanged: false,
      mediaHandled: false,
      notes: 'No mission or mutation observed.'
    },
    proofJoin: 'Builder gateway joined with redacted proof ref.',
    proofPanel: CLEAN_PROOF_PANEL,
    screenshotRefs: [STABLE_SCREENSHOT_REF],
    userConfirmation: 'User confirmed Telegram reply rendered once.'
  };

  const summary = summarizeControlProofCanaryObservations(template);
  assert.equal(summary.readyForRelease, true);
  assert.equal(summary.readyForPublish, false);
  assert.match(String(summary.runtimeEvidenceCollectedAt), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(summary.runtimeEvidenceMaxAgeHours, 24);
  assert.match(String(summary.runtimeEvidenceExpiresAt), /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(summary.stalePacketEvidence, []);
  assert.equal(summary.verdictCounts.pass, 1);
  assert.deepEqual(summary.missingPacketEvidence, []);
  assert.deepEqual(summary.cases[0].missingCaptures, []);
  assert.equal(summary.controlProofAuditDetails?.blockingStatus, 'clean');
  assert.equal(summary.controlProofAuditDetails?.gapPosture, 'backed legacy gaps only; no blocking or latest proof gaps');
  assert.equal(summary.controlProofAuditDetails?.gapCounts.legacy_proof_gaps, 3);
  assert.deepEqual(summary.controlProofAuditDetails?.gapPlanes.legacy_proof_gaps, [
    'telegram_route_confidence',
    'builder_gateway',
    'spawner_prd_trace'
  ]);
  assert.deepEqual(summary.controlProofAuditDetails?.gapDetails.legacy_proof_gaps?.planeLabels, [
    'telegram_route_confidence',
    'builder_gateway',
    'spawner_prd_trace'
  ]);
  assert.equal(summary.controlProofAuditDetails?.gapDetails.legacy_proof_gaps?.count, 3);
  assert.equal(summary.controlProofAuditDetails?.gapDetails.legacy_proof_gaps?.releaseBlocking, false);
  assert.equal(summary.controlProofAuditDetails?.gapDetails.legacy_proof_gaps?.publishBlocking, false);
  assert.equal(summary.controlProofAuditDetails?.gapDetails.legacy_proof_gaps?.backingStatus, 'complete');
  assert.equal(summary.controlProofAuditDetails?.gapDetails.legacy_proof_gaps?.latestGapPlaneCount, 0);
  assert.equal(summary.controlProofAuditDetails?.gapDetails.legacy_proof_gaps?.incompleteBackingPlaneCount, 0);
  assert.equal(summary.controlProofAuditDetails?.gapDetails.legacy_proof_gaps?.completeBackingPlaneCount, 3);
  assert.deepEqual(
    summary.controlProofAuditDetails?.gapDetails.legacy_proof_gaps?.planes.map((entry) => ({
      label: entry.label,
      proofGap: entry.proofGap,
      gapBacking: entry.gapBacking,
      latestGap: entry.latestGap
    })),
    [
      { label: 'telegram_route_confidence', proofGap: 97, gapBacking: 'complete', latestGap: false },
      { label: 'builder_gateway', proofGap: 62, gapBacking: 'complete', latestGap: false },
      { label: 'spawner_prd_trace', proofGap: 94, gapBacking: 'complete', latestGap: false }
    ]
  );
  assert.deepEqual(summary.controlProofAuditDetails?.planes.find((entry) => entry.label === 'builder_gateway'), {
    label: 'builder_gateway',
    sampledRows: 100,
    totalRows: 100,
    requestPresent: NaN,
    tracePresent: NaN,
    proofPresent: NaN,
    proofRefPresent: NaN,
    proofCapsulePresent: NaN,
    proofNotApplicable: NaN,
    proofGap: 62,
    gapCapsule: 62,
    gapCapsuleValid: 62,
    gapRef: 62,
    gapBacking: 'complete',
    latestGap: false,
    rawRefs: NaN,
    rawIdKeys: NaN,
    reasonCodes: NaN,
    parseErrors: NaN
  });
  assert.match(formatControlProofCanaryObservationSummary(summary), /Release gate: ready/);
  assert.match(formatControlProofCanaryObservationSummary(summary), /Publish gate: not ready/);
  assert.match(formatControlProofCanaryObservationSummary(summary), /Runtime evidence collected: \d{4}-\d{2}-\d{2}T/);
  assert.match(formatControlProofCanaryObservationSummary(summary), /Runtime evidence expires: \d{4}-\d{2}-\d{2}T.*\(24h window\)/);

  template.cases[0].observed.reply = 'Mission\nProvider\nMove';
  const roboticReply = summarizeControlProofCanaryObservations(template);
  assert.equal(roboticReply.readyForRelease, false);
  assert.deepEqual(roboticReply.cases[0].missingCaptures, ['observed_reply_robotic_shape']);

  template.cases[0].observed.reply = 'That turn was blocked by tool_not_allowed_by_policy in /Users/example/private.';
  const leakyReply = summarizeControlProofCanaryObservations(template);
  assert.equal(leakyReply.readyForRelease, false);
  assert.deepEqual(leakyReply.cases[0].missingCaptures, ['observed_reply_raw_leak']);

  template.cases[0].observed.reply = 'Route confidence means Spark is justified in taking this route now.';
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
  assert.deepEqual(rawScreenshotRef.cases[0].missingCaptures, ['screenshot_ref', 'screenshot_raw_leak']);

  template.cases[0].observed.screenshotRefs = [STABLE_SCREENSHOT_REF];
  const digestScreenshotRef = summarizeControlProofCanaryObservations(template);
  assert.equal(digestScreenshotRef.readyForRelease, true);
  assert.deepEqual(digestScreenshotRef.cases[0].missingCaptures, []);

  template.cases[0].observed.screenshotRefs = ['/tmp/spark-recursive-builder.png'];
  const localScreenshotPath = summarizeControlProofCanaryObservations(template);
  assert.equal(localScreenshotPath.readyForRelease, false);
  assert.deepEqual(localScreenshotPath.cases[0].missingCaptures, ['screenshot_ref']);

  template.cases[0].observed.screenshotRefs = [
    'screenshot:raw:45b02d5985721f4374ca537d39ed9bcd60b481a7aef860cb3682cd422ad610b7'
  ];
  const rawDigestScreenshotRef = summarizeControlProofCanaryObservations(template);
  assert.equal(rawDigestScreenshotRef.readyForRelease, false);
  assert.deepEqual(rawDigestScreenshotRef.cases[0].missingCaptures, ['screenshot_ref', 'screenshot_raw_leak']);

  template.cases[0].observed.screenshotRefs = [STABLE_SCREENSHOT_REF];
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

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT.replace('legacy proof gaps: 3', 'legacy proof gaps: 2');
  template.cases[0].observed.proofPanel = CLEAN_PROOF_PANEL;
  const staleProofPanelAuditCount = summarizeControlProofCanaryObservations(template);
  assert.equal(staleProofPanelAuditCount.readyForRelease, false);
  assert.deepEqual(staleProofPanelAuditCount.cases[0].missingCaptures, ['proof_panel_legacy_gap_stale']);
  assert.match(
    formatControlProofCanaryObservationSummary(staleProofPanelAuditCount),
    /Attention summary:\n- proof_panel_legacy_gap_stale: 1 case/
  );
  assert.match(
    formatControlProofCanaryObservationSummary(staleProofPanelAuditCount),
    /Recapture hint:\n- Refresh \/proof panel captures for: cp-builder-001/
  );

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT;
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

  template.cases[0].observed.userConfirmation = 'User confirmed Telegram reply rendered once at /Users/example/private with file_id hidden.';
  const leakyConfirmation = summarizeControlProofCanaryObservations(template);
  assert.equal(leakyConfirmation.readyForRelease, false);
  assert.deepEqual(leakyConfirmation.cases[0].missingCaptures, ['user_confirmation_raw_leak']);

  template.cases[0].observed.userConfirmation = `User confirmed Telegram reply rendered once with screenshot ${STABLE_SCREENSHOT_REF}.`;
  const digestConfirmation = summarizeControlProofCanaryObservations(template);
  assert.equal(digestConfirmation.readyForRelease, true);
  assert.deepEqual(digestConfirmation.cases[0].missingCaptures, []);

  template.cases[0].observed.sideEffects.notes = 'No mutation observed; raw detail was /Users/example/private.';
  const leakySideEffectNotes = summarizeControlProofCanaryObservations(template);
  assert.equal(leakySideEffectNotes.readyForRelease, false);
  assert.deepEqual(leakySideEffectNotes.cases[0].missingCaptures, ['side_effects_notes_raw_leak']);

  template.cases[0].observed.sideEffects.notes = `No mutation observed; screenshot ${STABLE_SCREENSHOT_REF}.`;
  const digestSideEffectNotes = summarizeControlProofCanaryObservations(template);
  assert.equal(digestSideEffectNotes.readyForRelease, true);
  assert.deepEqual(digestSideEffectNotes.cases[0].missingCaptures, []);

  template.cases[0].observed.notes = 'Operator note included chat_id hidden.';
  const leakyObservedNotes = summarizeControlProofCanaryObservations(template);
  assert.equal(leakyObservedNotes.readyForRelease, false);
  assert.deepEqual(leakyObservedNotes.cases[0].missingCaptures, ['observed_notes_raw_leak']);

  template.cases[0].observed.notes = null;
  template.cases[0].observed.userConfirmation = 'User confirmed Telegram reply rendered once.';
  template.evidence.controlProofAudit = null;
  const missingPacketEvidence = summarizeControlProofCanaryObservations(template);
  assert.equal(missingPacketEvidence.readyForRelease, false);
  assert.deepEqual(missingPacketEvidence.missingPacketEvidence, ['control_proof_audit']);
  assert.deepEqual(missingPacketEvidence.packetEvidenceDetails.missing, [{
    key: 'control_proof_audit',
    state: 'missing',
    reason: 'control_proof_audit runtime proof is absent',
    generatedAt: template.generatedAt,
    runtimeEvidenceCollectedAt: template.evidence.collectedAt,
    runtimeEvidenceExpiresAt: missingPacketEvidence.runtimeEvidenceExpiresAt
  }]);
  assert.deepEqual(missingPacketEvidence.gateDecisionDetails.release.blockerDetails.missing_packet_evidence, {
    keys: ['control_proof_audit'],
    details: missingPacketEvidence.packetEvidenceDetails.missing
  });
  assert.match(formatControlProofCanaryObservationSummary(missingPacketEvidence), /Packet evidence missing: control_proof_audit/);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT;
  template.evidence.sparkOsCompile = null;
  const missingCompileEvidence = summarizeControlProofCanaryObservations(template);
  assert.equal(missingCompileEvidence.readyForRelease, false);
  assert.deepEqual(missingCompileEvidence.missingPacketEvidence, ['spark_os_compile']);
  assert.match(formatControlProofCanaryObservationSummary(missingCompileEvidence), /Packet evidence missing: spark_os_compile/);

  template.evidence.sparkOsCompile = CLEAN_SPARK_OS_COMPILE;
  template.evidence.collectedAt = '2026-06-23T00:00:00.000Z';
  const stalePacketEvidence = summarizeControlProofCanaryObservations(template, {
    now: '2026-06-24T01:00:00.000Z'
  });
  assert.equal(stalePacketEvidence.readyForRelease, false);
  assert.equal(stalePacketEvidence.runtimeEvidenceExpiresAt, '2026-06-24T00:00:00.000Z');
  assert.deepEqual(stalePacketEvidence.stalePacketEvidence, ['runtime_evidence_collected_at']);
  assert.deepEqual(stalePacketEvidence.packetEvidenceDetails.stale, [{
    key: 'runtime_evidence_collected_at',
    state: 'stale',
    reason: 'runtime evidence collection timestamp is invalid, future-dated, or outside the allowed freshness window',
    generatedAt: template.generatedAt,
    runtimeEvidenceCollectedAt: '2026-06-23T00:00:00.000Z',
    runtimeEvidenceExpiresAt: '2026-06-24T00:00:00.000Z'
  }]);
  assert.match(formatControlProofCanaryObservationSummary(stalePacketEvidence), /Packet evidence stale: runtime_evidence_collected_at/);

  template.evidence.collectedAt = 'June 24, 2026 00:30 UTC';
  const looseCollectedAt = summarizeControlProofCanaryObservations(template, {
    now: '2026-06-24T01:00:00.000Z'
  });
  assert.equal(looseCollectedAt.readyForRelease, false);
  assert.equal(looseCollectedAt.runtimeEvidenceExpiresAt, null);
  assert.deepEqual(looseCollectedAt.stalePacketEvidence, ['runtime_evidence_collected_at']);

  template.evidence.collectedAt = '2026-06-24T01:06:00.000Z';
  const futureCollectedAt = summarizeControlProofCanaryObservations(template, {
    now: '2026-06-24T01:00:00.000Z'
  });
  assert.equal(futureCollectedAt.readyForRelease, false);
  assert.deepEqual(futureCollectedAt.stalePacketEvidence, ['runtime_evidence_collected_at']);

  template.evidence.collectedAt = null;
  const missingCollectedAt = summarizeControlProofCanaryObservations(template);
  assert.equal(missingCollectedAt.readyForRelease, false);
  assert.deepEqual(missingCollectedAt.missingPacketEvidence, ['runtime_evidence_collected_at']);
  assert.equal(missingCollectedAt.packetEvidenceDetails.runtimeEvidenceCollectedAt, null);
});

test('observation summary rejects unrelated mutations on action cases', () => {
  let template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-access-002')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
  template = withControlProofCanaryRuntimeEvidence(template, {
    sparkLiveStatus: CLEAN_SPARK_LIVE_STATUS,
    providerStatus: CLEAN_PROVIDER_STATUS,
    runtimeSync: CLEAN_RUNTIME_SYNC,
    sparkOsCompile: CLEAN_SPARK_OS_COMPILE,
    controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
    notes: null
  });
  template.cases[0].observed = {
    ...template.cases[0].observed,
    verdict: 'pass',
    reply: 'Access is set to level three; I did not run repair setup.',
    sideEffects: {
      ...template.cases[0].observed.sideEffects,
      accessChanged: true,
      notes: 'Access changed; no other mutation observed.'
    },
    proofJoin: 'Access change joined with redacted proof ref.',
    proofPanel: CLEAN_PROOF_PANEL,
    screenshotRefs: [STABLE_SCREENSHOT_REF],
    userConfirmation: 'User confirmed Telegram access reply rendered once.'
  };

  const unobservedExtraMutations = summarizeControlProofCanaryObservations(template);
  assert.equal(unobservedExtraMutations.readyForRelease, false);
  assert.deepEqual(unobservedExtraMutations.cases[0].missingCaptures, ['side_effects_unobserved']);

  template.cases[0].observed.sideEffects.filesChanged = false;
  template.cases[0].observed.sideEffects.memoryWritten = false;
  template.cases[0].observed.sideEffects.missionStarted = false;
  template.cases[0].observed.sideEffects.externalNetworkCalled = false;
  template.cases[0].observed.sideEffects.providerChanged = false;
  template.cases[0].observed.sideEffects.mediaHandled = false;
  const cleanAction = summarizeControlProofCanaryObservations(template);
  assert.equal(cleanAction.readyForRelease, true);
  assert.deepEqual(cleanAction.cases[0].missingCaptures, []);

  template.cases[0].observed.sideEffects.missionStarted = true;
  const unexpectedActionMutation = summarizeControlProofCanaryObservations(template);
  assert.equal(unexpectedActionMutation.readyForRelease, false);
  assert.deepEqual(unexpectedActionMutation.cases[0].missingCaptures, ['side_effects_unexpected_mutation']);
});

test('streaming canaries require runtime status and rich-message proof shape', () => {
  let template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-streaming-001')!,
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-streaming-002')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
  template = withControlProofCanaryRuntimeEvidence(template, {
    sparkLiveStatus: CLEAN_SPARK_LIVE_STATUS,
    providerStatus: CLEAN_PROVIDER_STATUS,
    runtimeSync: CLEAN_RUNTIME_SYNC,
    sparkOsCompile: CLEAN_SPARK_OS_COMPILE,
    controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
    notes: null
  });
  template.cases[0].observed = {
    ...template.cases[0].observed,
    verdict: 'pass',
    reply: 'Telegram live chat Status: on Rich messages: on',
    sideEffects: {
      ...template.cases[0].observed.sideEffects,
      filesChanged: false,
      memoryWritten: false,
      missionStarted: false,
      externalNetworkCalled: false,
      accessChanged: false,
      providerChanged: false,
      mediaHandled: false,
      notes: 'No setting changes observed.'
    },
    proofJoin: 'Telegram command reply joined the live runtime status.',
    screenshotRefs: [STABLE_SCREENSHOT_REF],
    userConfirmation: 'Verified in SparkRecursive_bot via Telegram.'
  };
  template.cases[1].observed = {
    ...template.cases[1].observed,
    verdict: 'pass',
    reply: 'Looks clean.',
    sideEffects: {
      ...template.cases[1].observed.sideEffects,
      filesChanged: false,
      memoryWritten: false,
      missionStarted: false,
      externalNetworkCalled: false,
      accessChanged: false,
      providerChanged: false,
      mediaHandled: false,
      notes: 'No mutation observed.'
    },
    proofJoin: 'Telegram final delivery joined the rich-message reply.',
    screenshotRefs: [STABLE_SCREENSHOT_REF],
    userConfirmation: 'Verified in SparkRecursive_bot via Telegram.'
  };

  const missingProofShape = summarizeControlProofCanaryObservations(template);
  assert.equal(missingProofShape.readyForRelease, false);
  assert.deepEqual(missingProofShape.cases[0].missingCaptures, [
    'observed_reply_streaming_status_shape',
    'user_confirmation_duplicate_preview'
  ]);
  assert.deepEqual(missingProofShape.cases[1].missingCaptures, [
    'observed_reply_rich_message_shape',
    'proof_join_rich_message_delivery_shape',
    'user_confirmation_duplicate_preview'
  ]);

  template.cases[0].observed.reply = [
    'Spark Recursive',
    'Telegram live chat Profile: primary Status: on Rich messages: on Draft transport: rich Full-reply preview: on Draft interval: 500ms',
    '',
    'Process telemetry: no rich/draft delivery attempt observed since start.',
    '',
    'Private chats only.'
  ].join('\n');
  template.cases[0].observed.userConfirmation = 'Verified in SparkRecursive_bot via Telegram with no duplicate preview.';
  template.cases[1].observed.reply = 'Spark Recursive\nStatus: clean.\n\nToken: ok';
  template.cases[1].observed.proofJoin = 'Telegram final delivery carried the rich-message reply from the restarted primary profile.';
  template.cases[1].observed.userConfirmation = 'Verified in SparkRecursive_bot via Telegram without duplicate preview or final artifact.';
  const cleanStreamingProof = summarizeControlProofCanaryObservations(template);
  assert.equal(cleanStreamingProof.readyForRelease, true);
  assert.deepEqual(cleanStreamingProof.cases.map((entry) => entry.missingCaptures), [[], []]);
});

test('publish canary requires release-ready versus publish-not-ready handoff shape', () => {
  let template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-publish-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
  template = withControlProofCanaryRuntimeEvidence(template, {
    sparkLiveStatus: CLEAN_SPARK_LIVE_STATUS,
    providerStatus: CLEAN_PROVIDER_STATUS,
    runtimeSync: CLEAN_RUNTIME_SYNC,
    sparkOsCompile: CLEAN_SPARK_OS_COMPILE,
    controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
    notes: null
  });
  template.cases[0].observed = {
    ...template.cases[0].observed,
    verdict: 'pass',
    reply: 'Registry drift exists. Please review it later.',
    sideEffects: {
      ...template.cases[0].observed.sideEffects,
      filesChanged: false,
      memoryWritten: false,
      missionStarted: false,
      externalNetworkCalled: false,
      accessChanged: false,
      providerChanged: false,
      mediaHandled: false,
      notes: 'Read-only registry drift lookup; no mutation observed.'
    },
    proofJoin: 'Telegram final answer joined read-only registry drift evidence without raw commits.',
    screenshotRefs: [STABLE_SCREENSHOT_REF],
    userConfirmation: 'Verified in SparkRecursive_bot via Telegram.'
  };

  const weakHandoff = summarizeControlProofCanaryObservations(template);
  assert.equal(weakHandoff.readyForRelease, false);
  assert.deepEqual(weakHandoff.cases[0].missingCaptures, ['observed_reply_publish_handoff_shape']);

  template.cases[0].observed.reply = [
    'Spark Recursive',
    'Current evidence shows 2 registry truth drift items; that means the running code is not fully matched to published release metadata yet.',
    'Live behavior can still be release-ready, but publish stays not ready until the registry drift handoff is resolved.',
    '',
    'spark-telegram-bot: release branch pending registry batch. Keep it in the next verified metadata batch before claiming registry readiness.',
    '',
    'This was a read-only evidence lookup; no registry edit was made.'
  ].join('\n');
  const oneOwnerHandoff = summarizeControlProofCanaryObservations(template);
  assert.equal(oneOwnerHandoff.readyForRelease, false);
  assert.deepEqual(oneOwnerHandoff.cases[0].missingCaptures, ['observed_reply_publish_handoff_shape']);

  template.cases[0].observed.reply = [
    'Spark Recursive',
    'Current evidence shows 2 registry truth drift items; that means the running code is not fully matched to published release metadata yet.',
    'Live behavior can still be release-ready, but publish stays not ready until the registry drift handoff is resolved.',
    '',
    'spark-telegram-bot: release branch pending registry batch. Keep it in the next verified metadata batch before claiming registry readiness.',
    'spawner-ui: release branch pending registry batch. Keep it in the next verified metadata batch before claiming registry readiness.',
    '',
    'This was a read-only evidence lookup; no registry edit was made.'
  ].join('\n');
  const cleanHandoff = summarizeControlProofCanaryObservations(template);
  assert.equal(cleanHandoff.readyForRelease, true);
  assert.deepEqual(cleanHandoff.cases[0].missingCaptures, []);
});

test('observation summary rejects dirty runtime evidence even when packet fields are filled', () => {
  let template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
  template = withControlProofCanaryRuntimeEvidence(template, {
    sparkLiveStatus: CLEAN_SPARK_LIVE_STATUS,
    providerStatus: CLEAN_PROVIDER_STATUS,
    runtimeSync: CLEAN_RUNTIME_SYNC,
    sparkOsCompile: CLEAN_SPARK_OS_COMPILE,
    controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
    notes: null
  });
  template.cases[0].observed = {
    ...template.cases[0].observed,
    verdict: 'pass',
    reply: 'Route confidence means Spark is justified in taking this route now.',
    sideEffects: {
      ...template.cases[0].observed.sideEffects,
      filesChanged: false,
      memoryWritten: false,
      missionStarted: false,
      externalNetworkCalled: false,
      accessChanged: false,
      providerChanged: false,
      mediaHandled: false,
      notes: 'No mutation observed.'
    },
    proofJoin: 'Builder joined.',
    proofPanel: CLEAN_PROOF_PANEL,
    screenshotRefs: [STABLE_SCREENSHOT_REF],
    userConfirmation: 'Confirmed in SparkRecursive_bot.'
  };

  template.evidence.controlProofAudit = 'missing evidence: 0\nmissing trace joins: 0\nmissing proof capsules: 1';
  const dirtyAudit = summarizeControlProofCanaryObservations(template);
  assert.equal(dirtyAudit.readyForRelease, false);
  assert.deepEqual(dirtyAudit.invalidPacketEvidence, ['control_proof_audit']);
  assert.match(formatControlProofCanaryObservationSummary(dirtyAudit), /Packet evidence invalid: control_proof_audit/);

  template.evidence.controlProofAudit = 'no missing evidence; trace joins and proof capsules look clean';
  const proseAudit = summarizeControlProofCanaryObservations(template);
  assert.equal(proseAudit.readyForRelease, false);
  assert.deepEqual(proseAudit.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT
    .replace('$ npm run control:proof:audit -- --sample 100 --fresh-strict\n', '')
    .replace('exit=0\n', '');
  const missingFreshStrictTranscript = summarizeControlProofCanaryObservations(template);
  assert.equal(missingFreshStrictTranscript.readyForRelease, false);
  assert.deepEqual(missingFreshStrictTranscript.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT.replace('exit=0', 'exit=1');
  const failedFreshStrictTranscript = summarizeControlProofCanaryObservations(template);
  assert.equal(failedFreshStrictTranscript.readyForRelease, false);
  assert.deepEqual(failedFreshStrictTranscript.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT.replace('Blocking status: clean\n', '');
  const missingBlockingStatus = summarizeControlProofCanaryObservations(template);
  assert.equal(missingBlockingStatus.readyForRelease, false);
  assert.deepEqual(missingBlockingStatus.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = [
    'missing evidence: 0',
    'missing trace joins: 0',
    'missing proof capsules: 0',
    'legacy proof gaps: 3',
    'incomplete legacy gap backing: 0',
    'raw ref leaks: 0',
    'robotic failure reasons: 0',
    'stack-like leaks: 0'
  ].join('\n');
  const hiddenLegacyGapPlanes = summarizeControlProofCanaryObservations(template);
  assert.equal(hiddenLegacyGapPlanes.readyForRelease, false);
  assert.deepEqual(hiddenLegacyGapPlanes.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT
    .replaceAll(' | gap_capsule_valid 97', '')
    .replaceAll(' | gap_capsule_valid 62', '')
    .replaceAll(' | gap_capsule_valid 94', '');
  const staleAuditShape = summarizeControlProofCanaryObservations(template);
  assert.equal(staleAuditShape.readyForRelease, false);
  assert.deepEqual(staleAuditShape.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT.replace('gap_capsule_valid 62', 'gap_capsule_valid 61');
  const invalidGapCapsuleCount = summarizeControlProofCanaryObservations(template);
  assert.equal(invalidGapCapsuleCount.readyForRelease, false);
  assert.deepEqual(invalidGapCapsuleCount.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT.replace('voice_runtime_state: 1/1 sampled | proof 0/1 | proof_n/a 1', 'voice_runtime_state: 1/1 sampled | proof 0/1 | proof_n/a 0');
  const unclassifiedVoiceEvidence = summarizeControlProofCanaryObservations(template);
  assert.equal(unclassifiedVoiceEvidence.readyForRelease, false);
  assert.deepEqual(unclassifiedVoiceEvidence.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT.replace(
    'incomplete legacy gap backing: 0',
    'incomplete legacy gap backing: 1'
  );
  const incompleteLegacyGapBacking = summarizeControlProofCanaryObservations(template);
  assert.equal(incompleteLegacyGapBacking.readyForRelease, false);
  assert.deepEqual(incompleteLegacyGapBacking.invalidPacketEvidence, ['control_proof_audit']);
  assert.deepEqual(incompleteLegacyGapBacking.gateDecisionDetails.release.blockers, [
    'invalid_packet_evidence',
    'control_proof_audit_blocking_gaps'
  ]);
  assert.deepEqual(
    incompleteLegacyGapBacking.gateDecisionDetails.release.blockerDetails.control_proof_audit_blocking_gaps,
    {
      source: 'control_proof_audit',
      blockingStatus: 'clean',
      gapPosture: 'backed legacy gaps only; no blocking or latest proof gaps',
      gapFamilies: {
        incomplete_legacy_gap_backing: {
          count: 1,
          releaseBlocking: true,
          publishBlocking: true,
          backingStatus: 'none',
          planeLabels: [],
          latestGapPlaneCount: 0,
          incompleteBackingPlaneCount: 0,
          completeBackingPlaneCount: 0
        }
      }
    }
  );
  assert.deepEqual(
    incompleteLegacyGapBacking.gateDecisionDetails.publish.blockerDetails.release_gate_not_ready,
    {
      releaseReady: false,
      releaseBlockers: [
        'invalid_packet_evidence',
        'control_proof_audit_blocking_gaps'
      ],
      releaseBlockerDetails: incompleteLegacyGapBacking.gateDecisionDetails.release.blockerDetails
    }
  );

  template.evidence.controlProofAudit = [
    'missing evidence: 0',
    'missing trace joins: 0',
    'missing proof capsules: 0',
    'legacy proof gaps: 0',
    'incomplete legacy gap backing: 0',
    'raw ref leaks: 0',
    'robotic failure reasons: 0',
    'stack-like leaks: 0'
  ].join('\n');
  const missingLatestGapSummary = summarizeControlProofCanaryObservations(template);
  assert.equal(missingLatestGapSummary.readyForRelease, false);
  assert.deepEqual(missingLatestGapSummary.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT;
  template.evidence.controlProofAudit = `${CLEAN_CONTROL_PROOF_AUDIT}\nbuilder_gateway: 100/100 sampled | latest_gap yes`;
  const freshGapAudit = summarizeControlProofCanaryObservations(template);
  assert.equal(freshGapAudit.readyForRelease, false);
  assert.deepEqual(freshGapAudit.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = `${CLEAN_CONTROL_PROOF_AUDIT}\nBlocking status: blocking gaps found`;
  const blockingGapAudit = summarizeControlProofCanaryObservations(template);
  assert.equal(blockingGapAudit.readyForRelease, false);
  assert.deepEqual(blockingGapAudit.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = `${CLEAN_CONTROL_PROOF_AUDIT}\nbuilder_gateway: 1/1 sampled | raw_refs 0 | raw_id_keys 1 | reason_codes 0 | parse_errors 0`;
  const rawIdPlaneAudit = summarizeControlProofCanaryObservations(template);
  assert.equal(rawIdPlaneAudit.readyForRelease, false);
  assert.deepEqual(rawIdPlaneAudit.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = `${CLEAN_CONTROL_PROOF_AUDIT}\nbuilder_gateway: 1/1 sampled | raw_refs 0 | raw_id_keys 0 | reason_codes 1 | parse_errors 0`;
  const reasonCodePlaneAudit = summarizeControlProofCanaryObservations(template);
  assert.equal(reasonCodePlaneAudit.readyForRelease, false);
  assert.deepEqual(reasonCodePlaneAudit.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT;
  template.evidence.sparkLiveStatus = 'Spark Live healthy.';
  const missingLiveStatusTranscript = summarizeControlProofCanaryObservations(template);
  assert.equal(missingLiveStatusTranscript.readyForRelease, false);
  assert.deepEqual(missingLiveStatusTranscript.invalidPacketEvidence, ['spark_live_status']);

  template.evidence.sparkLiveStatus = CLEAN_SPARK_LIVE_STATUS.replace('exit=0', 'exit=1');
  const failedLiveStatusTranscript = summarizeControlProofCanaryObservations(template);
  assert.equal(failedLiveStatusTranscript.readyForRelease, false);
  assert.deepEqual(failedLiveStatusTranscript.invalidPacketEvidence, ['spark_live_status']);

  template.evidence.sparkLiveStatus = CLEAN_SPARK_LIVE_STATUS;
  template.evidence.providerStatus = 'Provider ping failed.';
  const dirtyProvider = summarizeControlProofCanaryObservations(template);
  assert.equal(dirtyProvider.readyForRelease, false);
  assert.deepEqual(dirtyProvider.invalidPacketEvidence, ['provider_status']);

  template.evidence.providerStatus = 'Provider ping OK.';
  const missingProviderTranscript = summarizeControlProofCanaryObservations(template);
  assert.equal(missingProviderTranscript.readyForRelease, false);
  assert.deepEqual(missingProviderTranscript.invalidPacketEvidence, ['provider_status']);

  template.evidence.providerStatus = CLEAN_PROVIDER_STATUS.replace('exit=0', 'exit=1');
  const failedProviderTranscript = summarizeControlProofCanaryObservations(template);
  assert.equal(failedProviderTranscript.readyForRelease, false);
  assert.deepEqual(failedProviderTranscript.invalidPacketEvidence, ['provider_status']);

  template.evidence.providerStatus = CLEAN_PROVIDER_STATUS;
  template.evidence.runtimeSync = 'runtime in sync.';
  const missingSyncTranscript = summarizeControlProofCanaryObservations(template);
  assert.equal(missingSyncTranscript.readyForRelease, false);
  assert.deepEqual(missingSyncTranscript.invalidPacketEvidence, ['runtime_sync']);

  template.evidence.runtimeSync = CLEAN_RUNTIME_SYNC.replace('exit=0', 'exit=1');
  const failedSyncTranscript = summarizeControlProofCanaryObservations(template);
  assert.equal(failedSyncTranscript.readyForRelease, false);
  assert.deepEqual(failedSyncTranscript.invalidPacketEvidence, ['runtime_sync']);

  template.evidence.runtimeSync = CLEAN_RUNTIME_SYNC;
  template.evidence.sparkOsCompile = '$ spark os compile --json\nexit=0\n{"ok":false,"gaps":1}';
  const dirtyCompile = summarizeControlProofCanaryObservations(template);
  assert.equal(dirtyCompile.readyForRelease, false);
  assert.deepEqual(dirtyCompile.invalidPacketEvidence, ['spark_os_compile']);
  assert.match(formatControlProofCanaryObservationSummary(dirtyCompile), /Packet evidence invalid: spark_os_compile/);

  template.evidence.sparkOsCompile = '$ spark os compile --json\nexit=0\n{"ok":true,"gaps":0,"privacy":{"raw_logs_read":true}}';
  const compileRawPrivacyRead = summarizeControlProofCanaryObservations(template);
  assert.equal(compileRawPrivacyRead.readyForRelease, false);
  assert.deepEqual(compileRawPrivacyRead.invalidPacketEvidence, ['spark_os_compile']);

  template.evidence.sparkOsCompile = '$ spark os compile --json\nexit=0\n{"ok":true,"gaps":0,"repo_board":{"dirty_repo_count":0},"gate":{"dirty_repo_count":0,"broad_dirty_repo_count":0},"privacy":{"raw_logs_read":false}}';
  const compileIncompletePrivacy = summarizeControlProofCanaryObservations(template);
  assert.equal(compileIncompletePrivacy.readyForRelease, false);
  assert.deepEqual(compileIncompletePrivacy.invalidPacketEvidence, ['spark_os_compile']);

  template.evidence.sparkOsCompile = '$ spark os compile --json\nexit=0\n{"ok":true,"gaps":0,"privacy":{"raw_secret_values_read":false,"raw_logs_read":false,"raw_conversation_content_read":false,"raw_memory_evidence_read":false,"sqlite_row_contents_read":false}}';
  const compileMissingDirtyState = summarizeControlProofCanaryObservations(template);
  assert.equal(compileMissingDirtyState.readyForRelease, false);
  assert.deepEqual(compileMissingDirtyState.invalidPacketEvidence, ['spark_os_compile']);

  template.evidence.sparkOsCompile = '$ spark os compile --json\nexit=0\n{"ok":true,"gaps":0,"repo_board":{"dirty_repo_count":1},"privacy":{"raw_logs_read":false}}';
  const dirtyRuntimeCompile = summarizeControlProofCanaryObservations(template);
  assert.equal(dirtyRuntimeCompile.readyForRelease, false);
  assert.deepEqual(dirtyRuntimeCompile.invalidPacketEvidence, ['spark_os_compile']);

  template.evidence.sparkOsCompile = `$ spark os compile --json\nexit=0\n{"generated_at":"${template.evidence.collectedAt}","ok":true,"gaps":0,"repo_board":{"dirty_repo_count":0,"blocked_release_count":0,"critical_repo_count":0,"duplicate_truth_count":0,"critical_duplicate_truth_count":0},"gate":{"dirty_repo_count":0,"broad_dirty_repo_count":0},"duplicate_truths":{"classification_counts":{"runtime_ahead_of_registry_pin":0}},"privacy":{"raw_secret_values_read":false,"raw_logs_read":false,"raw_conversation_content_read":false,"raw_memory_evidence_read":false,"sqlite_row_contents_read":false}}`;
  const publishCleanCompile = summarizeControlProofCanaryObservations(template);
  assert.equal(publishCleanCompile.readyForRelease, true);
  assert.equal(publishCleanCompile.readyForPublish, true);
  assert.deepEqual(publishCleanCompile.gateDecisionDetails, {
    release: {
      ready: true,
      blockers: [],
      blockerDetails: {},
      caveats: [],
      caveatDetails: null,
      caveatFamilies: [],
      handoffDetails: null,
      handoffActionDetails: [],
      handoffFamilies: [],
      handoffCount: 0,
      packetEvidence: { missing: [], invalid: [], stale: [] },
      failingCases: []
    },
    publish: {
      ready: true,
      blockers: [],
      blockerDetails: {},
      caveats: [],
      caveatDetails: null,
      caveatFamilies: [],
      handoffDetails: null,
      handoffActionDetails: [],
      handoffFamilies: [],
      handoffCount: 0,
      packetEvidence: { missing: [], invalid: [], stale: [] },
      failingCases: []
    }
  });
  assert.deepEqual(publishCleanCompile.releaseCaveats, []);
  assert.match(formatControlProofCanaryObservationSummary(publishCleanCompile), /Publish gate: ready/);

  template.evidence.sparkOsCompile = CLEAN_SPARK_OS_COMPILE;
  const compileDriftVisibleButClean = summarizeControlProofCanaryObservations(template);
  assert.equal(compileDriftVisibleButClean.readyForRelease, true);
  assert.equal(compileDriftVisibleButClean.readyForPublish, false);
  assert.deepEqual(compileDriftVisibleButClean.invalidPacketEvidence, []);
  assert.deepEqual(compileDriftVisibleButClean.releaseCaveats, [
    'duplicate_truth_drift | duplicate_truth_count=2 | critical_duplicate_truth_count=1'
  ]);
  assert.deepEqual(compileDriftVisibleButClean.releaseHandoffs, []);
  assert.match(
    formatControlProofCanaryObservationSummary(compileDriftVisibleButClean),
    /Release caveats:\n- duplicate_truth_drift/
  );
  assert.match(
    formatControlProofCanaryObservationSummary(compileDriftVisibleButClean),
    /Release note: ready with caveats; complete the listed handoffs before publish\/registry claims\./
  );
  assert.match(
    formatControlProofCanaryObservationSummary(compileDriftVisibleButClean),
    /Publish gate: not ready/
  );

  template.evidence.sparkOsCompile = `$ spark os compile --json\nexit=0\n{"generated_at":"${template.evidence.collectedAt}","ok":true,"gaps":0,"builder_trace_health_flags":["missing_trace_refs","historical_open_high_severity_events"],"builder_trace_current_health":{"status":"recent_missing_trace_refs","window":"24h","row_count":1039,"missing_trace_ref_count":480,"historical_missing_trace_ref_count":12721,"total_missing_trace_ref_count":13201,"missing_trace_ref_ratio":0.462,"high_severity_open_count":4,"unresolved_high_severity_open_count":1,"current_unresolved_high_severity_open_count":0,"latest_missing_group_count":2,"latest_clean_group_count":1,"repair_temporal_state_counts":{"latest_missing_trace_ref":2,"latest_clean_historical_window_debt":1}},"builder_trace_recent_windows":[{"window":"1h","row_count":0,"missing_trace_ref_count":0,"missing_trace_ref_ratio":0},{"window":"24h","row_count":1039,"missing_trace_ref_count":480,"missing_trace_ref_ratio":0.462}],"repo_board":{"dirty_repo_count":0,"blocked_release_count":0,"critical_repo_count":0,"duplicate_truth_count":0,"critical_duplicate_truth_count":0},"gate":{"dirty_repo_count":0,"broad_dirty_repo_count":0},"duplicate_truths":{"classification_counts":{"runtime_ahead_of_registry_pin":0}},"privacy":{"raw_secret_values_read":false,"raw_logs_read":false,"raw_conversation_content_read":false,"raw_memory_evidence_read":false,"sqlite_row_contents_read":false}}`;
  const builderTraceHealthCaveat = summarizeControlProofCanaryObservations(template);
  assert.equal(builderTraceHealthCaveat.readyForRelease, true);
  assert.equal(builderTraceHealthCaveat.readyForPublish, false);
  assert.deepEqual(builderTraceHealthCaveat.releaseCaveats, [
    'builder_trace_health | flags=historical_open_high_severity_events,missing_trace_refs | trace_status=recent_missing_trace_refs | window=24h | missing_trace_refs=480 | 1h_missing_trace_refs=0 | historical_missing_trace_refs=12721 | high_severity_open_events=4 | unresolved_high_severity_events=1 | current_unresolved_high_severity_events=0 | latest_missing_source_groups=2 | latest_clean_historical_window_groups=1'
  ]);
  assert.deepEqual(builderTraceHealthCaveat.releaseHandoffs, [
    'spark-intelligence-builder: warning builder_trace_health; next safe action: Repair or replay 2 latest-missing Builder trace source groups, then rerun spark os compile and the canary release-check.'
  ]);
  assert.match(
    formatControlProofCanaryObservationSummary(builderTraceHealthCaveat),
    /Release caveats:\n- builder_trace_health \| flags=historical_open_high_severity_events,missing_trace_refs \| trace_status=recent_missing_trace_refs \| window=24h \| missing_trace_refs=480 \| 1h_missing_trace_refs=0 \| historical_missing_trace_refs=12721 \| high_severity_open_events=4 \| unresolved_high_severity_events=1 \| current_unresolved_high_severity_events=0 \| latest_missing_source_groups=2 \| latest_clean_historical_window_groups=1/
  );
  assert.match(
    formatControlProofCanaryObservationSummary(builderTraceHealthCaveat),
    /Release handoffs:\n- spark-intelligence-builder: warning builder_trace_health; next safe action: Repair or replay 2 latest-missing Builder trace source groups, then rerun spark os compile and the canary release-check\./
  );

  template.evidence.sparkOsCompile = `$ spark os compile --json\nexit=0\n{"generated_at":"${template.evidence.collectedAt}","ok":true,"gaps":0,"builder_trace_health_flags":["open_high_severity_events"],"builder_trace_current_health":{"status":"current_clean","window":"1h","row_count":12,"missing_trace_ref_count":0,"historical_missing_trace_ref_count":0,"total_missing_trace_ref_count":0,"missing_trace_ref_ratio":0,"high_severity_open_count":2,"unresolved_high_severity_open_count":2,"current_unresolved_high_severity_open_count":2},"builder_trace_recent_windows":[{"window":"1h","row_count":12,"missing_trace_ref_count":0,"missing_trace_ref_ratio":0},{"window":"24h","row_count":1039,"missing_trace_ref_count":0,"missing_trace_ref_ratio":0}],"repo_board":{"dirty_repo_count":0,"blocked_release_count":0,"critical_repo_count":0,"duplicate_truth_count":0,"critical_duplicate_truth_count":0},"gate":{"dirty_repo_count":0,"broad_dirty_repo_count":0},"duplicate_truths":{"classification_counts":{"runtime_ahead_of_registry_pin":0}},"privacy":{"raw_secret_values_read":false,"raw_logs_read":false,"raw_conversation_content_read":false,"sqlite_row_contents_read":false,"raw_memory_evidence_read":false}}`;
  const currentHighSeverity = summarizeControlProofCanaryObservations(template);
  assert.equal(currentHighSeverity.readyForRelease, false);
  assert.equal(currentHighSeverity.readyForPublish, false);
  assert.deepEqual(currentHighSeverity.releaseCaveats, [
    'builder_trace_health | flags=open_high_severity_events | trace_status=current_clean | window=1h | missing_trace_refs=0 | 1h_missing_trace_refs=0 | historical_missing_trace_refs=0 | high_severity_open_events=2 | unresolved_high_severity_events=2 | current_unresolved_high_severity_events=2'
  ]);
  assert.deepEqual(currentHighSeverity.releaseHandoffs, [
    'spark-intelligence-builder: blocked builder_trace_health; next safe action: Resolve or replay current open high-severity Builder event families, then rerun spark os compile and the canary release-check.'
  ]);
  assert.deepEqual(currentHighSeverity.releaseHandoffDetails.map((entry) => ({
    owner: entry.owner,
    status: entry.status,
    family: entry.family,
    releaseBlocking: entry.releaseBlocking,
    publishBlocking: entry.publishBlocking
  })), [
    {
      owner: 'spark-intelligence-builder',
      status: 'blocked',
      family: 'builder_trace_health',
      releaseBlocking: true,
      publishBlocking: true
    }
  ]);
  assert.match(formatControlProofCanaryObservationSummary(currentHighSeverity), /Release gate: not ready/);

  template.evidence.sparkOsCompile = `$ spark os compile --json\nexit=0\n{"generated_at":"${template.evidence.collectedAt}","ok":true,"gaps":0,"builder_trace_health_flags":["historical_open_high_severity_events"],"builder_trace_current_health":{"status":"current_clean","window":"1h","row_count":2,"missing_trace_ref_count":0,"historical_missing_trace_ref_count":0,"total_missing_trace_ref_count":0,"missing_trace_ref_ratio":0,"high_severity_open_count":46,"unresolved_high_severity_open_count":1,"current_unresolved_high_severity_open_count":0,"unresolved_high_severity_source_group_count":1,"latest_unresolved_high_severity_event_created_at":"2026-06-02 09:03:25","latest_missing_group_count":0,"latest_clean_group_count":0,"repair_temporal_state_counts":{}},"builder_trace_recent_windows":[{"window":"1h","row_count":2,"missing_trace_ref_count":0,"missing_trace_ref_ratio":0},{"window":"24h","row_count":2474,"missing_trace_ref_count":0,"missing_trace_ref_ratio":0}],"repo_board":{"dirty_repo_count":0,"blocked_release_count":0,"critical_repo_count":0,"duplicate_truth_count":0,"critical_duplicate_truth_count":0},"gate":{"dirty_repo_count":0,"broad_dirty_repo_count":0},"duplicate_truths":{"classification_counts":{"runtime_ahead_of_registry_pin":0}},"privacy":{"raw_secret_values_read":false,"raw_logs_read":false,"raw_conversation_content_read":false,"raw_memory_evidence_read":false,"sqlite_row_contents_read":false}}`;
  const historicalHighSeverity = summarizeControlProofCanaryObservations(template);
  assert.equal(historicalHighSeverity.readyForRelease, true);
  assert.equal(historicalHighSeverity.readyForPublish, false);
  assert.deepEqual(historicalHighSeverity.releaseCaveats, [
    'builder_trace_health | flags=historical_open_high_severity_events | trace_status=current_clean | window=1h | missing_trace_refs=0 | 1h_missing_trace_refs=0 | historical_missing_trace_refs=0 | high_severity_open_events=46 | unresolved_high_severity_events=1 | current_unresolved_high_severity_events=0 | unresolved_high_severity_source_groups=1 | latest_unresolved_high_severity_event=2026-06-02T09:03:25Z | latest_missing_source_groups=0 | latest_clean_historical_window_groups=0'
  ]);
  assert.deepEqual(historicalHighSeverity.releaseHandoffs, [
    'spark-intelligence-builder: warning builder_trace_health; next safe action: Audit 1 unresolved historical high-severity Builder integrity family; latest unresolved event 2026-06-02T09:03:25Z, then append an owner-approved lifecycle resolution or keep it as an explicit publish handoff.'
  ]);
  assert.match(
    formatControlProofCanaryObservationSummary(historicalHighSeverity),
    /Audit 1 unresolved historical high-severity Builder integrity family; latest unresolved event 2026-06-02T09:03:25Z/
  );

  template.evidence.sparkOsCompile = `$ spark os compile --json\nexit=0\n{"generated_at":"${template.evidence.collectedAt}","ok":true,"gaps":0,"builder_trace_health_flags":["missing_trace_refs","historical_open_high_severity_events"],"builder_trace_current_health":{"status":"current_clean_historical_backlog","window":"24h","row_count":1048,"missing_trace_ref_count":0,"historical_missing_trace_ref_count":1783,"total_missing_trace_ref_count":1783,"missing_trace_ref_ratio":0,"high_severity_open_count":1,"unresolved_high_severity_open_count":1,"current_unresolved_high_severity_open_count":0,"latest_missing_group_count":0,"latest_clean_group_count":0,"repair_temporal_state_counts":{"latest_clean":9,"stale_missing_trace_ref":9}},"builder_trace_recent_windows":[{"window":"1h","row_count":0,"missing_trace_ref_count":0,"missing_trace_ref_ratio":0},{"window":"24h","row_count":1048,"missing_trace_ref_count":0,"missing_trace_ref_ratio":0},{"window":"7d","row_count":6992,"missing_trace_ref_count":0,"missing_trace_ref_ratio":0}],"repo_board":{"dirty_repo_count":0,"blocked_release_count":0,"critical_repo_count":0,"duplicate_truth_count":0,"critical_duplicate_truth_count":0},"gate":{"dirty_repo_count":0,"broad_dirty_repo_count":0},"duplicate_truths":{"classification_counts":{"runtime_ahead_of_registry_pin":0}},"privacy":{"raw_secret_values_read":false,"raw_logs_read":false,"raw_conversation_content_read":false,"raw_memory_evidence_read":false,"sqlite_row_contents_read":false}}`;
  const builderHistoricalBacklog = summarizeControlProofCanaryObservations(template);
  assert.deepEqual(builderHistoricalBacklog.releaseHandoffs, [
    'spark-intelligence-builder: warning builder_trace_health; next safe action: Audit or backfill the remaining historical Builder trace rows, then rerun spark os compile.'
  ]);
  assert.match(
    formatControlProofCanaryObservationSummary(builderHistoricalBacklog),
    /Audit or backfill the remaining historical Builder trace rows/
  );

  template.evidence.sparkOsCompile = `$ spark os compile --json\nexit=0\n{"generated_at":"${template.evidence.collectedAt}","ok":true,"gaps":0,"repo_board":{"dirty_repo_count":0,"blocked_release_count":4,"critical_repo_count":0,"duplicate_truth_count":2,"critical_duplicate_truth_count":1},"gate":{"dirty_repo_count":0,"broad_dirty_repo_count":0},"duplicate_truths":{"classification_counts":{"runtime_ahead_of_registry_pin":2,"canonical_runtime_dirty":0}},"privacy":{"raw_secret_values_read":false,"raw_logs_read":false,"raw_conversation_content_read":false,"raw_memory_evidence_read":false,"sqlite_row_contents_read":false}}`;
  const registryPinDrift = summarizeControlProofCanaryObservations(template);
  assert.equal(registryPinDrift.readyForRelease, true);
  assert.equal(registryPinDrift.readyForPublish, false);
  assert.deepEqual(registryPinDrift.releaseCaveats, [
    'repo_release_blocks | blocked_release_count=4 | critical_repo_count=0',
    'registry_pin_drift | classifications=runtime_ahead_of_registry_pin:2 | duplicate_truth_count=2 | critical_duplicate_truth_count=1'
  ]);

  template.evidence.sparkOsCompile = `$ spark os compile --json\nexit=0\n{"generated_at":"${template.evidence.collectedAt}","ok":true,"gaps":0,"repo_board":{"dirty_repo_count":0,"blocked_release_count":4,"critical_repo_count":0,"duplicate_truth_count":2,"critical_duplicate_truth_count":0},"gate":{"dirty_repo_count":0,"broad_dirty_repo_count":0},"duplicate_truths":{"classification_counts":{"local_runtime_test_artifact":2},"owner_sets":{"local_runtime_test_artifact":["spawner-ui","spark-telegram-bot"]}},"privacy":{"raw_secret_values_read":false,"raw_logs_read":false,"raw_conversation_content_read":false,"raw_memory_evidence_read":false,"sqlite_row_contents_read":false}}`;
  const localRuntimeArtifacts = summarizeControlProofCanaryObservations(template);
  assert.equal(localRuntimeArtifacts.readyForRelease, true);
  assert.equal(localRuntimeArtifacts.readyForPublish, false);
  assert.deepEqual(localRuntimeArtifacts.releaseCaveats, [
    'repo_release_blocks | blocked_release_count=4 | critical_repo_count=0',
    'local_runtime_test_artifacts | classifications=local_runtime_test_artifact:2 | duplicate_truth_count=2 | critical_duplicate_truth_count=0'
  ]);
  assert.deepEqual(localRuntimeArtifacts.releaseHandoffs, [
    'spark-installer-registry: warning local_runtime_test_artifacts; next safe action: Keep 2 installed sources (spark-telegram-bot, spawner-ui) for local SparkRecursive proof only, then port/push owner commits and update registry or release metadata before publish claims.'
  ]);
  assert.match(
    formatControlProofCanaryObservationSummary(localRuntimeArtifacts),
    /local_runtime_test_artifacts \| classifications=local_runtime_test_artifact:2/
  );
  assert.match(
    formatControlProofCanaryObservationSummary(localRuntimeArtifacts),
    /spark-installer-registry: warning local_runtime_test_artifacts/
  );

  template.evidence.sparkOsCompile = `$ spark os compile --json\nexit=0\n{"generated_at":"${template.evidence.collectedAt}","ok":true,"gaps":0,"builder_trace_health_flags":["historical_open_high_severity_events"],"builder_trace_current_health":{"status":"current_clean","window":"1h","missing_trace_ref_count":0,"historical_missing_trace_ref_count":0,"high_severity_open_count":46,"unresolved_high_severity_open_count":1,"current_unresolved_high_severity_open_count":0,"unresolved_high_severity_source_group_count":1,"latest_unresolved_high_severity_event_created_at":"2026-06-02 09:03:25"},"repo_board":{"dirty_repo_count":0,"blocked_release_count":1,"critical_repo_count":1,"duplicate_truth_count":2,"critical_duplicate_truth_count":0},"gate":{"dirty_repo_count":0,"broad_dirty_repo_count":0},"duplicate_truths":{"classification_counts":{"local_runtime_test_artifact":2},"owner_sets":{"local_runtime_test_artifact":["spark-telegram-bot","spawner-ui"]}},"publish_handoffs":{"schema_version":"spark.publish_handoffs.summary.v0","family_count":3,"families":["repo_release_blocks","local_runtime_test_artifacts","builder_trace_health"],"blocked_release_repos":[{"repo":"spark-intelligence-builder","risk_class":"critical","reason":"behind upstream","next_safe_action":"pull or merge upstream before release","behind":12}],"local_runtime_test_artifacts":{"count":2,"owners":["spark-telegram-bot","spawner-ui"]},"builder_trace_health":{"flags":["historical_open_high_severity_events"],"high_severity_open_count":46,"unresolved_high_severity_open_count":1,"current_unresolved_high_severity_open_count":0,"unresolved_high_severity_source_group_count":1,"latest_unresolved_high_severity_event_created_at":"2026-06-02 09:03:25"}},"privacy":{"raw_secret_values_read":false,"raw_logs_read":false,"raw_conversation_content_read":false,"raw_memory_evidence_read":false,"sqlite_row_contents_read":false}}`;
  const structuredPublishHandoffs = summarizeControlProofCanaryObservations(template);
  const expectedHandoffActionDetails = [
    {
      owner: 'spark-intelligence-builder',
      status: 'release_blocked',
      family: 'repo_release_blocks',
      releaseBlocking: false,
      publishBlocking: true,
      reason: 'behind upstream',
      behind: 12,
      nextSafeAction: 'pull or merge upstream before release',
      line: 'spark-intelligence-builder: release_blocked repo_release_blocks; reason: behind upstream; behind=12; next safe action: pull or merge upstream before release'
    },
    {
      owner: 'spark-installer-registry',
      status: 'warning',
      family: 'local_runtime_test_artifacts',
      releaseBlocking: false,
      publishBlocking: true,
      reason: null,
      behind: null,
      nextSafeAction: 'Keep 2 installed sources (spark-telegram-bot, spawner-ui) for local SparkRecursive proof only, then port/push owner commits and update registry or release metadata before publish claims.',
      line: 'spark-installer-registry: warning local_runtime_test_artifacts; next safe action: Keep 2 installed sources (spark-telegram-bot, spawner-ui) for local SparkRecursive proof only, then port/push owner commits and update registry or release metadata before publish claims.'
    },
    {
      owner: 'spark-intelligence-builder',
      status: 'warning',
      family: 'builder_trace_health',
      releaseBlocking: false,
      publishBlocking: true,
      reason: null,
      behind: null,
      nextSafeAction: 'Audit 1 unresolved historical high-severity Builder integrity family; latest unresolved event 2026-06-02T09:03:25Z, then append an owner-approved lifecycle resolution or keep it as an explicit publish handoff.',
      line: 'spark-intelligence-builder: warning builder_trace_health; next safe action: Audit 1 unresolved historical high-severity Builder integrity family; latest unresolved event 2026-06-02T09:03:25Z, then append an owner-approved lifecycle resolution or keep it as an explicit publish handoff.'
    }
  ];
  assert.equal(structuredPublishHandoffs.readyForRelease, true);
  assert.equal(structuredPublishHandoffs.readyForPublish, false);
  assert.deepEqual(structuredPublishHandoffs.gateDecisionDetails, {
    release: {
      ready: true,
      blockers: [],
      blockerDetails: {},
      caveats: [
        'builder_trace_health | flags=historical_open_high_severity_events | trace_status=current_clean | window=1h | missing_trace_refs=0 | historical_missing_trace_refs=0 | high_severity_open_events=46 | unresolved_high_severity_events=1 | current_unresolved_high_severity_events=0 | unresolved_high_severity_source_groups=1 | latest_unresolved_high_severity_event=2026-06-02T09:03:25Z',
        'repo_release_blocks | blocked_release_count=1 | critical_repo_count=1',
        'local_runtime_test_artifacts | classifications=local_runtime_test_artifact:2 | duplicate_truth_count=2 | critical_duplicate_truth_count=0'
      ],
      caveatDetails: {
        builder_trace_health: {
          releaseBlocking: false,
          publishBlocking: true,
          flags: ['historical_open_high_severity_events'],
          status: 'current_clean',
          window: '1h',
          missing_trace_ref_count: 0,
          one_hour_missing_trace_ref_count: null,
          historical_missing_trace_ref_count: 0,
          high_severity_open_count: 46,
          unresolved_high_severity_open_count: 1,
          current_unresolved_high_severity_open_count: 0,
          unresolved_high_severity_source_group_count: 1,
          latest_unresolved_high_severity_event_created_at: '2026-06-02T09:03:25Z',
          latest_missing_source_group_count: null,
          latest_clean_historical_window_group_count: null
        },
        repo_release_blocks: {
          releaseBlocking: false,
          publishBlocking: true,
          blocked_release_count: 1,
          critical_repo_count: 1
        },
        duplicate_truths: {
          releaseBlocking: false,
          publishBlocking: true,
          label: 'local_runtime_test_artifacts',
          classification_counts: { local_runtime_test_artifact: 2 },
          duplicate_truth_count: 2,
          critical_duplicate_truth_count: 0
        }
      },
      caveatFamilies: ['builder_trace_health', 'local_runtime_test_artifacts', 'repo_release_blocks'],
      handoffDetails: {
        schema_version: 'spark.publish_handoffs.summary.v0',
        family_count: 3,
        families: ['repo_release_blocks', 'local_runtime_test_artifacts', 'builder_trace_health'],
        blocked_release_repos: [
          {
            repo: 'spark-intelligence-builder',
            releaseBlocking: false,
            publishBlocking: true,
            risk_class: 'critical',
            reason: 'behind upstream',
            next_safe_action: 'pull or merge upstream before release',
            behind: 12
          }
        ],
        local_runtime_test_artifacts: {
          releaseBlocking: false,
          publishBlocking: true,
          count: 2,
          owners: ['spark-telegram-bot', 'spawner-ui']
        },
        builder_trace_health: {
          releaseBlocking: false,
          publishBlocking: true,
          flags: ['historical_open_high_severity_events'],
          high_severity_open_count: 46,
          unresolved_high_severity_open_count: 1,
          current_unresolved_high_severity_open_count: 0,
          unresolved_high_severity_source_group_count: 1,
          latest_unresolved_high_severity_event_created_at: '2026-06-02T09:03:25Z'
        }
      },
      handoffActionDetails: expectedHandoffActionDetails,
      handoffFamilies: ['builder_trace_health', 'local_runtime_test_artifacts', 'repo_release_blocks'],
      handoffCount: 3,
      packetEvidence: { missing: [], invalid: [], stale: [] },
      failingCases: []
    },
    publish: {
      ready: false,
      blockers: ['release_caveats', 'release_handoffs'],
      blockerDetails: {
        release_caveats: {
          caveatCount: 3,
          caveatFamilies: ['builder_trace_health', 'local_runtime_test_artifacts', 'repo_release_blocks'],
          caveatDetails: {
            builder_trace_health: {
              releaseBlocking: false,
              publishBlocking: true,
              flags: ['historical_open_high_severity_events'],
              status: 'current_clean',
              window: '1h',
              missing_trace_ref_count: 0,
              one_hour_missing_trace_ref_count: null,
              historical_missing_trace_ref_count: 0,
              high_severity_open_count: 46,
              unresolved_high_severity_open_count: 1,
              current_unresolved_high_severity_open_count: 0,
              unresolved_high_severity_source_group_count: 1,
              latest_unresolved_high_severity_event_created_at: '2026-06-02T09:03:25Z',
              latest_missing_source_group_count: null,
              latest_clean_historical_window_group_count: null
            },
            repo_release_blocks: {
              releaseBlocking: false,
              publishBlocking: true,
              blocked_release_count: 1,
              critical_repo_count: 1
            },
            duplicate_truths: {
              releaseBlocking: false,
              publishBlocking: true,
              label: 'local_runtime_test_artifacts',
              classification_counts: { local_runtime_test_artifact: 2 },
              duplicate_truth_count: 2,
              critical_duplicate_truth_count: 0
            }
          }
        },
        release_handoffs: {
          handoffCount: 3,
          handoffFamilies: ['builder_trace_health', 'local_runtime_test_artifacts', 'repo_release_blocks'],
          handoffDetails: {
            schema_version: 'spark.publish_handoffs.summary.v0',
            family_count: 3,
            families: ['repo_release_blocks', 'local_runtime_test_artifacts', 'builder_trace_health'],
            blocked_release_repos: [
              {
                repo: 'spark-intelligence-builder',
                releaseBlocking: false,
                publishBlocking: true,
                risk_class: 'critical',
                reason: 'behind upstream',
                next_safe_action: 'pull or merge upstream before release',
                behind: 12
              }
            ],
            local_runtime_test_artifacts: {
              releaseBlocking: false,
              publishBlocking: true,
              count: 2,
              owners: ['spark-telegram-bot', 'spawner-ui']
            },
            builder_trace_health: {
              releaseBlocking: false,
              publishBlocking: true,
              flags: ['historical_open_high_severity_events'],
              high_severity_open_count: 46,
              unresolved_high_severity_open_count: 1,
              current_unresolved_high_severity_open_count: 0,
              unresolved_high_severity_source_group_count: 1,
              latest_unresolved_high_severity_event_created_at: '2026-06-02T09:03:25Z'
            }
          },
          handoffActionDetails: expectedHandoffActionDetails,
          handoffs: [
            'spark-intelligence-builder: release_blocked repo_release_blocks; reason: behind upstream; behind=12; next safe action: pull or merge upstream before release',
            'spark-installer-registry: warning local_runtime_test_artifacts; next safe action: Keep 2 installed sources (spark-telegram-bot, spawner-ui) for local SparkRecursive proof only, then port/push owner commits and update registry or release metadata before publish claims.',
            'spark-intelligence-builder: warning builder_trace_health; next safe action: Audit 1 unresolved historical high-severity Builder integrity family; latest unresolved event 2026-06-02T09:03:25Z, then append an owner-approved lifecycle resolution or keep it as an explicit publish handoff.'
          ]
        }
      },
      caveats: [
        'builder_trace_health | flags=historical_open_high_severity_events | trace_status=current_clean | window=1h | missing_trace_refs=0 | historical_missing_trace_refs=0 | high_severity_open_events=46 | unresolved_high_severity_events=1 | current_unresolved_high_severity_events=0 | unresolved_high_severity_source_groups=1 | latest_unresolved_high_severity_event=2026-06-02T09:03:25Z',
        'repo_release_blocks | blocked_release_count=1 | critical_repo_count=1',
        'local_runtime_test_artifacts | classifications=local_runtime_test_artifact:2 | duplicate_truth_count=2 | critical_duplicate_truth_count=0'
      ],
      caveatDetails: {
        builder_trace_health: {
          releaseBlocking: false,
          publishBlocking: true,
          flags: ['historical_open_high_severity_events'],
          status: 'current_clean',
          window: '1h',
          missing_trace_ref_count: 0,
          one_hour_missing_trace_ref_count: null,
          historical_missing_trace_ref_count: 0,
          high_severity_open_count: 46,
          unresolved_high_severity_open_count: 1,
          current_unresolved_high_severity_open_count: 0,
          unresolved_high_severity_source_group_count: 1,
          latest_unresolved_high_severity_event_created_at: '2026-06-02T09:03:25Z',
          latest_missing_source_group_count: null,
          latest_clean_historical_window_group_count: null
        },
        repo_release_blocks: {
          releaseBlocking: false,
          publishBlocking: true,
          blocked_release_count: 1,
          critical_repo_count: 1
        },
        duplicate_truths: {
          releaseBlocking: false,
          publishBlocking: true,
          label: 'local_runtime_test_artifacts',
          classification_counts: { local_runtime_test_artifact: 2 },
          duplicate_truth_count: 2,
          critical_duplicate_truth_count: 0
        }
      },
      caveatFamilies: ['builder_trace_health', 'local_runtime_test_artifacts', 'repo_release_blocks'],
      handoffDetails: {
        schema_version: 'spark.publish_handoffs.summary.v0',
        family_count: 3,
        families: ['repo_release_blocks', 'local_runtime_test_artifacts', 'builder_trace_health'],
        blocked_release_repos: [
          {
            repo: 'spark-intelligence-builder',
            releaseBlocking: false,
            publishBlocking: true,
            risk_class: 'critical',
            reason: 'behind upstream',
            next_safe_action: 'pull or merge upstream before release',
            behind: 12
          }
        ],
        local_runtime_test_artifacts: {
          releaseBlocking: false,
          publishBlocking: true,
          count: 2,
          owners: ['spark-telegram-bot', 'spawner-ui']
        },
        builder_trace_health: {
          releaseBlocking: false,
          publishBlocking: true,
          flags: ['historical_open_high_severity_events'],
          high_severity_open_count: 46,
          unresolved_high_severity_open_count: 1,
          current_unresolved_high_severity_open_count: 0,
          unresolved_high_severity_source_group_count: 1,
          latest_unresolved_high_severity_event_created_at: '2026-06-02T09:03:25Z'
        }
      },
      handoffActionDetails: expectedHandoffActionDetails,
      handoffFamilies: ['builder_trace_health', 'local_runtime_test_artifacts', 'repo_release_blocks'],
      handoffCount: 3,
      packetEvidence: { missing: [], invalid: [], stale: [] },
      failingCases: []
    }
  });
  assert.deepEqual(structuredPublishHandoffs.releaseHandoffs, [
    'spark-intelligence-builder: release_blocked repo_release_blocks; reason: behind upstream; behind=12; next safe action: pull or merge upstream before release',
    'spark-installer-registry: warning local_runtime_test_artifacts; next safe action: Keep 2 installed sources (spark-telegram-bot, spawner-ui) for local SparkRecursive proof only, then port/push owner commits and update registry or release metadata before publish claims.',
    'spark-intelligence-builder: warning builder_trace_health; next safe action: Audit 1 unresolved historical high-severity Builder integrity family; latest unresolved event 2026-06-02T09:03:25Z, then append an owner-approved lifecycle resolution or keep it as an explicit publish handoff.'
  ]);
  assert.deepEqual(structuredPublishHandoffs.releaseHandoffDetails.map((entry) => ({
    owner: entry.owner,
    status: entry.status,
    family: entry.family,
    releaseBlocking: entry.releaseBlocking,
    publishBlocking: entry.publishBlocking,
    reason: entry.reason,
    behind: entry.behind,
    nextSafeAction: entry.nextSafeAction
  })), [
    {
      owner: 'spark-intelligence-builder',
      status: 'release_blocked',
      family: 'repo_release_blocks',
      releaseBlocking: false,
      publishBlocking: true,
      reason: 'behind upstream',
      behind: 12,
      nextSafeAction: 'pull or merge upstream before release'
    },
    {
      owner: 'spark-installer-registry',
      status: 'warning',
      family: 'local_runtime_test_artifacts',
      releaseBlocking: false,
      publishBlocking: true,
      reason: null,
      behind: null,
      nextSafeAction: 'Keep 2 installed sources (spark-telegram-bot, spawner-ui) for local SparkRecursive proof only, then port/push owner commits and update registry or release metadata before publish claims.'
    },
    {
      owner: 'spark-intelligence-builder',
      status: 'warning',
      family: 'builder_trace_health',
      releaseBlocking: false,
      publishBlocking: true,
      reason: null,
      behind: null,
      nextSafeAction: 'Audit 1 unresolved historical high-severity Builder integrity family; latest unresolved event 2026-06-02T09:03:25Z, then append an owner-approved lifecycle resolution or keep it as an explicit publish handoff.'
    }
  ]);
  assert.deepEqual(structuredPublishHandoffs.releaseCaveatDetails, {
    builder_trace_health: {
      releaseBlocking: false,
      publishBlocking: true,
      flags: ['historical_open_high_severity_events'],
      status: 'current_clean',
      window: '1h',
      missing_trace_ref_count: 0,
      one_hour_missing_trace_ref_count: null,
      historical_missing_trace_ref_count: 0,
      high_severity_open_count: 46,
      unresolved_high_severity_open_count: 1,
      current_unresolved_high_severity_open_count: 0,
      unresolved_high_severity_source_group_count: 1,
      latest_unresolved_high_severity_event_created_at: '2026-06-02T09:03:25Z',
      latest_missing_source_group_count: null,
      latest_clean_historical_window_group_count: null
    },
    repo_release_blocks: {
      releaseBlocking: false,
      publishBlocking: true,
      blocked_release_count: 1,
      critical_repo_count: 1
    },
    duplicate_truths: {
      releaseBlocking: false,
      publishBlocking: true,
      label: 'local_runtime_test_artifacts',
      classification_counts: { local_runtime_test_artifact: 2 },
      duplicate_truth_count: 2,
      critical_duplicate_truth_count: 0
    }
  });
  assert.deepEqual(structuredPublishHandoffs.publishHandoffs, {
    schema_version: 'spark.publish_handoffs.summary.v0',
    family_count: 3,
    families: ['repo_release_blocks', 'local_runtime_test_artifacts', 'builder_trace_health'],
    blocked_release_repos: [
      {
        repo: 'spark-intelligence-builder',
        releaseBlocking: false,
        publishBlocking: true,
        risk_class: 'critical',
        reason: 'behind upstream',
        next_safe_action: 'pull or merge upstream before release',
        behind: 12
      }
    ],
    local_runtime_test_artifacts: {
      releaseBlocking: false,
      publishBlocking: true,
      count: 2,
      owners: ['spark-telegram-bot', 'spawner-ui']
    },
    builder_trace_health: {
      releaseBlocking: false,
      publishBlocking: true,
      flags: ['historical_open_high_severity_events'],
      high_severity_open_count: 46,
      unresolved_high_severity_open_count: 1,
      current_unresolved_high_severity_open_count: 0,
      unresolved_high_severity_source_group_count: 1,
      latest_unresolved_high_severity_event_created_at: '2026-06-02T09:03:25Z'
    }
  });

  template.evidence.sparkOsCompile = `$ spark os compile --json\nexit=0\n{"generated_at":"${template.evidence.collectedAt}","ok":true,"gaps":0,"repo_board":{"dirty_repo_count":0,"blocked_release_count":1,"critical_repo_count":0,"duplicate_truth_count":0,"critical_duplicate_truth_count":0},"gate":{"dirty_repo_count":0,"broad_dirty_repo_count":0},"duplicate_truths":{"classification_counts":{"runtime_ahead_of_registry_pin":0}},"privacy":{"raw_secret_values_read":false,"raw_logs_read":false,"raw_conversation_content_read":false,"raw_memory_evidence_read":false,"sqlite_row_contents_read":false}}`;
  const blockedReleaseOnly = summarizeControlProofCanaryObservations(template);
  assert.equal(blockedReleaseOnly.readyForRelease, true);
  assert.equal(blockedReleaseOnly.readyForPublish, false);
  assert.deepEqual(blockedReleaseOnly.releaseCaveats, [
    'repo_release_blocks | blocked_release_count=1 | critical_repo_count=0'
  ]);

  template.evidence.sparkOsCompile = cleanSparkOsCompile('2026-06-23T23:40:00.000Z');
  const staleEmbeddedCompile = summarizeControlProofCanaryObservations(template);
  assert.equal(staleEmbeddedCompile.readyForRelease, false);
  assert.deepEqual(staleEmbeddedCompile.gateDecisionDetails.release.blockers, ['invalid_packet_evidence']);
  assert.deepEqual(staleEmbeddedCompile.gateDecisionDetails.release.blockerDetails, {
    invalid_packet_evidence: {
      keys: ['spark_os_compile'],
      details: staleEmbeddedCompile.packetEvidenceDetails.invalid
    }
  });
  assert.deepEqual(staleEmbeddedCompile.gateDecisionDetails.publish.blockers, [
    'release_gate_not_ready',
    'release_caveats'
  ]);
  assert.deepEqual(staleEmbeddedCompile.gateDecisionDetails.publish.blockerDetails.release_gate_not_ready, {
    releaseReady: false,
    releaseBlockers: ['invalid_packet_evidence'],
    releaseBlockerDetails: staleEmbeddedCompile.gateDecisionDetails.release.blockerDetails
  });
  assert.deepEqual(staleEmbeddedCompile.invalidPacketEvidence, ['spark_os_compile']);
  assert.deepEqual(staleEmbeddedCompile.packetEvidenceDetails.invalid, [{
    key: 'spark_os_compile',
    state: 'invalid',
    reason: 'spark os compile proof is dirty, incomplete, failed, or timestamp-mismatched',
    generatedAt: template.generatedAt,
    runtimeEvidenceCollectedAt: template.evidence.collectedAt,
    runtimeEvidenceExpiresAt: staleEmbeddedCompile.runtimeEvidenceExpiresAt
  }]);

  template.evidence.sparkOsCompile = CLEAN_SPARK_OS_COMPILE;
  template.evidence.controlProofAudit = cleanControlProofAudit('2026-06-23T23:40:00.000Z');
  const staleEmbeddedAudit = summarizeControlProofCanaryObservations(template);
  assert.equal(staleEmbeddedAudit.readyForRelease, false);
  assert.deepEqual(staleEmbeddedAudit.invalidPacketEvidence, ['control_proof_audit']);

  template.evidence.controlProofAudit = CLEAN_CONTROL_PROOF_AUDIT;
  template.generatedAt = 'June 24, 2026 00:00 UTC';
  const looseGeneratedAt = summarizeControlProofCanaryObservations(template);
  assert.equal(looseGeneratedAt.readyForRelease, false);
  assert.deepEqual(looseGeneratedAt.invalidPacketEvidence, ['packet_generated_at']);
  assert.match(formatControlProofCanaryObservationSummary(looseGeneratedAt), /Packet evidence invalid: packet_generated_at/);

  template.generatedAt = '2026-06-24T00:00:00.000Z';
  template.evidence.collectedAt = '2026-06-24T00:06:00.000Z';
  template.evidence.sparkOsCompile = cleanSparkOsCompile('2026-06-24T00:06:00.000Z');
  template.evidence.controlProofAudit = cleanControlProofAudit('2026-06-24T00:06:00.000Z');
  const staleGeneratedAt = summarizeControlProofCanaryObservations(template, { now: '2026-06-24T00:06:00.000Z' });
  assert.equal(staleGeneratedAt.readyForRelease, false);
  assert.deepEqual(staleGeneratedAt.invalidPacketEvidence, ['packet_generated_at']);

  template.generatedAt = '2000-01-01T00:00:00.000Z';
  template.evidence.collectedAt = '2000-01-01T00:00:00.000Z';
  template.evidence.sparkOsCompile = cleanSparkOsCompile('2000-01-01T00:00:00.000Z');
  template.evidence.controlProofAudit = cleanControlProofAudit('2000-01-01T00:00:00.000Z');
  const staleSourceSnapshot = summarizeControlProofCanaryObservations(template);
  assert.equal(staleSourceSnapshot.readyForRelease, false);
  assert.ok(staleSourceSnapshot.invalidPacketEvidence.includes('source_snapshot'));

  template.generatedAt = '2026-06-24T00:06:00.000Z';
  template.evidence.collectedAt = '2026-06-24T00:06:00.000Z';
  template.evidence.sparkOsCompile = cleanSparkOsCompile('2026-06-24T00:06:00.000Z');
  template.evidence.controlProofAudit = cleanControlProofAudit('2026-06-24T00:06:00.000Z');
  const strictGeneratedAt = summarizeControlProofCanaryObservations(template, { now: '2026-06-24T00:06:00.000Z' });
  assert.equal(strictGeneratedAt.readyForRelease, true);
  assert.deepEqual(strictGeneratedAt.invalidPacketEvidence, []);

  template.generatedAt = '2026-06-24T00:12:00.000Z';
  const futureGeneratedAt = summarizeControlProofCanaryObservations(template, { now: '2026-06-24T00:06:00.000Z' });
  assert.equal(futureGeneratedAt.readyForRelease, false);
  assert.deepEqual(futureGeneratedAt.invalidPacketEvidence, ['packet_generated_at']);

  template.generatedAt = '2026-06-24T00:11:00.000Z';
  const skewGeneratedAt = summarizeControlProofCanaryObservations(template, { now: '2026-06-24T00:06:00.000Z' });
  assert.equal(skewGeneratedAt.readyForRelease, true);
  assert.deepEqual(skewGeneratedAt.invalidPacketEvidence, []);

  template.evidence.notes = 'Collected locally; raw repo board was /Users/example/private and chat_id was hidden.';
  template.generatedAt = '2026-06-24T00:06:00.000Z';
  const leakyRuntimeEvidenceNotes = summarizeControlProofCanaryObservations(template, { now: '2026-06-24T00:06:00.000Z' });
  assert.equal(leakyRuntimeEvidenceNotes.readyForRelease, false);
  assert.deepEqual(leakyRuntimeEvidenceNotes.invalidPacketEvidence, ['runtime_evidence_notes']);
  assert.match(formatControlProofCanaryObservationSummary(leakyRuntimeEvidenceNotes), /Packet evidence invalid: runtime_evidence_notes/);

  template.evidence.notes = `Collected locally; screenshot ${STABLE_SCREENSHOT_REF}.`;
  const digestRuntimeEvidenceNotes = summarizeControlProofCanaryObservations(template, { now: '2026-06-24T00:06:00.000Z' });
  assert.equal(digestRuntimeEvidenceNotes.readyForRelease, true);
  assert.deepEqual(digestRuntimeEvidenceNotes.invalidPacketEvidence, []);
});

test('observation summary rejects unfilled run-guide placeholders as missing captures', () => {
  let template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
  template = withControlProofCanaryRuntimeEvidence(template, {
    sparkLiveStatus: CLEAN_SPARK_LIVE_STATUS,
    providerStatus: CLEAN_PROVIDER_STATUS,
    runtimeSync: CLEAN_RUNTIME_SYNC,
    sparkOsCompile: CLEAN_SPARK_OS_COMPILE,
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
    screenshotRefs: ['<screenshot digest>'],
    userConfirmation: '<confirmed in SparkRecursive_bot>'
  };

  const summary = summarizeControlProofCanaryObservations(template);
  assert.equal(summary.readyForRelease, false);
  assert.deepEqual(summary.cases[0].missingCaptures, [
    'observed_reply',
    'side_effects_unobserved',
    'proof_join',
    'proof_panel',
    'screenshot',
    'user_confirmation'
  ]);
  assert.match(formatControlProofCanaryObservationSummary(summary), /missing observed_reply, side_effects_unobserved, proof_join, proof_panel, screenshot, user_confirmation/);
});

test('observation recorder updates one case while preserving packet evidence', () => {
  let template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
  template = withControlProofCanaryRuntimeEvidence(template, {
    sparkLiveStatus: CLEAN_SPARK_LIVE_STATUS,
    providerStatus: CLEAN_PROVIDER_STATUS,
    runtimeSync: CLEAN_RUNTIME_SYNC,
    sparkOsCompile: CLEAN_SPARK_OS_COMPILE,
    controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
    notes: 'Collected locally.'
  });

  const recorded = recordControlProofCanaryObservation(template, {
    id: 'cp-builder-001',
    verdict: 'pass',
    reply: 'Route confidence means Spark is justified in taking this route now.',
    sideEffects: {
      filesChanged: false,
      memoryWritten: false,
      missionStarted: false,
      externalNetworkCalled: false,
      accessChanged: false,
      providerChanged: false,
      mediaHandled: false,
      notes: 'No mission or mutation observed.'
    },
    proofJoin: 'Builder gateway joined with redacted proof ref.',
    proofPanel: CLEAN_PROOF_PANEL,
    screenshotRefs: [STABLE_SCREENSHOT_REF],
    userConfirmation: 'User confirmed Telegram reply rendered once.'
  });

  assert.equal(recorded.evidence.notes, 'Collected locally.');
  assert.equal(recorded.cases[0].observed.verdict, 'pass');
  assert.equal(recorded.cases[0].observed.sideEffects.missionStarted, false);
  assert.deepEqual(recorded.cases[0].observed.screenshotRefs, [STABLE_SCREENSHOT_REF]);
  assert.equal(summarizeControlProofCanaryObservations(recorded).readyForRelease, true);

  const partiallyUpdated = recordControlProofCanaryObservation(recorded, {
    id: 'cp-builder-001',
    notes: 'Retested after runtime sync.'
  });
  assert.deepEqual(partiallyUpdated.cases[0].observed.screenshotRefs, [STABLE_SCREENSHOT_REF]);
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
  assert.equal(observed.cases[0].expected.route, 'plain_conversation');
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
  assert.match(coverage.stdout, /Cases: 28/);
  assert.match(coverage.stdout, /Intentional action cases: 4/);
  assert.match(coverage.stdout, /- publish: 1/);

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
    const requiredCategories: ControlProofCanaryCategory[] = [
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
      'publish',
      'web_research',
      'model_switch',
      'media',
      'audio',
      'voice'
    ];
    const categoryCompleteCases = requiredCategories.map((category) =>
      CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.category === category)!
    );
    const partialReleasePath = resolve(tempRoot, 'category-complete-partial-release.json');
    writeFileSync(
      partialReleasePath,
      JSON.stringify(buildControlProofCanaryObservationTemplate(categoryCompleteCases), null, 2),
      'utf8'
    );
    const partialReleaseCheck = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        partialReleasePath,
        '--release-check'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(partialReleaseCheck.status, 1);
    assert.match(partialReleaseCheck.stdout, /Required category coverage: complete/);
    assert.match(partialReleaseCheck.stdout, /Full release pack: missing/);

    const staleFullReleasePath = resolve(tempRoot, 'stale-full-release.json');
    const staleFullRelease = JSON.parse(readFileSync(resolve(ROOT, 'outputs/live-canary-full/live-canary-observations.json'), 'utf8'));
    staleFullRelease.evidence.collectedAt = '2000-01-01T00:00:00.000Z';
    writeFileSync(staleFullReleasePath, JSON.stringify(staleFullRelease, null, 2), 'utf8');
    const staleFullReleaseCheck = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        staleFullReleasePath,
        '--release-check'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(staleFullReleaseCheck.status, 1);
    assert.match(staleFullReleaseCheck.stdout, /Packet evidence stale: runtime_evidence_collected_at/);
    assert.match(staleFullReleaseCheck.stdout, /Run with `--refresh-runtime-evidence` before making a release claim/);
    assert.match(staleFullReleaseCheck.stdout, /Full release pack: complete/);

    const publishCaveatPath = resolve(tempRoot, 'publish-caveat-full-release.json');
    const publishCaveatPacket = JSON.parse(readFileSync(resolve(ROOT, 'outputs/live-canary-full/live-canary-observations.json'), 'utf8'));
    publishCaveatPacket.evidence.collectedAt = new Date().toISOString();
    publishCaveatPacket.generatedAt = publishCaveatPacket.evidence.collectedAt;
    publishCaveatPacket.evidence.sparkOsCompile = `$ spark os compile --json\nexit=0\n{"generated_at":"${publishCaveatPacket.evidence.collectedAt}","ok":true,"gaps":0,"builder_trace_health_flags":[],"builder_trace_current_health":{"status":"current_clean","window":"24h","row_count":100,"missing_trace_ref_count":0,"historical_missing_trace_ref_count":0,"total_missing_trace_ref_count":0,"missing_trace_ref_ratio":0},"builder_trace_recent_windows":[{"window":"1h","row_count":0,"missing_trace_ref_count":0,"missing_trace_ref_ratio":0},{"window":"24h","row_count":100,"missing_trace_ref_count":0,"missing_trace_ref_ratio":0}],"repo_board":{"dirty_repo_count":0,"blocked_release_count":0,"critical_repo_count":0,"duplicate_truth_count":2,"critical_duplicate_truth_count":1},"gate":{"dirty_repo_count":0,"broad_dirty_repo_count":0},"duplicate_truths":{"classification_counts":{"runtime_ahead_of_registry_pin":2}},"privacy":{"raw_secret_values_read":false,"raw_logs_read":false,"raw_conversation_content_read":false,"raw_memory_evidence_read":false,"sqlite_row_contents_read":false}}`;
    const publishCanary = publishCaveatPacket.cases.find((entry: { id: string }) => entry.id === 'cp-publish-001');
    if (publishCanary) {
      publishCanary.observed = {
        ...publishCanary.observed,
        verdict: 'pass',
        reply: [
          'Current evidence shows 2 registry truth drift items; that means the running code is not fully matched to published release metadata yet.',
          'Live behavior can still be release-ready, but publish stays not ready until the registry drift handoff is resolved.',
          '',
          'spark-telegram-bot: release branch pending registry batch. Keep it in the next verified metadata batch before claiming registry readiness.',
          'spawner-ui: release branch pending registry batch. Keep it in the next verified metadata batch before claiming registry readiness.',
          '',
          'This was a read-only evidence lookup; no registry edit was made.'
        ].join('\n'),
        sideEffects: {
          filesChanged: false,
          memoryWritten: false,
          missionStarted: false,
          externalNetworkCalled: false,
          accessChanged: false,
          providerChanged: false,
          mediaHandled: false,
          notes: 'Read-only registry drift lookup; no registry edit or release metadata change.'
        },
        proofJoin: 'Telegram final answer joined read-only registry drift evidence without raw commits.',
        screenshotRefs: ['screenshot:sha256:1111111111111111111111111111111111111111111111111111111111111111'],
        userConfirmation: 'Verified in SparkRecursive_bot.'
      };
    }
    writeFileSync(publishCaveatPath, JSON.stringify(publishCaveatPacket, null, 2), 'utf8');
    const caveatReleaseCheck = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        publishCaveatPath,
        '--release-check'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(caveatReleaseCheck.status, 0, caveatReleaseCheck.stderr);
    assert.match(caveatReleaseCheck.stdout, /Release gate: ready/);
    assert.match(caveatReleaseCheck.stdout, /Publish gate: not ready/);
    const caveatPublishCheck = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        publishCaveatPath,
        '--publish-check'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(caveatPublishCheck.status, 1);
    assert.match(caveatPublishCheck.stdout, /Release gate: ready/);
    assert.match(caveatPublishCheck.stdout, /Publish gate: not ready/);
    assert.match(caveatPublishCheck.stdout, /Release handoffs:/);
    assert.match(caveatPublishCheck.stdout, /Full release pack: complete/);

    const duplicateObservationsPath = resolve(tempRoot, 'duplicate-observations.json');
    writeFileSync(
      duplicateObservationsPath,
      JSON.stringify(buildControlProofCanaryObservationTemplate([
        CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!,
        CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
      ]), null, 2),
      'utf8'
    );
    const duplicateReleaseCheck = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        duplicateObservationsPath,
        '--release-check'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(duplicateReleaseCheck.status, 1);
    assert.match(duplicateReleaseCheck.stderr, /Duplicate observed canary id: cp-builder-001/);
    assert.doesNotMatch(duplicateReleaseCheck.stderr, /at main|\.ts:\d+|\/Users\/|\/var\/folders\//);

    const missingObservations = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        `${ROOT}/missing-local-packet.json`,
        '--release-check'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(missingObservations.status, 1);
    assert.match(missingObservations.stderr, /Control-proof canary error:/);
    assert.doesNotMatch(missingObservations.stderr, new RegExp(escapeRegExp(ROOT)));
    assert.doesNotMatch(missingObservations.stderr, /\/Users\//);

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

    const staleProofObservationsPath = resolve(tempRoot, 'stale-proof-observations.json');
    let staleProofObservations = buildControlProofCanaryObservationTemplate([
      CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-noaction-001')!,
      CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!,
      CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-proof-001')!
    ], { generatedAt: '2026-06-24T00:00:00.000Z' });
    staleProofObservations = withControlProofCanaryRuntimeEvidence(staleProofObservations, {
      sparkLiveStatus: CLEAN_SPARK_LIVE_STATUS,
      providerStatus: CLEAN_PROVIDER_STATUS,
      runtimeSync: CLEAN_RUNTIME_SYNC,
      sparkOsCompile: CLEAN_SPARK_OS_COMPILE,
      controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT.replace('legacy proof gaps: 3', 'legacy proof gaps: 2'),
      notes: null
    });
    staleProofObservations.cases = staleProofObservations.cases.map((entry) => ({
      ...entry,
      observed: {
        ...entry.observed,
        verdict: 'pass',
        reply: 'Route confidence means Spark is justified in taking this route now.',
        sideEffects: {
          ...entry.observed.sideEffects,
          filesChanged: false,
          memoryWritten: false,
          missionStarted: false,
          externalNetworkCalled: false,
          accessChanged: false,
          providerChanged: false,
          mediaHandled: false,
          notes: 'No mutation observed.'
        },
        proofJoin: 'Builder joined.',
        proofPanel: CLEAN_PROOF_PANEL,
        screenshotRefs: [STABLE_SCREENSHOT_REF],
        userConfirmation: 'Confirmed in SparkRecursive_bot.'
      }
    }));
    writeFileSync(staleProofObservationsPath, JSON.stringify(staleProofObservations, null, 2), 'utf8');
    const staleProofRunGuide = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        staleProofObservationsPath,
        '--stale-proof-run-guide'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(staleProofRunGuide.status, 0, staleProofRunGuide.stderr);
    assert.match(staleProofRunGuide.stdout, /Control-Proof Live Run Guide/);
    assert.match(staleProofRunGuide.stdout, /1\. cp-builder-001/);
    assert.match(staleProofRunGuide.stdout, /2\. cp-proof-001/);
    assert.match(staleProofRunGuide.stdout, /3\. cp-noaction-001/);
    assert.match(staleProofRunGuide.stdout, /Proof inspection prompt:\n```text\n\/proof\n```/);
    assert.match(staleProofRunGuide.stdout, /--record-case cp-builder-001/);

    observed.cases[0].observed = {
      ...observed.cases[0].observed,
      verdict: 'pass',
      reply: 'Route confidence means Spark is justified in taking this route now.',
      sideEffects: {
        ...observed.cases[0].observed.sideEffects,
        filesChanged: false,
        memoryWritten: false,
        missionStarted: false,
        externalNetworkCalled: false,
        accessChanged: false,
        providerChanged: false,
        mediaHandled: false,
        notes: 'No mutation observed.'
      },
      proofJoin: 'Builder joined.',
      proofPanel: CLEAN_PROOF_PANEL,
      screenshotRefs: [STABLE_SCREENSHOT_REF],
      userConfirmation: 'Confirmed in SparkRecursive_bot.'
    };
    observed.evidence = {
      collectedAt: new Date().toISOString(),
      sparkLiveStatus: CLEAN_SPARK_LIVE_STATUS,
      providerStatus: CLEAN_PROVIDER_STATUS,
      runtimeSync: CLEAN_RUNTIME_SYNC,
      sparkOsCompile: CLEAN_SPARK_OS_COMPILE,
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
    const recordedSummaryJsonPath = resolve(tempRoot, 'recorded-summary.json');
    const proofPanelPath = resolve(tempRoot, 'proof-panel.txt');
    const screenshotPath = resolve(tempRoot, 'spark-recursive-builder.png');
    const screenshotProofPath = resolve(tempRoot, 'spark-recursive-builder-proof.png');
    writeFileSync(proofPanelPath, `${CLEAN_PROOF_PANEL}\n`, 'utf8');
    writeFileSync(screenshotPath, 'telegram reply screenshot bytes', 'utf8');
    writeFileSync(screenshotProofPath, 'telegram proof screenshot bytes', 'utf8');
    const screenshotRef = `screenshot:sha256:${createHash('sha256').update(readFileSync(screenshotPath)).digest('hex')}`;
    const screenshotProofRef = `screenshot:sha256:${createHash('sha256').update(readFileSync(screenshotProofPath)).digest('hex')}`;
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
        '--screenshot-file',
        screenshotPath,
        '--screenshot-file',
        screenshotProofPath,
        '--summary-out',
        recordedSummaryPath,
        '--summary-json-out',
        recordedSummaryJsonPath,
        '--user-confirmation',
        'Confirmed in SparkRecursive_bot.'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(record.status, 0, record.stderr);
    assert.match(record.stdout, /Recorded control-proof observation for cp-builder-001/);
    assert.match(record.stdout, /Wrote control-proof observation summary/);
    assert.match(record.stdout, /Wrote control-proof observation summary JSON/);
    assert.match(record.stdout, /Release gate: ready/);
    const recorded = JSON.parse(readFileSync(recordedPath, 'utf8'));
    assert.equal(recorded.cases[0].observed.reply, 'Route confidence means Spark is justified in taking this route now.');
    assert.equal(recorded.cases[0].observed.sideEffects.missionStarted, false);
    assert.deepEqual(recorded.cases[0].observed.screenshotRefs, [
      screenshotRef,
      screenshotProofRef
    ]);
    assert.match(readFileSync(recordedSummaryPath, 'utf8'), /Release gate: ready/);
    const recordedSummaryJson = JSON.parse(readFileSync(recordedSummaryJsonPath, 'utf8'));
    assert.equal(recordedSummaryJson.summary.readyForRelease, true);
    assert.equal(recordedSummaryJson.coverage.totalCases, 1);

    const missingScreenshotRecord = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        observationsPath,
        '--out',
        resolve(tempRoot, 'missing-screenshot-recorded.json'),
        '--record-case',
        'cp-builder-001',
        '--verdict',
        'pass',
        '--screenshot-file',
        resolve(tempRoot, 'missing-screenshot.png')
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(missingScreenshotRecord.status, 1);
    assert.match(missingScreenshotRecord.stderr, /Control-proof canary error:/);
    assert.doesNotMatch(missingScreenshotRecord.stderr, new RegExp(tempRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const accessTemplate = withControlProofCanaryRuntimeEvidence(
      buildControlProofCanaryObservationTemplate([
        CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-access-002')!
      ], { generatedAt: '2026-06-24T00:00:00.000Z' }),
      {
        sparkLiveStatus: CLEAN_SPARK_LIVE_STATUS,
        providerStatus: CLEAN_PROVIDER_STATUS,
        runtimeSync: CLEAN_RUNTIME_SYNC,
        sparkOsCompile: CLEAN_SPARK_OS_COMPILE,
        controlProofAudit: CLEAN_CONTROL_PROOF_AUDIT,
        notes: null
      }
    );
    const accessObservationsPath = resolve(tempRoot, 'access-observations.json');
    const accessRecordedPath = resolve(tempRoot, 'access-recorded.json');
    const accessReplyPath = resolve(tempRoot, 'access-reply.txt');
    writeFileSync(accessObservationsPath, JSON.stringify(accessTemplate, null, 2), 'utf8');
    writeFileSync(accessReplyPath, 'Access is set to level three; I did not run repair setup.\n', 'utf8');
    const recordAccess = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        accessObservationsPath,
        '--out',
        accessRecordedPath,
        '--record-case',
        'cp-access-002',
        '--verdict',
        'pass',
        '--reply-file',
        accessReplyPath,
        '--access-changed',
        'true',
        '--no-other-side-effects',
        '--side-effects-notes',
        'Access changed; no other mutation observed.',
        '--proof-join',
        'Access change joined with redacted proof ref.',
        '--proof-panel-file',
        proofPanelPath,
        '--screenshot-ref',
        STABLE_SCREENSHOT_REF,
        '--user-confirmation',
        'Confirmed in SparkRecursive_bot.'
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    assert.equal(recordAccess.status, 0, recordAccess.stderr);
    assert.match(recordAccess.stdout, /Release gate: ready/);
    const recordedAccess = JSON.parse(readFileSync(accessRecordedPath, 'utf8'));
    assert.equal(recordedAccess.cases[0].observed.sideEffects.accessChanged, true);
    assert.equal(recordedAccess.cases[0].observed.sideEffects.missionStarted, false);
    assert.equal(recordedAccess.cases[0].observed.sideEffects.filesChanged, false);

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
    const bundledSummaryJsonPath = resolve(bundleDir, 'live-canary-summary.json');
    const bundledReadmePath = resolve(bundleDir, 'README.md');
    const bundledCoveragePath = resolve(bundleDir, 'live-canary-coverage.md');
    assert.equal(JSON.parse(readFileSync(bundledObservationsPath, 'utf8')).cases[0].id, 'cp-builder-001');
    assert.match(releaseBundle.stdout, /README:/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /Control-Proof Live Canary Bundle/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /refreshes the current summaries/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /local screenshot file/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /records screenshot files as digest refs/);
    assert.doesNotMatch(readFileSync(bundledReadmePath, 'utf8'), /screenshot path/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /Side-Effect Proof/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /Notes alone are not enough/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /Every record command should prove side effects explicitly/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /For no-action and read-only cases, keep `--no-other-side-effects`/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /--no-other-side-effects/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /selected-case strict check/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /not the full release gate until the complete canary pack is run/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /repo release blocks/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /repo_release_blocks/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /duplicate-truth drift/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /registry_pin_drift/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /local_runtime_test_artifacts/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /gateDecisionDetails/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /control_proof_audit_blocking_gaps/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), new RegExp(`--observations '${escapeRegExp(bundledObservationsPath)}' --strict`));
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /Coverage:/);
    assert.match(readFileSync(bundledReadmePath, 'utf8'), /Current summary JSON:/);
    assert.match(readFileSync(bundledGuidePath, 'utf8'), new RegExp(`--observations '${escapeRegExp(bundledObservationsPath)}' --record-case cp-builder-001`));
    assert.match(readFileSync(bundledGuidePath, 'utf8'), /--record-case cp-builder-001[\s\S]*--no-other-side-effects/);
    assert.match(readFileSync(bundledGuidePath, 'utf8'), new RegExp(`--summary-out '${escapeRegExp(bundledSummaryPath)}'`));
    assert.match(readFileSync(bundledGuidePath, 'utf8'), new RegExp(`--summary-json-out '${escapeRegExp(bundledSummaryJsonPath)}'`));
    assert.match(readFileSync(bundledCoveragePath, 'utf8'), /Cases: 1/);
    assert.match(readFileSync(resolve(bundleDir, 'live-canary-copy-paste.md'), 'utf8'), /Control-Proof Canary Prompts/);
    assert.match(readFileSync(resolve(bundleDir, 'live-canary-checklist.md'), 'utf8'), /Control-Proof Canary Checklist/);
    assert.match(readFileSync(bundledSummaryPath, 'utf8'), /Release gate: not ready/);
    const bundledSummaryJson = JSON.parse(readFileSync(bundledSummaryJsonPath, 'utf8'));
    assert.equal(bundledSummaryJson.summary.totalCases, 1);
    assert.equal(bundledSummaryJson.coverage.totalCases, 1);

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
    assert.equal(JSON.parse(readFileSync(resolve(fullBundleDir, 'live-canary-observations.json'), 'utf8')).cases.length, 28);
    assert.match(readFileSync(resolve(fullBundleDir, 'live-canary-coverage.md'), 'utf8'), /Required category coverage: complete/);
    assert.match(readFileSync(resolve(fullBundleDir, 'README.md'), 'utf8'), /Re-run the release check/);
    assert.match(readFileSync(resolve(fullBundleDir, 'README.md'), 'utf8'), /--release-check/);
    assert.match(readFileSync(resolve(fullBundleDir, 'README.md'), 'utf8'), /For publish or registry claims, run the publish check too:/);
    assert.match(readFileSync(resolve(fullBundleDir, 'README.md'), 'utf8'), /--publish-check/);

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
    const stateRoot = resolve(tempRoot, 'state');
    const outTemplatePath = resolve(tempRoot, 'observations.json');
    mkdirSync(binRoot);
    mkdirSync(stateRoot);
    const repoBoardPath = resolve(stateRoot, 'repo-board.json');
    writeFileSync(repoBoardPath, JSON.stringify({
      repos: [
        {
          repo: 'source',
          path: '/Users/example/.spark/modules/domain-chip-memory/source',
          release_eligibility: 'blocked',
          behind: 6,
          do_not_merge_reason: 'behind upstream',
          next_safe_action: 'pull or merge upstream before release'
        },
        {
          repo: 'spark-world-editor',
          path: '/Users/example/Desktop/spark-world-editor',
          release_eligibility: 'inspect',
          do_not_merge_reason: 'not in installer registry',
          next_safe_action: 'decide whether this repo should remain local, become a capability, or be ignored'
        }
      ],
      duplicate_truths: {
        items: [
          {
            owner_repo: 'spark-telegram-bot',
            severity: 'critical',
            classification: 'runtime_ahead_of_registry_pin',
            next_safe_action: 'Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.',
            evidence_details: {
              installed_head: '5acaeb9e5538',
              registry_commit: 'e5a1bd040986'
            }
          },
          {
            owner_repo: 'spawner-ui',
            severity: 'warning',
            classification: 'runtime_ahead_of_registry_pin',
            next_safe_action: 'Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.'
          }
        ]
      }
    }, null, 2), 'utf8');
    const sparkPath = resolve(binRoot, 'spark');
    const npmPath = resolve(binRoot, 'npm');
    writeFileSync(sparkPath, [
      '#!/bin/sh',
      'if [ "$1 $2" = "live status" ]; then echo "Spark Live healthy"; echo "Relay runtime: OK (primary@8789 pid=86802 polling=active)"; echo "Board: http://127.0.0.1:3333/kanban"; exit 0; fi',
      'if [ "$1 $2 $3" = "providers test --role" ]; then echo "chat provider PING_OK"; exit 0; fi',
      'if [ "$1 $2 $3" = "os compile --json" ]; then cat <<JSON',
      '{',
      "  \"generated_at\": \"$(date -u +\"%Y-%m-%dT%H:%M:%S.000Z\")\",",
      '  "ok": true,',
      '  "gaps": 0,',
      '  "builder_trace_health_flags": ["missing_trace_refs", "historical_open_high_severity_events"],',
      '  "builder_trace_current_health": {',
      '    "status": "current_missing_trace_refs",',
      '    "window": "24h",',
      '    "row_count": 1039,',
      '    "missing_trace_ref_count": 480,',
      '    "historical_missing_trace_ref_count": 12721,',
      '    "total_missing_trace_ref_count": 13201,',
      '    "missing_trace_ref_ratio": 0.462,',
      '    "high_severity_open_count": 46,',
      '    "unresolved_high_severity_open_count": 1,',
      '    "current_unresolved_high_severity_open_count": 0,',
      '    "latest_missing_source_group_count": 2,',
      '    "latest_clean_historical_window_debt_group_count": 1,',
      '    "latest_clean_window_debt_group_count": 1,',
      '    "latest_missing_group_count": 2,',
      '    "latest_clean_group_count": 1,',
      '    "repair_temporal_state_counts": {',
      '      "latest_missing_trace_ref": 2,',
      '      "latest_clean_historical_window_debt": 1',
      '    }',
      '  },',
      '  "duplicate_truths": { "item_count": 2 },',
      '  "repo_board": { "dirty_repo_count": 0, "blocked_release_count": 1, "critical_repo_count": 0, "duplicate_truth_count": 2, "critical_duplicate_truth_count": 1 },',
      '  "gate": { "dirty_repo_count": 0, "broad_dirty_repo_count": 0 },',
      `  "outputs": { "repo_board": ${JSON.stringify(repoBoardPath)} },`,
      '  "privacy": {',
      '    "raw_secret_values_read": false,',
      '    "raw_logs_read": false,',
      '    "raw_conversation_content_read": false,',
      '    "raw_memory_evidence_read": false,',
      '    "sqlite_row_contents_read": false',
      '  }',
      '}',
      'JSON',
      'exit 0; fi',
      'echo "unexpected spark args: $*" >&2',
      'exit 1'
    ].join('\n'), 'utf8');
    writeFileSync(npmPath, [
      '#!/bin/sh',
      'if [ "$1 $2" = "run sync:check" ]; then echo "[check] runtime in sync."; exit 0; fi',
      'if [ "$1 $2" = "run control:proof:audit" ]; then',
      '  case " $* " in *" --fresh-strict "*) ;; *) echo "missing --fresh-strict" >&2; exit 1;; esac',
      '  i=0',
      '  while [ "$i" -lt 80 ]; do echo "audit detail line $i before summary"; i=$((i + 1)); done',
      "  echo \"Generated: $(date -u +\"%Y-%m-%dT%H:%M:%S.000Z\")\"",
      '  echo "Blocking status: clean"',
      '  echo "telegram_route_confidence: 100/100 sampled | proof_gap 97 | gap_capsule 97 | gap_capsule_valid 97 | gap_ref 97 | gap_backing complete | latest_gap no"',
      '  echo "builder_gateway: 100/100 sampled | proof_gap 62 | gap_capsule 62 | gap_capsule_valid 62 | gap_ref 62 | gap_backing complete | latest_gap no"',
      '  echo "spawner_prd_trace: 100/100 sampled | proof_gap 94 | gap_capsule 94 | gap_capsule_valid 94 | gap_ref 94 | gap_backing complete | latest_gap no"',
      '  echo "memory_movement_index: 1/1 sampled | proof 0/1 | proof_n/a 1 | proof_gap 0 | gap_backing n/a | latest_gap no"',
      '  echo "voice_surface_view: 1/1 sampled | proof 0/1 | proof_n/a 1 | proof_gap 0 | gap_backing n/a | latest_gap no"',
      '  echo "voice_runtime_state: 1/1 sampled | proof 0/1 | proof_n/a 1 | proof_gap 0 | gap_backing n/a | latest_gap no"',
      '  echo "Gap counts:"',
      '  echo "- missing evidence: 0"',
      '  echo "- missing trace joins: 0"',
      '  echo "- missing proof capsules: 0"',
      '  echo "- legacy proof gaps: 3"',
      '  echo "- incomplete legacy gap backing: 0"',
      '  echo "- latest proof gaps: 0"',
      '  echo "- raw ref leaks: 0"',
      '  echo "- robotic failure reasons: 0"',
      '  echo "- stack-like leaks: 0"',
      '  echo "Gap planes:"',
      '  echo "- legacy proof gaps: telegram_route_confidence, builder_gateway, spawner_prd_trace"',
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
    assert.match(observed.evidence.controlProofAudit, /gap_capsule_valid 97/);
    assert.match(observed.evidence.controlProofAudit, /voice_runtime_state: 1\/1 sampled .*proof_n\/a 1/);
    assert.match(observed.evidence.controlProofAudit, /incomplete legacy gap backing: 0/);
    assert.match(observed.evidence.controlProofAudit, /Gap planes:/);
    assert.match(observed.evidence.controlProofAudit, /legacy proof gaps: telegram_route_confidence, builder_gateway, spawner_prd_trace/);
    assert.doesNotMatch(observed.evidence.controlProofAudit, /\n\.\.\.\n/);
    assert.match(observed.evidence.sparkOsCompile, /"ok": true/);
    assert.match(observed.evidence.sparkOsCompile, /"gaps": 0/);
    assert.match(observed.evidence.sparkOsCompile, /historical_open_high_severity_events/);
    assert.match(observed.evidence.sparkOsCompile, /historical_missing_trace_ref_count/);
    assert.match(observed.evidence.sparkOsCompile, /unresolved_high_severity_open_count/);
    assert.match(observed.evidence.sparkOsCompile, /current_unresolved_high_severity_open_count/);
    assert.match(observed.evidence.sparkOsCompile, /latest_missing_source_group_count/);
    assert.match(observed.evidence.sparkOsCompile, /latest_clean_historical_window_debt_group_count/);
    assert.match(observed.evidence.sparkOsCompile, /latest_clean_window_debt_group_count/);
    assert.match(observed.evidence.sparkOsCompile, /"duplicate_truth_count": 2/);
    assert.match(observed.evidence.sparkOsCompile, /"repo_board": "<tmp>"/);
    assert.doesNotMatch(observed.evidence.sparkOsCompile, /<redacted-token>/);
    assert.doesNotMatch(observed.evidence.sparkOsCompile, /\n\.\.\.\n/);
    assert.match(observed.evidence.sparkLiveStatus, /primary@<redacted-port> pid=<redacted-pid>/);
    assert.match(observed.evidence.sparkLiveStatus, /Board: <local-url>\/kanban/);
    assert.match(observed.evidence.notes, /Refresh after Spark restarts or proof-audit changes/);
    assert.match(observed.evidence.notes, /Repo release-block handoff:/);
    assert.match(observed.evidence.notes, /domain-chip-memory: release_blocked repo_release_blocks; reason: behind upstream; behind=6; next safe action: pull or merge upstream before release/);
    assert.doesNotMatch(observed.evidence.notes, /spark-world-editor: release_blocked/);
    assert.match(observed.evidence.notes, /Duplicate-truth handoff:/);
    assert.match(observed.evidence.notes, /spark-telegram-bot: critical runtime_ahead_of_registry_pin/);
    assert.match(observed.evidence.notes, /spawner-ui: warning runtime_ahead_of_registry_pin/);
    assert.match(observed.evidence.notes, /next safe action: Port and push the owner repo commit/);
    assert.doesNotMatch(observed.evidence.notes, /before live Telegram observation/);
    assert.doesNotMatch(observed.evidence.notes, new RegExp(escapeRegExp(repoBoardPath)));
    assert.doesNotMatch(observed.evidence.notes, /\/Users\/example/);
    assert.doesNotMatch(observed.evidence.notes, /5acaeb9e5538|e5a1bd040986/);
    assert.doesNotMatch(observed.evidence.sparkLiveStatus, /primary@8789|pid=86802|127\.0\.0\.1:3333/);
    const observedSummary = summarizeControlProofCanaryObservations(observed, { now: observed.evidence.collectedAt });
    assert.ok(observedSummary.releaseHandoffs.includes('domain-chip-memory: release_blocked repo_release_blocks; reason: behind upstream; behind=6; next safe action: pull or merge upstream before release'));
    assert.ok(observedSummary.releaseHandoffs.includes('spark-telegram-bot: critical runtime_ahead_of_registry_pin; next safe action: Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.'));

    const staleObservations = buildControlProofCanaryObservationTemplate([
      CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
    ], { generatedAt: '2026-06-24T00:00:00.000Z' });
    staleObservations.evidence.controlProofAudit = 'old audit without current gap plane details';
    staleObservations.cases[0].observed.reply = 'preserve this recorded reply';
    const stalePath = resolve(tempRoot, 'stale-observations.json');
    const refreshedPath = resolve(tempRoot, 'refreshed-observations.json');
    writeFileSync(stalePath, JSON.stringify(staleObservations, null, 2), 'utf8');
    const refreshed = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        stalePath,
        '--out',
        refreshedPath,
        '--refresh-runtime-evidence'
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${binRoot}:${process.env.PATH || ''}` }
      }
    );
    assert.equal(refreshed.status, 0, refreshed.stderr);
    assert.match(refreshed.stdout, /Refreshed control-proof runtime evidence/);
    const refreshedObserved = JSON.parse(readFileSync(refreshedPath, 'utf8'));
    assert.match(refreshedObserved.evidence.controlProofAudit, /Blocking status: clean/);
    assert.match(refreshedObserved.evidence.sparkOsCompile, /"ok": true/);
    assert.doesNotMatch(refreshedObserved.evidence.controlProofAudit, /old audit/);
    assert.equal(refreshedObserved.generatedAt, refreshedObserved.evidence.collectedAt);
    assert.equal(refreshedObserved.cases[0].observed.reply, 'preserve this recorded reply');

    const bundleDir = resolve(tempRoot, 'bundle-refresh');
    mkdirSync(bundleDir);
    const bundleObservationsPath = resolve(bundleDir, 'live-canary-observations.json');
    const bundleSummaryPath = resolve(bundleDir, 'live-canary-summary.md');
    const bundleSummaryJsonPath = resolve(bundleDir, 'live-canary-summary.json');
    writeFileSync(bundleObservationsPath, JSON.stringify(staleObservations, null, 2), 'utf8');
    writeFileSync(bundleSummaryPath, 'stale markdown summary', 'utf8');
    writeFileSync(bundleSummaryJsonPath, '{"stale":true}\n', 'utf8');
    const refreshedBundle = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/controlProofLiveCanaryPack.ts',
        '--observations',
        bundleObservationsPath,
        '--refresh-runtime-evidence'
      ],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${binRoot}:${process.env.PATH || ''}` }
      }
    );
    assert.equal(refreshedBundle.status, 0, refreshedBundle.stderr);
    assert.match(refreshedBundle.stdout, /Wrote control-proof observation summary:/);
    assert.match(refreshedBundle.stdout, /Wrote control-proof observation summary JSON:/);
    assert.doesNotMatch(readFileSync(bundleSummaryPath, 'utf8'), /stale markdown/);
    const refreshedBundleSummaryJson = JSON.parse(readFileSync(bundleSummaryJsonPath, 'utf8'));
    const refreshedBundleObserved = JSON.parse(readFileSync(bundleObservationsPath, 'utf8'));
    assert.equal(refreshedBundleObserved.generatedAt, refreshedBundleObserved.evidence.collectedAt);
    assert.equal(refreshedBundleSummaryJson.summary.generatedAt, refreshedBundleObserved.evidence.collectedAt);
    assert.equal(refreshedBundleSummaryJson.summary.runtimeEvidenceCollectedAt, refreshedBundleObserved.evidence.collectedAt);
    assert.equal(refreshedBundleSummaryJson.summary.runtimeEvidenceMaxAgeHours, 1);
    assert.equal(refreshedBundleSummaryJson.coverage.totalCases, 1);

    observed.cases[0].observed = {
      ...observed.cases[0].observed,
      verdict: 'pass',
      reply: 'Route confidence means Spark is justified in taking this route now.',
      sideEffects: {
        ...observed.cases[0].observed.sideEffects,
        filesChanged: false,
        memoryWritten: false,
        missionStarted: false,
        externalNetworkCalled: false,
        accessChanged: false,
        providerChanged: false,
        mediaHandled: false,
        notes: 'No mutation observed.'
      },
      proofJoin: 'Builder joined.',
      proofPanel: CLEAN_PROOF_PANEL,
      screenshotRefs: [STABLE_SCREENSHOT_REF],
      userConfirmation: 'Confirmed in SparkRecursive_bot.'
    };
    const summary = summarizeControlProofCanaryObservations(observed);
    assert.equal(summary.readyForRelease, true);
    assert.equal(summary.readyForPublish, false);
    assert.deepEqual(summary.invalidPacketEvidence, []);
    assert.deepEqual(summary.releaseHandoffs, [
      'spark-intelligence-builder: warning builder_trace_health; next safe action: Repair or replay 2 latest-missing Builder trace source groups, then rerun spark os compile and the canary release-check.',
      'domain-chip-memory: release_blocked repo_release_blocks; reason: behind upstream; behind=6; next safe action: pull or merge upstream before release',
      'spark-telegram-bot: critical runtime_ahead_of_registry_pin; next safe action: Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.',
      'spawner-ui: warning runtime_ahead_of_registry_pin; next safe action: Port and push the owner repo commit, update registry/release metadata, or explicitly keep this installed source classified as a local runtime test artifact.'
    ]);
    assert.match(formatControlProofCanaryObservationSummary(summary), /Release handoffs:\n- spark-intelligence-builder: warning builder_trace_health/);
    assert.match(formatControlProofCanaryObservationSummary(summary), /Repair or replay 2 latest-missing Builder trace source groups/);
    assert.match(formatControlProofCanaryObservationSummary(summary), /spark-telegram-bot: critical runtime_ahead_of_registry_pin/);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('runtime evidence collection gives os compile a release-proof timeout budget', () => {
  const cliSource = readFileSync(resolve(ROOT, 'ops/controlProofLiveCanaryPack.ts'), 'utf8');
  const match = cliSource.match(/label:\s*'spark_os_compile'[\s\S]*?timeoutMs:\s*(\d[\d_]*)/);
  assert.ok(match, 'spark_os_compile runtime evidence command should set an explicit timeout');
  assert.ok(Number(match[1].replaceAll('_', '')) >= 600_000, 'spark_os_compile timeout should allow slow release proof collection');
});
