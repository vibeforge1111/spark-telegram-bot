import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  buildObservedLiveNlEvidencePacket,
  buildLiveNlEvidencePacket,
  buildLiveNlObservationTemplate,
  deriveLiveNlHarnessCoreMapping,
  formatLiveNlHarnessCoreMap,
  formatLiveNlCopyPastePrompts,
  formatLiveNlVerdictReport,
  liveNlCaseTurns,
  parseLiveNlCommandCases,
  parseLiveNlObservationFile,
  selectLiveNlCommandCases
} from '../src/liveNlVerdict';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const cases = parseLiveNlCommandCases([
  {
    id: 'safe-001',
    suite: 'memory',
    risk: 'safe',
    prompt: 'remember this: concise replies',
    expectedRoute: 'memory_directive',
    expectedOutcome: 'Saves the preference.'
  },
  {
    id: 'mission-001',
    suite: 'mission',
    risk: 'mission',
    prompt: '/run say OK',
    expectedRoute: 'slash_run',
    expectedOutcome: 'Starts a mission.'
  },
  {
    id: 'wiki-001',
    suite: 'wiki',
    risk: 'safe',
    prompt: 'what pages are in your LLM wiki?',
    expectedRoute: 'natural_wiki_inventory',
    expectedOutcome: 'Lists wiki pages.'
  }
]);

const ROOT = resolve(__dirname, '..');

test('selects only safe live NL cases by default', () => {
  const selected = selectLiveNlCommandCases(cases);

  assert.deepEqual(selected.map((entry) => entry.id), ['safe-001', 'wiki-001']);
});

test('keeps explicit risky case selection available', () => {
  const selected = selectLiveNlCommandCases(cases, { caseId: 'mission-001' });

  assert.deepEqual(selected.map((entry) => entry.id), ['mission-001']);
});

test('keeps explicit multi-case selection available', () => {
  const selected = selectLiveNlCommandCases(cases, { caseIds: ['mission-001', 'wiki-001'] });

  assert.deepEqual(selected.map((entry) => entry.id), ['mission-001', 'wiki-001']);
});

test('keeps explicit multi-case selection in requested order', () => {
  const selected = selectLiveNlCommandCases(cases, { caseIds: ['wiki-001', 'safe-001'] });

  assert.deepEqual(selected.map((entry) => entry.id), ['wiki-001', 'safe-001']);
});

test('derives Harness Core mutation and authority fields from legacy NL cases', () => {
  const [memoryCase, accessCase, missionCase, noActionCase] = parseLiveNlCommandCases([
    {
      id: 'memory-safe-001',
      suite: 'memory',
      risk: 'safe',
      prompt: 'remember this: concise replies',
      expectedRoute: 'memory_directive',
      expectedOutcome: 'Saves the preference.'
    },
    {
      id: 'access-safe-001',
      suite: 'access',
      risk: 'safe',
      prompt: '/access 3',
      expectedRoute: 'slash_access',
      expectedOutcome: 'Sets agent access.'
    },
    {
      id: 'mission-legacy-001',
      suite: 'mission',
      risk: 'mission',
      prompt: '/run say OK',
      expectedRoute: 'slash_run',
      expectedOutcome: 'Starts a mission.'
    },
    {
      id: 'no-action-001',
      suite: 'guardrails',
      risk: 'safe',
      prompt: 'I am mentioning build and mission, but do not start anything.',
      expectedRoute: 'conversation',
      expectedOutcome: 'Explains without launching work. Must not save this as memory.'
    }
  ]);

  assert.deepEqual(
    {
      mutation: deriveLiveNlHarnessCoreMapping(memoryCase).expectedMutationClass,
      authority: deriveLiveNlHarnessCoreMapping(memoryCase).expectedAuthority,
      use: deriveLiveNlHarnessCoreMapping(memoryCase).recommendedUse
    },
    {
      mutation: 'writes_memory',
      authority: 'confirmation_required_or_allowed',
      use: 'run_only_with_intentional_action_confirmation'
    }
  );
  assert.equal(deriveLiveNlHarnessCoreMapping(accessCase).expectedMutationClass, 'updates_access_setting');
  assert.equal(deriveLiveNlHarnessCoreMapping(missionCase).expectedMutationClass, 'launches_mission');
  assert.equal(deriveLiveNlHarnessCoreMapping(noActionCase).expectedMutationClass, 'none');
  assert.equal(deriveLiveNlHarnessCoreMapping(noActionCase).expectedAuthority, 'blocked_without_authority');
  assert.equal(deriveLiveNlHarnessCoreMapping(noActionCase).recommendedUse, 'promote_after_refurbish');
});

test('formats a Harness Core map without claiming release proof', () => {
  const report = formatLiveNlHarnessCoreMap([cases[0], cases[1]], {
    catalog: 'fixture-live-catalog.json',
    title: 'Fixture Harness Map'
  });

  assert.match(report, /# Fixture Harness Map/);
  assert.match(report, /Catalog: fixture-live-catalog\.json/);
  assert.match(report, /Do not treat this map or a passing `nl:live` run as Harness Core release proof/);
  assert.match(report, /\| safe-001 \| memory \| safe \| writes_memory \| confirmation_required_or_allowed \| run_only_with_intentional_action_confirmation \| yes \|/);
  assert.match(report, /\| mission-001 \| mission \| mission \| launches_mission \| confirmation_required_or_allowed \| run_only_with_intentional_action_confirmation \| yes \|/);
});

test('expands suite aliases for verdict reports', () => {
  const selected = selectLiveNlCommandCases(cases, { suite: 'memory_architecture' });

  assert.deepEqual(selected.map((entry) => entry.id), ['safe-001', 'wiki-001']);
});

test('formats a human-scored verdict worksheet', () => {
  const report = formatLiveNlVerdictReport([cases[0]], {
    generatedAt: new Date('2026-05-09T00:00:00.000Z'),
    suite: 'memory'
  });

  assert.match(report, /Generated: 2026-05-09T00:00:00\.000Z/);
  assert.match(report, /Verdict values: pass, fail, blocked, needs-retest, untested/);
  assert.match(report, /- Verdict: untested/);
  assert.match(report, /- Actual route:/);
  assert.match(report, /remember this: concise replies/);
  assert.doesNotMatch(report, /BOT_TOKEN|TELEGRAM_BOT_TOKEN/i);
});

test('formats copy-paste prompts without leaking route expectations into Telegram text', () => {
  const promptSheet = formatLiveNlCopyPastePrompts([cases[0]], { title: 'Manual Smoke' });

  assert.match(promptSheet, /# Manual Smoke/);
  assert.match(promptSheet, /Copy only each Telegram message into Telegram/);
  assert.match(promptSheet, /```text\nremember this: concise replies\n```/);
  assert.match(promptSheet, /CASE safe-001/);
  assert.match(promptSheet, /<paste Spark reply here>/);
  assert.doesNotMatch(promptSheet, /Expected route|Expected outcome|memory_directive|Saves the preference/);
});

test('formats multi-turn live probes as sequential copy-paste messages', () => {
  const [entry] = parseLiveNlCommandCases([
    {
      id: 'context-001',
      suite: 'context_window',
      risk: 'safe',
      turns: ['shape a tiny route-confidence harness but do not build yet', 'run it'],
      expectedRoute: 'plain_chat',
      expectedOutcome: 'Uses the prior turn without launching an unrelated system.'
    }
  ]);
  const promptSheet = formatLiveNlCopyPastePrompts([entry], { title: 'Multi Turn Smoke' });
  const report = formatLiveNlVerdictReport([entry], {
    generatedAt: new Date('2026-05-09T00:00:00.000Z')
  });

  assert.deepEqual(liveNlCaseTurns(entry), [
    'shape a tiny route-confidence harness but do not build yet',
    'run it'
  ]);
  assert.match(promptSheet, /Telegram message 1 of 2/);
  assert.match(promptSheet, /CASE context-001 TURN 2/);
  assert.match(report, /Prompts:/);
  assert.match(report, /Turn 2:\n\s+run it/);
  assert.doesNotMatch(promptSheet, /plain_chat|Uses the prior turn/);
});

test('live command copy-paste output keeps metadata out of Telegram blocks', () => {
  const actualCases = parseLiveNlCommandCases(JSON.parse(readFileSync(resolve(__dirname, '../ops/natural-language-live-commands.json'), 'utf8')));
  const selected = selectLiveNlCommandCases(actualCases, { caseIds: ['guard-006', 'guard-007', 'build-004', 'domain-chip-003'] });
  const promptSheet = formatLiveNlCopyPastePrompts(selected);

  assert.equal(selected.length, 4);
  assert.deepEqual(selected.map((entry) => entry.id), ['guard-006', 'guard-007', 'build-004', 'domain-chip-003']);
  assert.match(promptSheet, /1\. guard-006[\s\S]+all Spark agents should ask clarifying questions before missions/);
  assert.match(promptSheet, /2\. guard-007[\s\S]+make all Spark systems understand workflow context more conversationally/);
  assert.match(promptSheet, /3\. build-004[\s\S]+please help me design a project called Relay Workshop/);
  assert.match(promptSheet, /4\. domain-chip-003[\s\S]+do not build yet, help me think through a domain chip/);
  assert.doesNotMatch(promptSheet, /global_doctrine_blocked|conversation_ideation|Expected route|Expected outcome/);
});

test('rejects malformed command cases', () => {
  assert.throws(
    () => parseLiveNlCommandCases([{ id: 'bad', suite: 'memory', risk: 'danger', prompt: 'x', expectedRoute: 'x', expectedOutcome: 'x' }]),
    /unsupported risk/
  );
});

test('actual live command catalog keeps route-boundary prompt cards', () => {
  const catalogPath = resolve(__dirname, '../ops/natural-language-live-commands.json');
  const actualCases = parseLiveNlCommandCases(JSON.parse(readFileSync(catalogPath, 'utf8')));
  const ids = actualCases.map((entry) => entry.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.ok(actualCases.length >= 63);
  assert.ok(ids.includes('memory-002'));
  assert.ok(ids.includes('guard-006'));
  assert.ok(ids.includes('guard-007'));
  assert.ok(ids.includes('domain-chip-003'));
  assert.deepEqual(
    selectLiveNlCommandCases(actualCases, { suite: 'domain_chip' }).map((entry) => entry.id),
    ['domain-chip-001', 'domain-chip-002', 'domain-chip-003']
  );
});

test('Genesis live Telegram catalog contains exactly 100 ordered QA prompts', () => {
  const catalogPath = resolve(__dirname, '../ops/genesis-live-telegram-100.json');
  const actualCases = parseLiveNlCommandCases(JSON.parse(readFileSync(catalogPath, 'utf8')));
  const ids = actualCases.map((entry) => entry.id);
  const riskCounts = actualCases.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.risk] = (counts[entry.risk] || 0) + 1;
    return counts;
  }, {});

  assert.equal(actualCases.length, 100);
  assert.equal(new Set(ids).size, 100);
  assert.equal(ids[0], 'genesis-001');
  assert.equal(ids[99], 'genesis-100');
  assert.deepEqual(riskCounts, { safe: 90, mission: 6, external: 3, writes_files: 1 });
  assert.deepEqual(
    Array.from(new Set(actualCases.map((entry) => entry.suite))),
    [
      'genesis_normal_conversation',
      'genesis_meta_quoted_words',
      'genesis_no_action',
      'genesis_read_only',
      'genesis_memory',
      'genesis_startup',
      'genesis_spawner_builder_cli',
      'genesis_publish_schedule_chips',
      'genesis_voice_media_browser',
      'genesis_stale_recursive_swarm'
    ]
  );
});

test('Genesis live Telegram catalog selection keeps risky actions explicit', () => {
  const catalogPath = resolve(__dirname, '../ops/genesis-live-telegram-100.json');
  const actualCases = parseLiveNlCommandCases(JSON.parse(readFileSync(catalogPath, 'utf8')));

  assert.equal(selectLiveNlCommandCases(actualCases).length, 90);
  assert.equal(selectLiveNlCommandCases(actualCases, { includeRisky: true }).length, 100);
  assert.deepEqual(
    selectLiveNlCommandCases(actualCases, { suite: 'genesis_memory' }).map((entry) => entry.id),
    [
      'genesis-041',
      'genesis-042',
      'genesis-043',
      'genesis-044',
      'genesis-045',
      'genesis-046',
      'genesis-047',
      'genesis-048',
      'genesis-049',
      'genesis-050'
    ]
  );
});

test('Genesis live Telegram prompt sheet hides route expectations', () => {
  const catalogPath = resolve(__dirname, '../ops/genesis-live-telegram-100.json');
  const actualCases = parseLiveNlCommandCases(JSON.parse(readFileSync(catalogPath, 'utf8')));
  const selected = selectLiveNlCommandCases(actualCases, { caseIds: ['genesis-011', 'genesis-061', 'genesis-100'] });
  const promptSheet = formatLiveNlCopyPastePrompts(selected, { title: 'Genesis Harness Live QA' });

  assert.match(promptSheet, /# Genesis Harness Live QA/);
  assert.match(promptSheet, /The phrase "build a mission and publish it" is an example from a bug report\./);
  assert.match(promptSheet, /Run a tiny no-edit Spawner mission that replies SPARK_SPAWNER_NO_EDIT_OK\./);
  assert.match(promptSheet, /Run the final no-edit Genesis Harness smoke that only replies SPARK_GENESIS_NO_EDIT_OK\./);
  assert.doesNotMatch(promptSheet, /Expected route|Expected outcome|execute_action_launch_mission|chat_debug_reasoning/);
});

test('Genesis live Telegram evidence packet is a structured untested run container', () => {
  const catalogPath = resolve(__dirname, '../ops/genesis-live-telegram-100.json');
  const actualCases = parseLiveNlCommandCases(JSON.parse(readFileSync(catalogPath, 'utf8')));
  const selected = selectLiveNlCommandCases(actualCases, { includeRisky: true });
  const packet = buildLiveNlEvidencePacket(selected, {
    generatedAt: new Date('2026-06-02T00:00:00.000Z'),
    catalog: 'genesis-live-telegram-100.json',
    includeRisky: true,
    title: 'Spark Genesis Telegram Live QA Evidence Packet'
  }) as {
    schema_version: string;
    selection: { case_count: number; risk_counts: Record<string, number>; include_risky: boolean };
    required_session_evidence: Record<string, unknown>;
    authority_claim_boundary: string;
    cases: Array<{
      id: string;
      expected_route: string;
      verdict: string;
      observed_turns: Array<{ prompt: string; reply: string | null }>;
      side_effects: Record<string, unknown>;
      evidence_refs: Record<string, unknown[]>;
    }>;
    summary: Record<string, number>;
  };

  assert.equal(packet.schema_version, 'spark.telegram_live_qa_evidence_packet.v1');
  assert.equal(packet.selection.case_count, 100);
  assert.equal(packet.selection.include_risky, true);
  assert.deepEqual(packet.selection.risk_counts, { safe: 90, mission: 6, writes_files: 1, external: 3 });
  assert.equal(packet.summary.untested, 100);
  assert.equal(packet.cases[0].id, 'genesis-001');
  assert.equal(packet.cases[0].verdict, 'untested');
  assert.equal(packet.cases[0].observed_turns[0].reply, null);
  assert.equal(packet.cases[99].id, 'genesis-100');
  assert.equal(packet.cases[99].expected_route, 'execute_action_launch_mission');
  assert.deepEqual(packet.cases[99].evidence_refs.authorization_ledgers, []);
  assert.equal(packet.cases[99].side_effects.mission_started, null);
  assert.equal(packet.required_session_evidence.overall_verdict, 'untested');
  assert.match(packet.authority_claim_boundary, /does not prove release readiness/);
});

test('Genesis live Telegram observation template hides scoring expectations', () => {
  const catalogPath = resolve(__dirname, '../ops/genesis-live-telegram-100.json');
  const actualCases = parseLiveNlCommandCases(JSON.parse(readFileSync(catalogPath, 'utf8')));
  const selected = selectLiveNlCommandCases(actualCases, { caseIds: ['genesis-002', 'genesis-010'] });
  const template = buildLiveNlObservationTemplate(selected, {
    generatedAt: new Date('2026-06-02T00:00:00.000Z'),
    title: 'Spark Genesis Telegram Live QA Observation Template'
  });
  const serialized = JSON.stringify(template);

  assert.equal(template.generatedAt, '2026-06-02T00:00:00.000Z');
  assert.equal(template.title, 'Spark Genesis Telegram Live QA Observation Template');
  assert.equal(template.cases.length, 2);
  assert.equal(template.cases[0].id, 'genesis-002');
  assert.equal(template.cases[0].verdict, 'untested');
  assert.equal(template.cases[0].actualRoute, null);
  assert.equal(template.cases[0].observedTurns?.[0].prompt, selected[0].prompt);
  assert.equal(template.cases[0].observedTurns?.[0].reply, null);
  assert.equal(template.cases[0].sideEffects?.mission_started, null);
  assert.deepEqual(template.cases[0].evidenceRefs?.screenshots, []);
  assert.doesNotMatch(serialized, /expectedRoute|expected_route|expectedOutcome|expected_outcome/);
  assert.doesNotMatch(serialized, /chat_plan|chat_draft_text/);

  const parsed = parseLiveNlObservationFile(template);
  assert.deepEqual(parsed.cases.map((entry) => entry.id), ['genesis-002', 'genesis-010']);
});

test('observed live QA packet imports replies, side effects, evidence refs, and session evidence', () => {
  const observations = parseLiveNlObservationFile({
    generatedAt: '2026-06-02T09:30:00.000Z',
    runId: 'telegram-live-qa-fixture',
    session: {
      profile: 'sparkqa-bot',
      tester: 'codex',
      bot_runtime_commit: '167b640',
      harness_core_commit: '0971b52',
      spark_os_compile_ref: '/tmp/spark-os-compile.json',
      spark_live_status_ref: '/tmp/spark-live-status.json',
      spark_verify_provenance_ref: '/tmp/spark-verify.json',
      telegram_chat_evidence_ref: '/tmp/telegram.png',
      follow_up_commits: ['167b640'],
      pr_links: [],
      remaining_risks: ['full 100-case run still incomplete']
    },
    cases: [
      {
        id: 'safe-001',
        verdict: 'pass',
        actualRoute: 'execute_action_write_memory',
        actualOutcome: 'Saved the concise reply preference with memory authority.',
        observedTurns: [{ turnIndex: 1, reply: 'Saved that preference.', replyTimestamp: '2026-06-02T09:31:00Z' }],
        sideEffects: { memoryWritten: true, missionStarted: false, filesChanged: false },
        evidenceRefs: {
          authorizationLedgers: ['ledger:memory-safe-001'],
          screenshots: ['/tmp/safe-001.png'],
          runtimeStatus: ['/tmp/live-status.json']
        }
      },
      {
        id: 'wiki-001',
        verdict: 'fail',
        actual_route: 'chat_only',
        actual_outcome: 'Answered generically instead of listing pages.',
        replies: ['I can help with that, but I did not inspect the wiki.'],
        side_effects: { memory_written: false, mission_started: false },
        evidence_refs: { traces: ['trace:wiki-001'] },
        issue: 'Missed read-only wiki inventory route.',
        retest_required: true
      }
    ]
  });
  const packet = buildObservedLiveNlEvidencePacket(cases, observations, {
    catalog: 'fixture-live-catalog.json',
    includeRisky: true,
    title: 'Fixture Observed Packet'
  });

  assert.equal(packet.generated_at, '2026-06-02T09:30:00.000Z');
  assert.equal(packet.run_id, 'telegram-live-qa-fixture');
  assert.equal(packet.summary.pass, 1);
  assert.equal(packet.summary.fail, 1);
  assert.equal(packet.summary.untested, 1);
  assert.equal(packet.required_session_evidence.profile, 'sparkqa-bot');
  assert.equal(packet.required_session_evidence.overall_verdict, 'fail');
  assert.deepEqual(packet.required_session_evidence.remaining_risks, ['full 100-case run still incomplete']);

  const safeCase = packet.cases.find((entry) => entry.id === 'safe-001');
  assert.ok(safeCase);
  assert.equal(safeCase.verdict, 'pass');
  assert.equal(safeCase.actual_route, 'execute_action_write_memory');
  assert.equal(safeCase.observed_turns[0].reply, 'Saved that preference.');
  assert.equal(safeCase.side_effects.memory_written, true);
  assert.equal(safeCase.side_effects.mission_started, false);
  assert.deepEqual(safeCase.evidence_refs.authorization_ledgers, ['ledger:memory-safe-001']);
  assert.deepEqual(safeCase.evidence_refs.screenshots, ['/tmp/safe-001.png']);

  const wikiCase = packet.cases.find((entry) => entry.id === 'wiki-001');
  assert.ok(wikiCase);
  assert.equal(wikiCase.verdict, 'fail');
  assert.equal(wikiCase.retest_required, true);
  assert.equal(wikiCase.issue, 'Missed read-only wiki inventory route.');
  assert.deepEqual(wikiCase.evidence_refs.traces, ['trace:wiki-001']);
});

test('observed live QA packet rejects unknown observation case ids', () => {
  const observations = parseLiveNlObservationFile({
    cases: [{ id: 'missing-001', verdict: 'pass', replies: ['ok'] }]
  });

  assert.throws(
    () => buildObservedLiveNlEvidencePacket(cases, observations, { catalog: 'fixture-live-catalog.json' }),
    /unknown case missing-001/
  );
});

test('live NL CLI loads the Genesis 100-prompt catalog by name', () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
      'ops/liveNlCommandSuite.ts',
      '--catalog',
      'genesis100',
      '--list',
      '--include-risky'
    ],
    {
      cwd: ROOT,
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 100);
  assert.match(lines[0], /^genesis-001\tgenesis_normal_conversation\tsafe\tchat_think_with_me$/);
  assert.match(lines[99], /^genesis-100\tgenesis_stale_recursive_swarm\tmission\texecute_action_launch_mission$/);
});

test('live NL CLI emits Harness Core refurbishment map for selected legacy cases', () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
      'ops/liveNlCommandSuite.ts',
      '--harness-map',
      '--cases',
      'memory-001,access-002,mission-001'
    ],
    {
      cwd: ROOT,
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /# Natural Language Harness Core Map/);
  assert.match(result.stdout, /\| memory-001 \| memory \| safe \| writes_memory \| confirmation_required_or_allowed \| run_only_with_intentional_action_confirmation \| yes \|/);
  assert.match(result.stdout, /\| access-002 \| access \| safe \| updates_access_setting \| confirmation_required_or_allowed \| run_only_with_intentional_action_confirmation \| yes \|/);
  assert.match(result.stdout, /\| mission-001 \| mission \| mission \| launches_mission \| confirmation_required_or_allowed \| run_only_with_intentional_action_confirmation \| yes \|/);
});

test('live NL verdict CLI emits a Genesis evidence packet', () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
      'ops/liveNlVerdictReport.ts',
      '--catalog',
      'genesis100',
      '--stdout',
      '--json',
      '--include-risky'
    ],
    {
      cwd: ROOT,
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const packet = JSON.parse(result.stdout);
  assert.equal(packet.schema_version, 'spark.telegram_live_qa_evidence_packet.v1');
  assert.equal(packet.catalog, 'genesis-live-telegram-100.json');
  assert.equal(packet.selection.case_count, 100);
  assert.equal(packet.summary.untested, 100);
  assert.equal(packet.cases[0].id, 'genesis-001');
  assert.equal(packet.cases[99].id, 'genesis-100');
});

test('live NL verdict CLI emits a Genesis observation template', () => {
  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
      'ops/liveNlVerdictReport.ts',
      '--catalog',
      'genesis100',
      '--case',
      'genesis-002',
      '--stdout',
      '--observation-template'
    ],
    {
      cwd: ROOT,
      encoding: 'utf8'
    }
  );

  assert.equal(result.status, 0, result.stderr);
  const template = JSON.parse(result.stdout);
  const serialized = JSON.stringify(template);
  assert.equal(template.title, 'Spark Genesis Telegram Live QA Observation Template');
  assert.equal(template.cases.length, 1);
  assert.equal(template.cases[0].id, 'genesis-002');
  assert.equal(template.cases[0].verdict, 'untested');
  assert.equal(template.cases[0].observedTurns[0].reply, null);
  assert.equal(template.cases[0].sideEffects.mission_started, null);
  assert.deepEqual(template.cases[0].evidenceRefs.screenshots, []);
  assert.doesNotMatch(serialized, /expectedRoute|expected_route|expectedOutcome|expected_outcome/);
});

test('live NL verdict CLI emits an observed Genesis evidence packet from observations', () => {
  const tempDir = mkdtempSync(resolve(tmpdir(), 'spark-live-nl-observations-'));
  const observationsPath = resolve(tempDir, 'observations.json');
  try {
    writeFileSync(
      observationsPath,
      JSON.stringify({
        generatedAt: '2026-06-02T09:35:00.000Z',
        runId: 'telegram-live-qa-cli-fixture',
        session: {
          profile: 'sparkqa-bot',
          tester: 'codex',
          bot_runtime_commit: '167b640',
          harness_core_commit: '0971b52',
          overall_verdict: 'pass'
        },
        cases: [
          {
            id: 'genesis-001',
            verdict: 'pass',
            actualRoute: 'chat_think_with_me',
            actualOutcome: 'Answered conversationally and did not launch anything.',
            replies: ['Yes, use it when you have a concrete startup proof target.'],
            sideEffects: {
              filesChanged: false,
              memoryWritten: false,
              missionStarted: false,
              externalNetworkCalled: false,
              prOpened: false,
              publishOrDeployStarted: false,
              scheduleChanged: false,
              toolOrBrowserUsed: false
            },
            evidenceRefs: { screenshots: ['/tmp/genesis-001.png'] }
          }
        ]
      }),
      'utf8'
    );
    const result = spawnSync(
      process.execPath,
      [
        resolve(ROOT, 'node_modules/ts-node/dist/bin.js'),
        'ops/liveNlVerdictReport.ts',
        '--catalog',
        'genesis100',
        '--case',
        'genesis-001',
        '--stdout',
        '--observations',
        observationsPath
      ],
      {
        cwd: ROOT,
        encoding: 'utf8'
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const packet = JSON.parse(result.stdout);
    assert.equal(packet.schema_version, 'spark.telegram_live_qa_evidence_packet.v1');
    assert.equal(packet.run_id, 'telegram-live-qa-cli-fixture');
    assert.equal(packet.summary.pass, 1);
    assert.equal(packet.summary.untested, 0);
    assert.equal(packet.required_session_evidence.profile, 'sparkqa-bot');
    assert.equal(packet.cases[0].observed_turns[0].reply, 'Yes, use it when you have a concrete startup proof target.');
    assert.equal(packet.cases[0].side_effects.mission_started, false);
    assert.deepEqual(packet.cases[0].evidence_refs.screenshots, ['/tmp/genesis-001.png']);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
