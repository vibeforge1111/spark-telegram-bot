import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  CONTROL_PROOF_LIVE_CANARY_CASES,
  buildControlProofCanaryObservationTemplate,
  formatControlProofCanaryObservationSummary,
  formatControlProofCanaryChecklist,
  formatControlProofCanaryCopyPaste,
  selectControlProofCanaryCases,
  summarizeControlProofCanaryObservations,
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

test('observation template records expected fields and empty live observations', () => {
  const template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });

  assert.equal(template.target, 'SparkRecursive_bot');
  assert.equal(template.generatedAt, '2026-06-24T00:00:00.000Z');
  assert.deepEqual(template.verdictValues, ['pass', 'fail', 'blocked', 'needs-retest', 'untested']);
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
  const template = buildControlProofCanaryObservationTemplate([
    CONTROL_PROOF_LIVE_CANARY_CASES.find((entry) => entry.id === 'cp-builder-001')!
  ], { generatedAt: '2026-06-24T00:00:00.000Z' });
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
    proofPanel: 'Harness Proof: Builder joined.',
    screenshotRefs: ['/tmp/spark-recursive-builder.png'],
    userConfirmation: 'User confirmed Telegram reply rendered once.'
  };

  const summary = summarizeControlProofCanaryObservations(template);
  assert.equal(summary.readyForRelease, true);
  assert.equal(summary.verdictCounts.pass, 1);
  assert.deepEqual(summary.cases[0].missingCaptures, []);
  assert.match(formatControlProofCanaryObservationSummary(summary), /Release gate: ready/);

  template.cases[0].observed.screenshotRefs = [];
  const missing = summarizeControlProofCanaryObservations(template);
  assert.equal(missing.readyForRelease, false);
  assert.deepEqual(missing.cases[0].missingCaptures, ['screenshot']);
  assert.match(formatControlProofCanaryObservationSummary(missing), /missing screenshot/);
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
      proofPanel: 'Harness Proof: Builder joined.',
      screenshotRefs: ['/tmp/spark-recursive-builder.png'],
      userConfirmation: 'Confirmed.'
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
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
