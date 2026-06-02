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

test('allows explicit memory updates even when they mention plans', () => {
  const verdict = evaluateDeterministicRoute(
    'memory.write',
    'Memory update: my current plan is Neon Harbor Telegram memory test. Please save this as my current plan.'
  );

  assert.equal(verdict.allow, true);
  assert.equal(verdict.reason, 'explicit_memory_write');
  assert.equal(verdict.confidence, 'explicit');
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

test('allows local self-improvement canaries while publication is blocked', () => {
  const prompt = [
    'Run a startup self-improvement canary from Telegram.',
    'Do not publish, merge, or claim public/network readiness.',
    'First produce a baseline answer, then run the startup self-improvement loop, produce an improved answer, and run a blind jury verdict.',
    'Keep the proof boundary honest.'
  ].join(' ');

  const verdict = evaluateDeterministicRoute('spark.self_improvement', prompt);

  assert.equal(verdict.allow, true);
  assert.equal(verdict.reason, 'self_improvement_canary_local_only');
  assert.equal(verdict.confidence, 'explicit');

  const blocked = evaluateDeterministicRoute(
    'spark.self_improvement',
    'Do not run a startup self-improvement canary yet. Just talk through the proof boundary.'
  );
  assert.equal(blocked.allow, false);
  assert.equal(blocked.reason, 'no_execution_boundary');
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
