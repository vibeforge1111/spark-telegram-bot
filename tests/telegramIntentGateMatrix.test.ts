import assert from 'node:assert/strict';
import { classifyTelegramIntentV2 } from '../src/telegramIntentGate';

type ExpectedConstraints = Partial<{
  noExecution: boolean;
  noPublish: boolean;
  noMerge: boolean;
  noPublicClaim: boolean;
  noNetworkAbsorptionClaim: boolean;
  localOnly: boolean;
}>;

interface MatrixCase {
  id: string;
  lane: string;
  prompt: string;
  expectedRoute: string;
  expectedOwner?: string;
  constraints?: ExpectedConstraints;
  blockedRoutes?: string[];
  enforcement?: 'enforce_safe' | 'observe' | 'blocked';
}

function c(
  lane: string,
  id: string,
  prompt: string,
  expectedRoute: string,
  extra: Omit<MatrixCase, 'lane' | 'id' | 'prompt' | 'expectedRoute'> = {}
): MatrixCase {
  return { lane, id, prompt, expectedRoute, ...extra };
}

const startupCanaryPrompt = [
  'Run a startup self-improvement canary from Telegram.',
  'Do not publish, merge, or claim public/network readiness.',
  'Take this founder problem: every new channel creates support, delivery, and focus fatigue.',
  'First produce a baseline answer, then run the startup self-improvement loop, critique it, produce an improved answer, and run a blind jury comparison.',
  'Return the baseline answer, improved answer, jury verdict, what changed in the agent, and what still blocks a fully closed startup self-improvement loop.'
].join(' ');

const cases: MatrixCase[] = [
  c('startup', 'startup-canary-no-publish', startupCanaryPrompt, 'startup.answer_improvement_canary', {
    expectedOwner: 'spark-intelligence-builder',
    enforcement: 'enforce_safe',
    constraints: { noExecution: false, noPublish: true, noMerge: true, noPublicClaim: true, noNetworkAbsorptionClaim: true, localOnly: true },
    blockedRoutes: ['startup.proof_readout', 'spark.self_improvement']
  }),
  c('startup', 'startup-canary-no-run', 'Run a startup self-improvement canary. Do not run it, just explain the proof boundary.', 'startup.proof_readout', {
    constraints: { noExecution: true },
    blockedRoutes: ['startup.answer_improvement_canary']
  }),
  c('startup', 'channel-fatigue-advice', 'Should we add another channel if response quality is weak and the support team is backed up?', 'startup.founder_advice'),
  c('startup', 'pricing-pressure-advice', 'What should the founder do if pricing is too low, customers are noisy, and support backlog is growing?', 'startup.founder_advice'),
  c('startup', 'runway-advice', 'What should we do if runway is tight, pipeline quality is weak, and the board wants growth?', 'startup.founder_advice'),
  c('startup', 'support-backlog-advice', 'How should the operator respond when onboarding creates support backlog and churn risk?', 'startup.founder_advice'),
  c('startup', 'startup-proof-readout', 'Did the startup agent actually improve, not just scores, and what is still blocked before public-ready?', 'startup.proof_readout'),
  c('startup', 'startup-network-blocker', 'What still blocks the startup operator from being network-absorbable?', 'startup.proof_readout'),
  c('startup', 'startup-public-boundary', 'Are we public-ready with the startup self-improvement loop or still blocked?', 'startup.proof_readout'),
  c('startup', 'startup-no-claim-compare', 'Do not claim public readiness, but compare the startup baseline and improved answer.', 'plain_chat', {
    constraints: { noPublicClaim: true }
  }),
  c('startup', 'startup-memory-write', 'Remember that startup canaries must show baseline and improved answers before claiming improvement.', 'memory.write'),
  c('startup', 'startup-memory-recall', 'What did I ask you to remember about startup canaries?', 'memory.recall'),
  c('startup', 'startup-yc-recursive-status', 'Did Startup YC improve?', 'recursive.status'),
  c('startup', 'startup-yc-named-report', 'Give me the recursive report for Startup YC.', 'recursive.report'),
  c('startup', 'startup-advice-after-proof', 'Should we add another channel if Startup YC is still blocked and response quality is weak?', 'startup.founder_advice'),

  c('self-improvement', 'choose-agent-improvement', 'What should you improve next as an agent using weak-spot evidence and safe probes?', 'spark.self_improvement'),
  c('self-improvement', 'capability-gap-plan', 'Where do you lack capability and how should you improve with probe-first evidence?', 'spark.self_diagnostic'),
  c('self-improvement', 'bounded-improvement-run', 'Run the safest bounded Spark self-improvement probe for the top weak spot.', 'spark.self_improvement'),
  c('self-improvement', 'explain-no-run', 'Explain the self-improvement boundary, do not run anything.', 'plain_chat', {
    constraints: { noExecution: true }
  }),
  c('self-improvement', 'before-after-answer', 'Run a before and after answer improvement test for Spark reasoning quality.', 'spark.self_improvement'),
  c('self-improvement', 'memory-self-awareness', 'Where does Spark memory lack reliability and how should the agent improve it?', 'spark.self_improvement'),
  c('self-improvement', 'provider-self-awareness', 'Where are provider routes weak and what should Spark improve first?', 'spark.self_diagnostic'),
  c('self-improvement', 'wiki-supported-self-awareness', 'Using your LLM wiki, what weak spot should Spark improve next?', 'spark_wiki.query'),
  c('self-improvement', 'autonomy-boundary', 'Are you fully autonomous or what is still blocked?', 'plain_chat'),
  c('self-improvement', 'smallest-improvement', 'Pick the next smallest Spark improvement and explain the safe probe.', 'spark.self_improvement'),

  c('memory', 'remember-preference', 'Remember that I prefer concise startup operator answers with one board line.', 'memory.write'),
  c('memory', 'remember-project-focus', 'Save my current focus: Intent Gate V2 should own Telegram route selection.', 'memory.write'),
  c('memory', 'remember-route-policy', 'Memory note: no-publish is not no-run for local canaries.', 'memory.write'),
  c('memory', 'recall-preference', 'What do you remember about my Telegram reply preference?', 'memory.recall'),
  c('memory', 'recall-project-focus', 'Recall my current project focus.', 'memory.recall'),
  c('memory', 'recall-old-note', 'What did I ask you to remember earlier about route policy?', 'memory.recall'),
  c('memory', 'memory-after-build-context', 'Remember that build context should not steal memory writes.', 'memory.write'),
  c('memory', 'memory-mentions-startup', 'Remember that startup advice should not become a proof card.', 'memory.write'),
  c('memory', 'memory-mentions-build', 'Remember that build prompts need current target paths before execution.', 'memory.write'),
  c('memory', 'memory-mentions-recursive', 'Remember that recursive status owns named path questions.', 'memory.write'),

  c('wiki', 'wiki-status', 'Is your Spark LLM wiki connected and healthy?', 'spark_wiki.status'),
  c('wiki', 'wiki-inventory', 'What pages are in your LLM wiki?', 'spark_wiki.inventory'),
  c('wiki', 'wiki-query', 'Search your wiki for Telegram route mistakes.', 'spark_wiki.query'),
  c('wiki', 'wiki-answer', 'Answer from your LLM wiki how route tracing should work.', 'spark_wiki.answer'),
  c('wiki', 'wiki-promote', 'Promote this to your Spark wiki: Intent Gate V2 owns Telegram routing.', 'spark_wiki.promote'),
  c('wiki', 'wiki-no-publish', 'Answer from your wiki how startup canaries work, but do not publish anything.', 'spark_wiki.answer', {
    constraints: { noPublish: true, localOnly: true }
  }),
  c('wiki', 'wiki-after-build', 'Search your wiki for build routing matrix failures.', 'spark_wiki.query'),
  c('wiki', 'wiki-after-self-awareness', 'What does your wiki say about self-awareness route boundaries?', 'spark_wiki.query'),
  c('wiki', 'wiki-current-source', 'Using your wiki, answer how source priority should work for current runtime truth.', 'spark_wiki.answer'),
  c('wiki', 'wiki-not-self-improvement', 'Answer from your LLM wiki how to improve routes without launching self-improvement.', 'spark_wiki.answer', {
    constraints: { noExecution: true }
  }),

  c('recursive', 'recursive-sessions', 'Show recursive sessions.', 'recursive.sessions'),
  c('recursive', 'recursive-paths', 'What recursive paths are available?', 'recursive.paths'),
  c('recursive', 'recursive-status-path', 'Status path:spark-qa-operator.', 'recursive.status'),
  c('recursive', 'recursive-report-path', 'Report path:spark-qa-operator.', 'recursive.report'),
  c('recursive', 'recursive-start-natural', 'Run another round for Spark QA Operator.', 'recursive.start'),
  c('recursive', 'recursive-slash-start', '/recursive start spark-qa-operator rounds 1', 'slash_command'),
  c('recursive', 'recursive-approve', 'Approve recursive review item 2.', 'recursive.approve'),
  c('recursive', 'recursive-proposal', 'Propose a recursive network packet for Spark QA Operator.', 'recursive.propose'),
  c('recursive', 'recursive-startup-yc-proof', 'Did Startup YC improve in the recursive loop?', 'recursive.status'),
  c('recursive', 'recursive-followup-after-startup', 'Where did the Spark QA Operator loop land?', 'recursive.report'),

  c('spawner', 'build-new-app', 'Build a tiny timer app at /Users/alchemistab/Documents/SparkProjects/timer-app with tests.', 'spawner.build'),
  c('spawner', 'shape-without-building', 'Help me shape an idea for a better founder dashboard before building.', 'conversation.ideation'),
  c('spawner', 'latest-canvas', 'What was the latest canvas plan?', 'plain_chat'),
  c('spawner', 'latest-failed-mission', 'What failed in the latest Spawner job?', 'spawner.latest_failure'),
  c('spawner', 'latest-provider', 'Which provider handled the latest mission?', 'spawner.latest_provider'),
  c('spawner', 'no-start-title', 'If we started a mission for this, what would the title be? Do not start it.', 'plain_chat', {
    constraints: { noExecution: true }
  }),
  c('spawner', 'board-status', 'Show the Spawner board status.', 'spawner.board'),
  c('spawner', 'pending-clarification-go', 'go', 'plain_chat'),
  c('spawner', 'cancel-clarification', 'Never mind, keep this in chat.', 'plain_chat', {
    constraints: { noExecution: true }
  }),
  c('spawner', 'build-with-access-words', 'Build a local access-level explainer page at /Users/alchemistab/Documents/SparkProjects/access-page.', 'spawner.build'),

  c('creator-domain', 'creator-plan-only', 'Stage a private creator mission for Telegram route QA, do not publish.', 'creator.mission', {
    constraints: { noPublish: true, localOnly: true }
  }),
  c('creator-domain', 'creator-execute', 'Execute the planned creator mission for Telegram route QA.', 'plain_chat'),
  c('creator-domain', 'creator-status', 'What is the creator mission status?', 'plain_chat'),
  c('creator-domain', 'domain-chip-create', 'Build a domain-chip for Telegram memory routing.', 'domain_chip.create'),
  c('creator-domain', 'domain-chip-ideation', 'Maybe we should create a domain-chip for startup operator advice.', 'conversation.ideation'),
  c('creator-domain', 'domain-chip-pending-followup', 'Use the second domain-chip option.', 'conversation.ideation'),
  c('creator-domain', 'domain-chip-after-startup', 'Create a domain-chip for startup channel fatigue advice.', 'domain_chip.create'),
  c('creator-domain', 'creator-benchmark-pack', 'Stage a private benchmarked specialization path with a domain chip and benchmark pack.', 'creator.mission'),
  c('creator-domain', 'specialization-staging', 'Stage a private specialization path for Telegram tool usage.', 'creator.mission'),
  c('creator-domain', 'loop-template-no-publish', 'Stage a reusable loop template locally only, do not publish or share.', 'creator.mission', {
    constraints: { noPublish: true, localOnly: true }
  }),

  c('access-runtime', 'access-status', 'What is my Spark access level?', 'access.status'),
  c('access-runtime', 'access-help', 'What can Spark access levels do?', 'access.help'),
  c('access-runtime', 'access-change', 'Change this chat to access level 3.', 'access.change'),
  c('access-runtime', 'access-contextual-change', 'Actually make it level 4.', 'plain_chat'),
  c('access-runtime', 'access-mismatch', 'Why does access level 5 still look read-only in this runner?', 'plain_chat'),
  c('access-runtime', 'live-status', 'What is Spark live runtime status right now?', 'plain_chat'),
  c('access-runtime', 'restart-needed', 'Do we need to restart Spark Telegram?', 'plain_chat'),
  c('access-runtime', 'restart-survival', 'Will this survive a restart?', 'plain_chat'),
  c('access-runtime', 'provider-status', 'What provider is Spark using for chat and missions?', 'plain_chat'),
  c('access-runtime', 'source-priority', 'Which source should win: memory or fresh runtime truth?', 'plain_chat'),

  c('mission-control', 'pause-latest', 'Pause the latest mission.', 'plain_chat'),
  c('mission-control', 'resume-latest', 'Resume the latest mission.', 'plain_chat'),
  c('mission-control', 'cancel-latest', 'Cancel the latest mission.', 'plain_chat'),
  c('mission-control', 'do-not-cancel', 'Do not cancel it, just explain the blocker.', 'plain_chat', {
    constraints: { noExecution: true }
  }),
  c('mission-control', 'ambiguous-cancel', 'Cancel that one.', 'plain_chat'),
  c('mission-control', 'already-running-resume', 'Resume it if it is not already running.', 'plain_chat'),
  c('mission-control', 'already-paused-pause', 'Pause it if it is not already paused.', 'plain_chat'),
  c('mission-control', 'latest-failure-blocker', 'What is blocking the latest failed mission?', 'plain_chat'),
  c('mission-control', 'latest-open-link', 'Open the latest mission link.', 'plain_chat'),
  c('mission-control', 'mission-provenance', 'Which mission produced that answer?', 'plain_chat'),

  c('surface-style', 'plain-ideation', 'Help me think through whether this should be a dashboard or a workflow.', 'conversation.ideation'),
  c('surface-style', 'no-bullets', 'Explain this in plain words, no bullets.', 'plain_chat'),
  c('surface-style', 'compact-status', 'Give me a compact status card.', 'plain_chat'),
  c('surface-style', 'warm-teammate', 'Can you say this like a teammate, not a template?', 'plain_chat'),
  c('surface-style', 'raw-details', 'Show raw route details.', 'plain_chat'),
  c('surface-style', 'felt-deterministic', 'That answer felt deterministic and robotic.', 'plain_chat'),
  c('surface-style', 'say-normally', 'Say it normally.', 'plain_chat'),
  c('surface-style', 'actual-opinion', 'What do you actually think?', 'plain_chat'),
  c('surface-style', 'after-dense-card', 'What does that mean in human terms?', 'plain_chat'),
  c('surface-style', 'what-else', 'What else?', 'plain_chat'),

  c('voice-media', 'voice-answer', 'Reply with a voice message about the startup operator boundary.', 'plain_chat'),
  c('voice-media', 'spoken-reply', 'Send me a spoken reply about route hijacks.', 'plain_chat'),
  c('voice-media', 'image-caption-memory', 'Remember the image caption as context for the startup operator.', 'memory.write'),
  c('voice-media', 'draft-streaming', 'Turn on Telegram draft streaming for private chats.', 'plain_chat'),
  c('voice-media', 'media-fallback', 'If voice media is unavailable, explain the fallback.', 'plain_chat'),

  c('mixed', 'remember-then-canary', 'Remember this: startup canaries need a jury. Then run a startup self-improvement canary.', 'memory.write'),
  c('mixed', 'canary-but-no-run', 'Run a startup self-improvement canary but do not run anything.', 'startup.proof_readout', {
    constraints: { noExecution: true },
    blockedRoutes: ['startup.answer_improvement_canary']
  }),
  c('mixed', 'build-no-build-yet', 'Build a founder dashboard, but do not build yet.', 'conversation.ideation', {
    constraints: { noExecution: true }
  }),
  c('mixed', 'access-while-building', 'What access level am I on while building this?', 'access.status'),
  c('mixed', 'wiki-and-improve', 'Query your wiki and improve yourself based on route failures.', 'spark_wiki.query'),
  c('mixed', 'recursive-and-advice', 'Give recursive status for Startup YC and then tell the founder what to do.', 'recursive.status'),
  c('mixed', 'latest-canvas-and-canary', 'Ignore the latest canvas and run a startup self-improvement canary.', 'startup.answer_improvement_canary'),
  c('mixed', 'publish-nothing-local-proof', 'Publish nothing, but run the local proof for startup answer improvement.', 'plain_chat', {
    constraints: { noPublish: true, localOnly: true }
  }),
  c('mixed', 'network-false-show-improvement', 'Network absorbable false, show the startup improvement evidence.', 'startup.proof_readout', {
    constraints: { noNetworkAbsorptionClaim: true }
  }),
  c('mixed', 'do-not-claim-compare', 'Do not claim public readiness, but compare the baseline and improved startup answer.', 'plain_chat', {
    constraints: { noPublicClaim: true }
  }),
  c('mixed', 'stale-quote-memory-write', 'Remember that stale mission quotes should not own the current turn.', 'memory.write'),
  c('mixed', 'stale-proof-founder-advice', 'The old proof card is stale. Should we add another channel if support is backed up?', 'startup.founder_advice'),
  c('mixed', 'startup-advice-says-remember', 'What should the founder remember when channel growth creates support fatigue?', 'startup.founder_advice'),
  c('mixed', 'memory-write-advice-shaped', 'Remember that when channel growth creates support fatigue, diagnose channel quality first.', 'memory.write'),
  c('mixed', 'route-bug-audit-chat', 'Audit why deterministic route hijacks keep happening, but do not start a mission.', 'plain_chat', {
    constraints: { noExecution: true }
  }),

  c('builder-imported-capability', 'builder-install-voice-self', 'lets make today about improving your capabilities... can you install a voice to yourself?', 'spark.self_improvement'),
  c('builder-imported-capability', 'builder-build-for-you-email', "Okay let's build this for you, Spark: a way to read my emails and summarize them.", 'spark.self_improvement'),
  c('builder-imported-capability', 'builder-build-you-email-reader', "Let's build you an email reader so you can summarize my inbox.", 'spark.self_improvement'),
  c('builder-imported-capability', 'builder-calendar-capability', 'Create a capability for Spark to read my calendar.', 'spark.self_improvement'),
  c('builder-imported-capability', 'builder-files-skill', 'Build a skill that lets you access my project files.', 'spark.self_improvement'),
  c('builder-imported-capability', 'builder-daily-memory-reports', 'Set up daily reports of my memories so I know what changed.', 'spark.self_improvement'),
  c('builder-imported-capability', 'builder-brain-workflow-change', 'Change your brain so you handle my workflow differently.', 'spark.self_improvement'),
  c('builder-imported-capability', 'builder-spark-choose-improvement', 'Okay Spark, what do you want to improve today?', 'spark.self_improvement'),
  c('builder-imported-capability', 'builder-memory-dashboard-build', 'Build a Spark memory dashboard.', 'spawner.build'),
  c('builder-imported-capability', 'builder-users-reminder-tool-build', 'Build a tool for Spark users to manage reminders.', 'spawner.build'),

  c('builder-imported-awareness', 'builder-slash-self', '/self', 'slash_command'),
  c('builder-imported-awareness', 'builder-slash-wiki-status', '/wiki', 'slash_command'),
  c('builder-imported-awareness', 'builder-slash-wiki-candidates', '/wiki candidates', 'slash_command'),
  c('builder-imported-awareness', 'builder-slash-wiki-scan', '/wiki scan-candidates', 'slash_command'),
  c('builder-imported-awareness', 'builder-self-awareness-lacks', 'Where do you lack and how can you improve those parts?', 'spark.self_diagnostic'),
  c('builder-imported-awareness', 'builder-memory-cognition-boundary', 'What do you know about your memory system and what outranks wiki?', 'spark.self_diagnostic'),
  c('builder-imported-awareness', 'builder-wiki-candidate-inbox', 'What candidate wiki learnings need verification?', 'spark_wiki.query'),
  c('builder-imported-awareness', 'builder-wiki-candidate-scan', 'Scan your wiki candidates for contradictions', 'spark_wiki.query'),
  c('builder-imported-awareness', 'builder-build-quality-review', 'Review the quality of the /memory-quality build in spawner-ui.', 'builder.build_quality_review', {
    blockedRoutes: ['spawner.build']
  }),
  c('builder-imported-awareness', 'builder-memory-current-state-write', 'For later, Omar owns the launch checklist.', 'memory.write'),
  c('builder-imported-awareness', 'builder-memory-current-state-recall', 'Who owns the launch checklist?', 'memory.recall'),
  c('builder-imported-awareness', 'builder-route-explanation-debug', 'Why did you answer that way?', 'builder.context_source_debug'),

  c('word-hijack-negatives', 'word-build-alone', 'build', 'plain_chat'),
  c('word-hijack-negatives', 'word-codex-alone', 'codex', 'plain_chat'),
  c('word-hijack-negatives', 'word-repo-alone', 'repo', 'plain_chat'),
  c('word-hijack-negatives', 'word-memory-alone', 'memory', 'plain_chat'),
  c('word-hijack-negatives', 'word-wiki-alone', 'wiki', 'plain_chat'),
  c('word-hijack-negatives', 'word-voice-alone', 'voice', 'plain_chat'),
  c('word-hijack-negatives', 'word-access-alone', 'access', 'plain_chat'),
  c('word-hijack-negatives', 'word-recursive-alone', 'recursive', 'plain_chat'),
  c('word-hijack-negatives', 'word-startup-alone', 'startup', 'plain_chat'),
  c('word-hijack-negatives', 'word-mission-alone', 'mission', 'plain_chat'),
  c('word-hijack-negatives', 'word-canvas-alone', 'canvas', 'plain_chat'),
  c('word-hijack-negatives', 'word-spawner-alone', 'spawner', 'plain_chat'),
  c('word-hijack-negatives', 'word-chip-alone', 'chip', 'plain_chat'),
  c('word-hijack-negatives', 'word-provider-alone', 'provider', 'plain_chat'),
  c('word-hijack-negatives', 'word-claude-alone', 'claude', 'plain_chat'),
  c('word-hijack-negatives', 'word-openrouter-alone', 'openrouter', 'plain_chat'),
  c('word-hijack-negatives', 'word-telegram-alone', 'telegram', 'plain_chat'),
  c('word-hijack-negatives', 'build-question-alone', 'build?', 'plain_chat'),
  c('word-hijack-negatives', 'codex-question-alone', 'codex?', 'plain_chat'),
  c('word-hijack-negatives', 'what-about-build', 'what about build', 'plain_chat'),
  c('word-hijack-negatives', 'what-about-codex', 'what about codex', 'plain_chat'),
  c('word-hijack-negatives', 'talk-about-memory', 'can we talk about memory', 'conversation.ideation'),
  c('word-hijack-negatives', 'repo-feels-rough', 'the repo feels rough', 'plain_chat'),
  c('word-hijack-negatives', 'ui-needs-improvement', 'this UI needs improvement', 'plain_chat'),
  c('word-hijack-negatives', 'mentioning-build-not-build', 'mentioning build does not mean build anything', 'plain_chat'),
  c('word-hijack-negatives', 'quoted-build-chip-not-command', 'Build a chip and run a mission are phrases here, not a command; do not scaffold anything.', 'plain_chat', {
    constraints: { noExecution: true }
  }),
  c('word-hijack-negatives', 'terms-schedule-loop-not-request', 'Schedule, loop, provider, and route are terms here, not a request.', 'plain_chat', {
    constraints: { noExecution: true }
  }),
  c('word-hijack-negatives', 'meta-language-build-boundary', 'build appears in this sentence as meta-language; stay in chat and explain the boundary.', 'plain_chat', {
    constraints: { noExecution: true }
  }),
  c('word-hijack-negatives', 'bug-report-schedule-no-mission', 'Bug report: schedule hijacked routing before; do not create a mission.', 'plain_chat', {
    constraints: { noExecution: true }
  }),
  c('word-hijack-negatives', 'qa-case-provider-words-alone', 'QA case for provider: words alone should not execute.', 'plain_chat', {
    constraints: { noExecution: true }
  }),
  c('word-hijack-negatives', 'no-create-domain-chip', 'Do not create a domain chip; explain when one would be useful.', 'conversation.ideation', {
    constraints: { noExecution: true }
  }),
  c('word-hijack-negatives', 'codex-no-run', 'Codex is relevant but do not run anything', 'plain_chat', {
    constraints: { noExecution: true }
  }),
  c('word-hijack-negatives', 'many-keywords-no-route', 'wiki and memory and access are words here, do not route them', 'plain_chat')
];

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('Intent Gate V2 matrix covers more than 100 Telegram conversations', () => {
  assert.ok(cases.length >= 120, `expected at least 120 cases, got ${cases.length}`);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.ok(new Set(cases.map((item) => item.lane)).size >= 10);
});

test('Intent Gate V2 matrix routes each conversation to the expected owner surface', () => {
  const failures: string[] = [];

  for (const item of cases) {
    const decision = classifyTelegramIntentV2(item.prompt);

    if (decision.schema_version !== 'spark.telegram.intent_decision.v2') {
      failures.push(`${item.id}: wrong schema ${decision.schema_version}`);
    }
    if (decision.route !== item.expectedRoute) {
      failures.push(`${item.id}: route ${decision.route} !== ${item.expectedRoute}`);
    }
    if (item.expectedOwner && decision.owner_system !== item.expectedOwner) {
      failures.push(`${item.id}: owner ${decision.owner_system} !== ${item.expectedOwner}`);
    }
    if (item.enforcement && decision.enforcement !== item.enforcement) {
      failures.push(`${item.id}: enforcement ${decision.enforcement} !== ${item.enforcement}`);
    }
    for (const [key, value] of Object.entries(item.constraints || {})) {
      const actual = decision.constraints[key as keyof typeof decision.constraints];
      if (actual !== value) {
        failures.push(`${item.id}: constraint ${key} ${String(actual)} !== ${String(value)}`);
      }
    }
    for (const route of item.blockedRoutes || []) {
      if (!decision.blocked_candidates.some((candidate) => candidate.route === route)) {
        failures.push(`${item.id}: missing blocked route ${route}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});
