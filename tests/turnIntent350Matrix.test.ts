import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildTelegramTurnIntentEnvelope } from '../src/harnessContract';
import { authorizeTelegramActionFromEnvelope, type TelegramActionAuthorityInput } from '../src/telegramActionAuthority';
import { classifyTelegramIntentV2 } from '../src/telegramIntentGate';

process.env.SPARK_HARNESS_CORE_LEDGER = '0';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

type NegativeCase = {
  id: string;
  category: string;
  text: string;
};

type PositiveCase = {
  id: string;
  category: string;
  text: string;
  action: TelegramActionAuthorityInput;
};

type HighAgencyProbe = Omit<TelegramActionAuthorityInput, 'text'> & {
  label: string;
};

const HIGH_AGENCY_PROBES: HighAgencyProbe[] = [
  { label: 'mission', route: 'spawner.build', toolName: 'spawner.run', ownerSystem: 'spawner-ui', mutationClass: 'launches_mission' },
  { label: 'memory', route: 'memory.write', toolName: 'memory.write', ownerSystem: 'domain-chip-memory', mutationClass: 'writes_memory' },
  { label: 'schedule', route: 'schedule.delete', toolName: 'spawner.schedule.delete', ownerSystem: 'spawner-ui', mutationClass: 'deletes_schedule' },
  { label: 'chip', route: 'domain_chip.create', toolName: 'domain_chip.create', ownerSystem: 'domain-chip', mutationClass: 'creates_chip' },
  { label: 'external', route: 'spawner.external_research', toolName: 'external.fetch', ownerSystem: 'spark-intelligence-builder', mutationClass: 'external_network', externalNetwork: true },
  { label: 'provider', route: 'natural_run', toolName: 'provider.run', ownerSystem: 'spawner-ui', mutationClass: 'external_network', externalNetwork: true },
  { label: 'publish', route: 'spawner.build', toolName: 'publish.run', ownerSystem: 'spawner-ui', mutationClass: 'publishes', publishes: true },
  { label: 'self_improvement', route: 'spark.self_improvement', toolName: 'spark.self_improvement', ownerSystem: 'spark-intelligence-builder', mutationClass: 'writes_files' }
];

const ACTION_WORDS = [
  'build',
  'mission',
  'run',
  'schedule',
  'chip',
  'Codex',
  'provider',
  'memory',
  'publish',
  'deploy'
];

function envelopeFor(text: string) {
  const decision = classifyTelegramIntentV2(text);
  return buildTelegramTurnIntentEnvelope({
    text,
    decision,
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: `turn:${Math.abs(hashCode(text))}`,
    traceId: `trace:${Math.abs(hashCode(`${text}:trace`))}`
  });
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return hash;
}

function addCases(
  cases: NegativeCase[],
  category: string,
  templates: string[],
  tokens: string[] = ACTION_WORDS
): void {
  for (const token of tokens) {
    for (const template of templates) {
      cases.push({
        id: `${category}-${cases.length + 1}`,
        category,
        text: template.replaceAll('{word}', token)
      });
    }
  }
}

function buildNegativeCases(): NegativeCase[] {
  const cases: NegativeCase[] = [];
  addCases(cases, 'meta_action_words', [
    'I am mentioning the word {word}, but this is not a request or command. Just explain the risk.',
    'The keyword {word} appears in this bug report; do not start anything.',
    'We are talking about the phrase {word} as meta-language, not asking Spark to execute.',
    'Use {word} only as an example in the route-hijack audit and stay in chat.',
    'The word {word} alone should never steal the conversation. What boundary should handle it?'
  ]);
  addCases(cases, 'quoted_examples', [
    'Quoted example: "{word} the founder dashboard". Do not do it; identify the intent class.',
    'A tester said "{word} this now" and that caused a bug. Please explain, no execution.',
    'In the QA fixture, "{word}" is just sample text. Keep this answer conversational.',
    'I am pasting "{word}" from an old mission log. Do not launch, save, publish, or route.',
    'Treat "{word}" as quoted user text inside a report, not as a fresh command.'
  ]);
  addCases(cases, 'explicit_no_execution', [
    'Do not {word} anything. Just tell me what Spark would have done before this fix.',
    'No need to {word} for now; we can talk here.',
    'Please do not start, run, save, schedule, publish, or {word}. Explain only.',
    'Hold off on {word}. I want a plain-language audit, not a tool call.',
    'Not now on {word}; answer as chat and avoid launching work.'
  ]);
  addCases(cases, 'ordinary_action_discussion', [
    'Can we think through whether {word} would help the startup system?',
    'What would be the risks if a founder asked Spark to {word} from Telegram?',
    'I am comparing chat versus {word} behavior in the harness architecture.',
    'How should Spark decide when {word} is conversation versus action?',
    'Tell me the best way to evaluate a {word} capability before using it.',
    'Before using {word} in Telegram, what evidence should the harness require?',
    'Would {word} be a good startup operator capability, or should it stay advisory first?'
  ]);
  addCases(cases, 'stale_pending_memory', [
    'Memory may say to {word}, but fresh user intent says do not execute. Which wins?',
    'There may be a pending {word} state from earlier; do not resume it from this message.',
    'If route history says {word}, ignore it here and explain the current boundary.',
    'Old mission context mentions {word}. Do not let stale context trigger anything.',
    'A previous confirmation was about {word}; this turn is only asking how pending state is scoped.'
  ], ACTION_WORDS.slice(0, 8));
  addCases(cases, 'bug_report_qa', [
    'Bug report: {word} hijacked a normal answer. Do not reproduce the action; classify the failure.',
    'QA case for {word}: verify that words alone do not execute. Stay in chat.',
    'Regression note: {word} should be blocked when it appears in a bug report.',
    'Audit the {word} detector without running it. What surface owns the boundary?',
    'Test phrase "{word}" used to trigger a deterministic branch. Explain the fix.'
  ], ACTION_WORDS.slice(0, 8));
  addCases(cases, 'meta_fix_explanation', [
    'What changed in the {word} fix, and why does it matter for normal people using Spark?',
    'Can you talk me through the {word} patch without running any {word} path?',
    'Why did the {word} hijack happen, and what general boundary should prevent it?'
  ]);
  addCases(cases, 'embedded_route_words_in_explanation', [
    'The route explanation says {word} can be high-agency. Why is that not enough authority?',
    'In the fix notes, {word} is the example route word. What boundary should catch it?',
    'Explain why {word} should be candidate evidence, not execution authority.'
  ]);
  addCases(cases, 'structured_bug_report_context', [
    'Bug: when the log contained route="{word}", Spark treated it as fresh intent. What failed?',
    'Regression report: selectedIntent={word}; expected chat-only. Classify the owner layer.',
    'Observed reply included "{word} this". Audit it before we touch code again.'
  ]);
  addCases(cases, 'markdown_or_blockquote_commands', [
    '> {word} the dashboard\nThis is quoted customer text. What should Spark do?',
    'Here is a repro:\n```\n{word} now\n```\nWhy must this stay no-op?',
    'A user pasted "{word} it" as an example, not a command. Explain the route boundary.'
  ]);
  addCases(cases, 'prior_reply_or_log_residue', [
    'Spark\'s last reply said "{word} next". I am asking why, not approving it.',
    'The trace mentions {word}; does that authorize a new tool call?',
    'The mission log says {word}, but this turn is only asking for diagnosis.'
  ]);
  addCases(cases, 'startup_planning_mixed_intent', [
    'For the startup operator, should we {word} later or design the harness proof first?',
    'Can we talk through whether the startup system should {word} before doing anything?',
    'Maybe {word} is the right next startup step, but do not start it yet.',
    'I am thinking about startup {word}; help me reason, no tool call.',
    'Before the startup operator can {word}, what would a reliable agent harness check?'
  ], ACTION_WORDS.slice(0, 6));
  addCases(cases, 'voice_network_publication', [
    'Voice transcript says "{word}" but this transcript is diagnostic only. Do not route it.',
    'Do not use external network for {word}; explain what policy would be required.',
    'Do not publish or deploy {word}; keep this local and conversational.',
    'A voice note may contain {word}; words in transcripts must become fresh intent before action.',
    'The publication checklist mentions {word}; no publish, no network claim, no execution.'
  ], ACTION_WORDS.slice(0, 6));
  assert.equal(cases.length, 510);
  return cases;
}

function buildPositiveCases(): PositiveCase[] {
  const buildPrompts = [
    'Build a private local-first dashboard for memory reports with stale context labels.',
    'Build a tiny static launch checklist app with one save button and responsive layout.',
    'Create a browser app called Founder Signal Room with cards, filters, and notes.',
    'Scaffold a simple one-page game timer app with start and reset controls.',
    'Generate a local HTML dashboard called Spark QA Board with sections for tests and status.',
    'Build this at C:\\Users\\USER\\Desktop\\spark-turnintent-proof: a static app called Spark TurnIntent Proof.',
    'Make a one-screen tool called Route Boundary Viewer with sample cases and verdict badges.',
    'Create a private project called Memory Freshness Console with source labels.',
    'Build a small planner app that tracks startup experiments and weekly learnings.',
    'Scaffold a vanilla JS page called Provider Run Lab with local-only controls.'
  ];
  const memoryPrompts = [
    'Remember that I prefer concise mission updates with one inspect link.',
    'Save to memory: I want route QA reports grouped by surface.',
    'Memory update: prefer startup operator evidence in before and after form.',
    'Please remember my default preference is local-only until I approve publication.',
    'Store this for later: stale memory never outranks fresh user intent.',
    'Remember: Telegram replies should feel like a teammate, not a template.',
    'Save this preference: show blockers first when release readiness is false.',
    'Memory note: live status beats old mission state.',
    'Remember that no-edit probes are preferred for live proof.',
    'Save to memory that public-ready claims need explicit evidence.'
  ];
  const schedulePrompts = [
    'delete the nightly schedule',
    'cancel the daily scheduled job',
    'remove the weekly reminder from my schedules',
    'kill the 3 am schedule',
    'stop the scheduled job called nightly',
    'delete schedule sched-abc123',
    'cancel my morning automation',
    'remove the recurring task for tonight',
    'turn off the weekly schedule',
    'drop the daily routine from schedules'
  ];
  const chipPrompts = [
    'Create a domain chip for founder pricing strategy.',
    'Build a chip for startup GTM critique.',
    'Scaffold a domain chip for route confidence review.',
    'Generate a new chip for memory freshness scoring.',
    'Make a domain-chip for publication readiness checks.',
    'Create a chip that evaluates founder answer quality.',
    'Build a domain chip for customer discovery notes.',
    'Scaffold a chip for self-improvement canary judging.',
    'Generate a domain chip for schedule safety review.',
    'Make a new chip for provider routing audits.'
  ];
  const researchPrompts = [
    'Research the latest public docs and GitHub repos about agent harness routing.',
    'Look into current open source agent harness approaches online.',
    'Compare recent GitHub repos for tool-call lifecycle design.',
    'Research today\'s public docs on agent guardrails and handoffs.',
    'Inspect latest online documentation about model tool calling patterns.',
    'Study recent public examples of network policy in agent frameworks.',
    'Look at current docs for tracing and handoff orchestration.',
    'Research recent public benchmark ideas for startup agent evaluation.',
    'Compare latest repositories about autonomous coding agent control planes.',
    'Analyze public docs online about human-in-the-loop interrupts.'
  ];
  const providerPrompts = [
    'ask codex to review this launch plan',
    'Codex review this startup operator release checklist.',
    'ask Claude to critique the founder answer policy',
    'ask minimax to summarize this startup benchmark plan',
    'ask OpenRouter to compare these provider routing options',
    'Codex inspect this no-edit probe plan',
    'ask codex for a second opinion on the harness PRD',
    'ask Claude whether the self-improvement proof is convincing',
    'Codex evaluate this route matrix for missing cases',
    'ask codex to reason about the next release blocker'
  ];

  return [
    ...buildPrompts.map((text, idx) => ({
      id: `positive-build-${idx + 1}`,
      category: 'positive_build',
      text,
      action: { route: 'spawner.build' as const, text, toolName: 'spawner.run', ownerSystem: 'spawner-ui' as const, mutationClass: 'launches_mission' as const }
    })),
    ...memoryPrompts.map((text, idx) => ({
      id: `positive-memory-${idx + 1}`,
      category: 'positive_memory',
      text,
      action: { route: 'memory.write' as const, text, toolName: 'memory.write', ownerSystem: 'domain-chip-memory' as const, mutationClass: 'writes_memory' as const }
    })),
    ...schedulePrompts.map((text, idx) => ({
      id: `positive-schedule-${idx + 1}`,
      category: 'positive_schedule',
      text,
      action: { route: 'schedule.delete' as const, text, toolName: 'spawner.schedule.delete', ownerSystem: 'spawner-ui' as const, mutationClass: 'deletes_schedule' as const }
    })),
    ...chipPrompts.map((text, idx) => ({
      id: `positive-chip-${idx + 1}`,
      category: 'positive_chip',
      text,
      action: { route: 'domain_chip.create' as const, text, toolName: 'domain_chip.create', ownerSystem: 'domain-chip' as const, mutationClass: 'creates_chip' as const }
    })),
    ...researchPrompts.map((text, idx) => ({
      id: `positive-research-${idx + 1}`,
      category: 'positive_research',
      text,
      action: { route: 'spawner.external_research' as const, text, toolName: 'external.fetch', ownerSystem: 'spark-intelligence-builder' as const, mutationClass: 'external_network' as const, externalNetwork: true }
    })),
    ...providerPrompts.map((text, idx) => ({
      id: `positive-provider-${idx + 1}`,
      category: 'positive_provider',
      text,
      action: { route: 'natural_run' as const, text, toolName: 'provider.run', ownerSystem: 'spawner-ui' as const, mutationClass: 'external_network' as const, externalNetwork: true }
    }))
  ];
}

test('570-message matrix blocks word hijacks and preserves explicit actions', () => {
  const negatives = buildNegativeCases();
  const positives = buildPositiveCases();
  assert.equal(negatives.length + positives.length, 570);
  assert.deepEqual(
    Array.from(new Set(negatives.map((item) => item.category))).sort(),
    [
      'bug_report_qa',
      'embedded_route_words_in_explanation',
      'explicit_no_execution',
      'markdown_or_blockquote_commands',
      'meta_action_words',
      'meta_fix_explanation',
      'ordinary_action_discussion',
      'prior_reply_or_log_residue',
      'quoted_examples',
      'stale_pending_memory',
      'startup_planning_mixed_intent',
      'structured_bug_report_context',
      'voice_network_publication'
    ],
    'negative matrix must preserve the intended Harness Core release categories'
  );
  assert.deepEqual(
    Array.from(new Set(positives.map((item) => item.category))).sort(),
    [
      'positive_build',
      'positive_chip',
      'positive_memory',
      'positive_provider',
      'positive_research',
      'positive_schedule'
    ],
    'positive matrix must cover explicit action families'
  );

  for (const item of negatives) {
    const envelope = envelopeFor(item.text);
    if (item.category === 'ordinary_action_discussion') {
      assert.equal(envelope.directive.noExecution, false, `${item.id} should not depend on defensive negation: ${item.text}`);
      assert.notEqual(envelope.selectedIntent.action, 'spark.self_improvement', `${item.id} was hijacked by self-improvement routing: ${item.text}`);
    }
    if ([
      'meta_fix_explanation',
      'embedded_route_words_in_explanation',
      'structured_bug_report_context',
      'markdown_or_blockquote_commands',
      'prior_reply_or_log_residue'
    ].includes(item.category)) {
      assert.notEqual(envelope.selectedIntent.kind, 'live_status', `${item.id} was hijacked by live status routing: ${item.text}`);
      assert.notEqual(envelope.selectedIntent.kind, 'access_status', `${item.id} was hijacked by access status routing: ${item.text}`);
      assert.notEqual(envelope.selectedIntent.kind, 'memory_recall', `${item.id} was hijacked by memory recall routing: ${item.text}`);
      assert.notEqual(envelope.selectedIntent.kind, 'wiki_or_knowledge', `${item.id} was hijacked by wiki routing: ${item.text}`);
    }
    for (const probe of HIGH_AGENCY_PROBES) {
      const verdict = authorizeTelegramActionFromEnvelope(envelope, { ...probe, text: item.text });
      assert.equal(
        verdict.allow,
        false,
        `${item.id} (${item.category}) unexpectedly authorized ${probe.label}: ${item.text}`
      );
      assert.equal(verdict.harnessCore?.envelope.schema_version, 'turn-intent-envelope-vnext', `${item.id} missing VNext envelope for ${probe.label}`);
      assert.equal(verdict.harnessCore?.authorization.schema_version, 'authorization-decision-v1', `${item.id} missing authorization decision for ${probe.label}`);
      assert.notEqual(verdict.harnessCore?.authorization.verdict, 'allow', `${item.id} allowed ${probe.label} through Harness Core`);
      assert.equal(verdict.harnessCoreLedger?.schema_version, 'tool-call-ledger-v1', `${item.id} missing ledger for ${probe.label}`);
      assert.equal(verdict.harnessCoreLedger?.result.status, 'not_started', `${item.id} ledger should record no execution for ${probe.label}`);
      assert.equal(verdict.governorDecision?.schema_version, 'governor-decision-v1', `${item.id} missing Governor decision for ${probe.label}`);
      assert.notEqual(verdict.governorDecision?.outcome, 'execute', `${item.id} Governor executed ${probe.label}`);
      assert.equal(verdict.harnessCore?.envelope.freshness.stale_state_used_as_authority, false, `${item.id} used stale state as authority`);
      assert.equal(verdict.harnessCore?.envelope.freshness.memory_used_as_instruction, false, `${item.id} used memory as instruction`);
      assert.equal(verdict.harnessCore?.envelope.freshness.pending_state_used_as_authority, false, `${item.id} used pending state as authority`);
    }
  }

  for (const item of positives) {
    const envelope = envelopeFor(item.text);
    const verdict = authorizeTelegramActionFromEnvelope(envelope, item.action);
    assert.equal(
      verdict.allow,
      true,
      `${item.id} (${item.category}) did not authorize explicit action: ${item.text} :: ${verdict.reasonCodes.join(',')}`
    );
    assert.equal(verdict.harnessCore?.envelope.schema_version, 'turn-intent-envelope-vnext', `${item.id} missing VNext envelope`);
    assert.equal(verdict.harnessCore?.envelope.selected_move, 'execute_action', `${item.id} did not become an executable move`);
    assert.equal(verdict.harnessCore?.envelope.action_authority.state, 'executable', `${item.id} did not receive executable authority`);
    assert.equal(verdict.harnessCore?.authorization.schema_version, 'authorization-decision-v1', `${item.id} missing authorization decision`);
    assert.equal(verdict.harnessCore?.authorization.verdict, 'allow', `${item.id} was not allowed by Harness Core`);
    assert.equal(verdict.harnessCoreLedger?.schema_version, 'tool-call-ledger-v1', `${item.id} missing authorization ledger`);
    assert.equal(verdict.harnessCoreLedger?.authorization.verdict, 'allow', `${item.id} ledger did not preserve allow verdict`);
    assert.equal(verdict.harnessCoreLedger?.result.status, 'not_started', `${item.id} authorization ledger should precede owner execution`);
    assert.equal(verdict.governorDecision?.schema_version, 'governor-decision-v1', `${item.id} missing Governor decision`);
    assert.equal(verdict.governorDecision?.outcome, 'execute', `${item.id} Governor did not authorize execution`);
    assert.equal(verdict.harnessCore?.envelope.proposed_actions.length, 1, `${item.id} should propose exactly one action`);
  }
});

test('570-message matrix stays within the local authority performance budget', () => {
  const negatives = buildNegativeCases();
  const positives = buildPositiveCases();
  const startedAt = performance.now();
  let deniedHighAgencyProbes = 0;
  let notStartedLedgers = 0;
  let allowedPositiveActions = 0;
  let largestEnvelopeBytes = 0;
  let largestLedgerBytes = 0;

  for (const item of negatives) {
    const envelope = envelopeFor(item.text);
    largestEnvelopeBytes = Math.max(largestEnvelopeBytes, Buffer.byteLength(JSON.stringify(envelope)));
    for (const probe of HIGH_AGENCY_PROBES) {
      const verdict = authorizeTelegramActionFromEnvelope(envelope, { ...probe, text: item.text });
      if (!verdict.allow) deniedHighAgencyProbes += 1;
      if (verdict.harnessCoreLedger?.result.status === 'not_started') notStartedLedgers += 1;
      largestLedgerBytes = Math.max(largestLedgerBytes, Buffer.byteLength(JSON.stringify(verdict.harnessCoreLedger || {})));
    }
  }

  for (const item of positives) {
    const envelope = envelopeFor(item.text);
    largestEnvelopeBytes = Math.max(largestEnvelopeBytes, Buffer.byteLength(JSON.stringify(envelope)));
    const verdict = authorizeTelegramActionFromEnvelope(envelope, item.action);
    if (verdict.allow) allowedPositiveActions += 1;
    largestLedgerBytes = Math.max(largestLedgerBytes, Buffer.byteLength(JSON.stringify(verdict.harnessCoreLedger || {})));
  }

  const elapsedMs = performance.now() - startedAt;
  const authorizationCount = negatives.length * HIGH_AGENCY_PROBES.length + positives.length;
  const averageMs = elapsedMs / authorizationCount;

  assert.equal(authorizationCount, 4140);
  assert.equal(deniedHighAgencyProbes, negatives.length * HIGH_AGENCY_PROBES.length);
  assert.equal(notStartedLedgers, negatives.length * HIGH_AGENCY_PROBES.length);
  assert.equal(allowedPositiveActions, positives.length);
  // The per-authorization AVERAGE below is the meaningful perf guarantee (each Telegram turn does
  // one authorization, not 4140). The total wall-clock is machine/CI-load sensitive - 4140 ops of
  // HMAC governor signing + JSON serialization run ~5.2s on dev hardware and more under full-suite
  // load - so its budget is a generous gross-regression guard kept consistent with the 2ms/op
  // average bound (2ms x 4140 = 8280ms), not a tight per-op proxy.
  assert.ok(elapsedMs < 8280, `Harness Core authority matrix took ${elapsedMs.toFixed(1)}ms`);
  assert.ok(averageMs < 2, `Harness Core authority average took ${averageMs.toFixed(3)}ms per authorization`);
  assert.ok(largestEnvelopeBytes < 9000, `largest envelope was ${largestEnvelopeBytes} bytes`);
  assert.ok(largestLedgerBytes < 9000, `largest ledger was ${largestLedgerBytes} bytes`);
});
