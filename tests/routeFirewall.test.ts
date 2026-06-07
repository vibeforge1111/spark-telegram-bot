import assert from 'node:assert/strict';
import { evaluateDeterministicRoute } from '../src/routeFirewall';
import type { DeterministicRouteId } from '../src/routeFirewall';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('blocks interruptive routes for plain Spark system questions', () => {
  const verdict = evaluateDeterministicRoute(
    'spawner.build',
    'what build updates are missing in Spark routing?'
  );

  assert.equal(verdict.allow, false);
  assert.equal(verdict.reason, 'plain_chat_protected');
  assert.equal(verdict.confidence, 'blocked');
});

test('allows explicit project builds through the firewall', () => {
  const verdict = evaluateDeterministicRoute(
    'spawner.build',
    'Build this at C:\\Users\\USER\\Desktop\\spark-timer: a tiny timer app'
  );

  assert.equal(verdict.allow, true);
  assert.equal(verdict.reason, 'concrete_project_build');
  assert.equal(verdict.confidence, 'explicit');
});

test('allows explicit no-edit Spawner missions through the firewall', () => {
  const verdict = evaluateDeterministicRoute(
    'spawner.build',
    'Run a tiny mission through Spawner that only replies: SPARK_TURNINTENT_QA_OK_6. Do not edit files.'
  );

  assert.equal(verdict.allow, true);
  assert.equal(verdict.reason, 'explicit_spawner_no_edit_mission');
  assert.equal(verdict.confidence, 'explicit');

  const probeVerdict = evaluateDeterministicRoute(
    'spawner.build',
    'Run a tiny no-edit Spawner probe that only replies SPARK_TURNINTENT_QA_067_OK. Do not edit files.'
  );
  assert.equal(probeVerdict.allow, true);
  assert.equal(probeVerdict.reason, 'explicit_spawner_no_edit_mission');
  assert.equal(probeVerdict.confidence, 'explicit');
});

test('allows explicit memory updates even when they mention plans', () => {
  const verdict = evaluateDeterministicRoute(
    'memory.write',
    'Memory update: my current plan is Neon Harbor Telegram memory test. Please save this as my current plan.'
  );

  assert.equal(verdict.allow, true);
  assert.equal(verdict.reason, 'explicit_memory_write');
  assert.equal(verdict.confidence, 'explicit');
});

test('allows exact owner-approved memory notes while keeping other negative constraints scoped', () => {
  const prompt = 'Owner approves exactly one memory write. Save this exact KB note and nothing else: "harness-cua-kb-20260607-0703: Browser/computer-use must remain read-only planning until Harness Core grants explicit tool authority with screenshot and side-effect evidence." Do not start missions, do not create chips, and do not change runtime or registry truth.';
  const memory = evaluateDeterministicRoute('memory.write', prompt);
  const spawner = evaluateDeterministicRoute('spawner.build', prompt);
  const chip = evaluateDeterministicRoute('domain_chip.create', prompt);

  assert.equal(memory.allow, true);
  assert.equal(memory.reason, 'scoped_explicit_memory_write');
  assert.equal(memory.confidence, 'explicit');
  assert.equal(spawner.allow, false);
  assert.equal(spawner.reason, 'no_execution_boundary');
  assert.equal(chip.allow, false);
  assert.equal(chip.reason, 'no_execution_boundary');
});

test('blocks exact memory note wording when the fresh turn negates the memory write itself', () => {
  const verdict = evaluateDeterministicRoute(
    'memory.write',
    'Save this exact KB note: "temporary scratch only", but do not save or remember anything.'
  );

  assert.equal(verdict.allow, false);
  assert.equal(verdict.reason, 'no_execution_boundary');
  assert.equal(verdict.confidence, 'blocked');
});

test('blocks build and mission routes from stealing bounded operator probes', () => {
  const prompt = 'Run a safe Level 5 smoke test: create a tiny file at C:\\Users\\USER\\AppData\\Local\\Temp\\spark-telegram-level5-smoke.txt, write "level5 ok", read it back, then delete it. Do not touch anything else. Tell me each step.';
  const competingRoutes: DeterministicRouteId[] = [
    'spawner.build',
    'spawner.default_build',
    'spawner.contextual_mission',
    'domain_chip.create',
    'spark.self_improvement'
  ];

  for (const route of competingRoutes) {
    const verdict = evaluateDeterministicRoute(route, prompt);
    assert.equal(verdict.allow, false, route);
    assert.equal(verdict.reason, 'operator_probe_competing_route', route);
    assert.equal(verdict.confidence, 'blocked', route);
  }

  const operatorVerdict = evaluateDeterministicRoute('operator.safe_action', prompt);
  assert.equal(operatorVerdict.allow, true);
  assert.equal(operatorVerdict.reason, 'bounded_operator_probe');
  assert.equal(operatorVerdict.confidence, 'explicit');
});

test('allows explicit repo and docs research even when the topic is routing architecture', () => {
  const verdict = evaluateDeterministicRoute(
    'spawner.external_research',
    'Look at OpenClaw and Hermes GitHub repos and docs to compare how their natural language routing works.'
  );

  assert.equal(verdict.allow, true);
  assert.equal(verdict.reason, 'explicit_external_research');
  assert.equal(verdict.confidence, 'explicit');
});

test('allows reusable loop template staging while run and publish are blocked', () => {
  const verdict = evaluateDeterministicRoute(
    'creator.mission',
    'turn this proven loop into a reusable template. Do not run or publish it.'
  );

  assert.equal(verdict.allow, true);
  assert.equal(verdict.reason, 'creator_mission_plan_only');
  assert.equal(verdict.confidence, 'explicit');
});

test('allows explicit creator benchmark pack artifacts through Spark QA meta language', () => {
  const verdict = evaluateDeterministicRoute(
    'creator.mission',
    'create a benchmark pack for Spark QA Operator that tests stale scores, wrong Workspace evidence, route drift, natural-language context hijack, no-op loops, and private review boundary mistakes'
  );

  assert.equal(verdict.allow, true);
  assert.equal(verdict.reason, 'explicit_creator_artifact');
  assert.equal(verdict.confidence, 'explicit');
});

test('does not let Spark QA score wording steal benchmark-pack creation', () => {
  const verdict = evaluateDeterministicRoute(
    'sparkqa.run',
    'create a benchmark pack for Spark QA Operator that tests stale scores, wrong Workspace evidence, route drift, and no-op loops'
  );

  assert.equal(verdict.allow, false);
  assert.equal(verdict.reason, 'plain_chat_protected');
});

test('allows Spark QA benchmark score proof questions through the run boundary', () => {
  const verdict = evaluateDeterministicRoute(
    'sparkqa.run',
    'show Spark QA Operator benchmark score'
  );

  assert.equal(verdict.allow, true);
  assert.equal(verdict.reason, 'explicit_sparkqa_run');
  assert.equal(verdict.confidence, 'explicit');
});

test('allows Spark QA pause control even when it blocks more rounds', () => {
  const verdict = evaluateDeterministicRoute(
    'sparkqa.pause',
    'pause the Spark QA Operator loop; do not keep running more rounds'
  );

  assert.equal(verdict.allow, true);
  assert.equal(verdict.reason, 'explicit_sparkqa_pause');
  assert.equal(verdict.confidence, 'explicit');
});

test('blocks capability-evaluation discussion from self-improvement execution', () => {
  const samples = [
    'Tell me the best way to evaluate a build capability before using it.',
    'Would build be a good startup operator capability, or should it stay advisory first?',
    'Before using memory in Telegram, what evidence should the harness require?'
  ];

  for (const prompt of samples) {
    const verdict = evaluateDeterministicRoute('spark.self_improvement', prompt);
    assert.equal(verdict.allow, false, prompt);
    assert.equal(verdict.reason, 'plain_chat_protected', prompt);
    assert.equal(verdict.confidence, 'blocked', prompt);
  }
});

test('blocks broad do-not action-word phrasings from self-improvement execution', () => {
  const verdict = evaluateDeterministicRoute(
    'spark.self_improvement',
    'Do not mission anything. Just tell me what Spark would have done before this fix.'
  );

  assert.equal(verdict.allow, false);
  assert.equal(verdict.reason, 'no_execution_boundary');
  assert.equal(verdict.confidence, 'blocked');
});

test('no-execution boundary outranks explicit domain-chip wording', () => {
  const verdict = evaluateDeterministicRoute(
    'domain_chip.create',
    'Please do not build, do not save, and do not create a chip. I only want to understand the design.'
  );

  assert.equal(verdict.allow, false);
  assert.equal(verdict.reason, 'no_execution_boundary');
  assert.equal(verdict.confidence, 'blocked');
});

test('allows explicit no-edit Mission Control diagnostics through Spawner', () => {
  const verdict = evaluateDeterministicRoute(
    'spawner.build',
    'Run a deliberately slow no-edit Mission Control diagnostic through Spawner. It should only prove live running-state UI and reply with SPARK_E2E_SLOW_NO_EDIT_OK after waiting about 30 seconds. Do not create files, do not edit files.'
  );

  assert.equal(verdict.allow, true);
  assert.equal(verdict.reason, 'explicit_spawner_no_edit_mission');
  assert.equal(verdict.confidence, 'explicit');
});

test('uses the firewall as a broad route-arbitration smoke matrix', () => {
  const cases: Array<{
    name: string;
    route: DeterministicRouteId;
    prompt: string;
    allow: boolean;
    reason?: string;
  }> = [
    {
      name: 'access design talk is chat, not access mutation',
      route: 'access.change',
      prompt: 'how can we make sure access level 4 creates the right setup for access level to be really 4?',
      allow: false,
      reason: 'plain_chat_protected'
    },
    {
      name: 'deterministic bug audit is chat, not build',
      route: 'spawner.build',
      prompt: 'also words like build access and setup hijack the chat instantly, can you check whether we fixed that?',
      allow: false,
      reason: 'plain_chat_protected'
    },
    {
      name: 'restart UX question is chat, not diagnostics',
      route: 'diagnostics.scan',
      prompt: 'what does restart Spark mean for users after access 5 confirmation?',
      allow: false,
      reason: 'plain_chat_protected'
    },
    {
      name: 'upgrade strategy is chat, not mission',
      route: 'spawner.contextual_mission',
      prompt: 'what else would be healthy to build for updates/upgrades besides the ledger?',
      allow: false,
      reason: 'plain_chat_protected'
    },
    {
      name: 'tokenomics allocation question is chat, not a fast build',
      route: 'spawner.build',
      prompt: 'we already have a big community airdrop that we promised so it needs to be around 20% imo. and team 10% makes sense wondering what if we make liquidity dex 5% would it be too small or good enough, and then we could have some more stuff for ecosystem rewards.',
      allow: false,
      reason: 'plain_chat_protected'
    },
    {
      name: 'bug-hunt QA is chat, not pending domain chip execution',
      route: 'domain_chip.pending',
      prompt: 'prepare a huge unit test and let us become bug hunters for Mission Control and Spawner workflow',
      allow: false,
      reason: 'plain_chat_protected'
    },
    {
      name: 'explicit project still builds',
      route: 'spawner.build',
      prompt: 'Build a private local-first dashboard for memory reports. It should show stale context, source labels, and review queues.',
      allow: true
    },
    {
      name: 'explicit diagnostics still runs',
      route: 'diagnostics.scan',
      prompt: 'Run diagnostics now.',
      allow: true,
      reason: 'explicit_diagnostics_run'
    },
    {
      name: 'short pending confirmation still works',
      route: 'spawner.pending_clarification',
      prompt: 'go',
      allow: true,
      reason: 'short_pending_confirmation'
    },
    {
      name: 'bare yes does not start stale pending domain chip work',
      route: 'domain_chip.pending',
      prompt: 'yes',
      allow: false,
      reason: 'ambiguous_pending_domain_chip_confirmation'
    },
    {
      name: 'explicit pending domain chip start still works',
      route: 'domain_chip.pending',
      prompt: 'yes create it',
      allow: true
    },
    {
      name: 'explicit provider run still works',
      route: 'natural_run',
      prompt: 'ask claude to review this plan',
      allow: true,
      reason: 'explicit_provider_run'
    },
    {
      name: 'canvas plan lookup is chat, not a new build',
      route: 'spawner.build',
      prompt: 'For QA, show the latest canvas plan and skills for the H70 Orbit Proof build. Do not start anything new.',
      allow: false,
      reason: 'no_execution_boundary'
    },
    {
      name: 'no build or mission boundary blocks build route',
      route: 'spawner.build',
      prompt: 'No build or mission for now, just help me think through the QA plan.',
      allow: false,
      reason: 'no_execution_boundary'
    }
  ];

  for (const entry of cases) {
    const verdict = evaluateDeterministicRoute(entry.route, entry.prompt);
    assert.equal(verdict.allow, entry.allow, entry.name);
    if (entry.reason) assert.equal(verdict.reason, entry.reason, entry.name);
  }
});
