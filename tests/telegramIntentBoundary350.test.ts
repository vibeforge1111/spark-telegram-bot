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

interface BoundaryCase {
  id: string;
  prompt: string;
  route: DeterministicRouteId;
  allow: boolean;
  reason?: string;
}

const interruptiveRoutes: DeterministicRouteId[] = [
  'access.change',
  'spawner.build',
  'spawner.pending_clarification',
  'spawner.default_build',
  'spawner.contextual_mission',
  'spawner.contextual_improvement',
  'spawner.project_iteration',
  'spawner.external_research',
  'diagnostics.scan',
  'diagnostics.followup_test',
  'domain_chip.create',
  'creator.mission',
  'recursive.proposal',
  'spark.self_improvement',
  'memory.write',
  'natural_run',
  'pending_task.recovery',
  'local_workspace.inspect',
  'mission_updates.preference',
  'domain_chip.pending'
];

const actionTerms = [
  'build',
  'mission',
  'chip',
  'run',
  'schedule',
  'Codex',
  'provider',
  'memory',
  'wiki',
  'access',
  'scaffold',
  'create',
  'publish',
  'deploy',
  'remember',
  'draft',
  'loop',
  'route',
  'Spawner',
  'Canvas'
];

const noActionWrappers = [
  (term: string) => `The word "${term}" is a quoted bug-report term, not a command; do not start anything.`,
  (term: string) => `I am mentioning ${term} as a keyword here; no need to run or launch anything.`,
  (term: string) => `${term} appears in this sentence as meta-language; stay in chat and explain the boundary.`,
  (term: string) => `Bug report: ${term} hijacked routing before; do not create a mission.`,
  (term: string) => `This is not a request to ${term}; just explain the failure class.`,
  (term: string) => `We can talk here about ${term}; do not build or scaffold anything.`,
  (term: string) => `Only discussing the phrase ${term}; do not route it.`,
  (term: string) => `QA case for ${term}: words alone should not execute.`
];

function negativeCases(): BoundaryCase[] {
  return actionTerms.flatMap((term, termIndex) =>
    noActionWrappers.map((render, wrapperIndex) => ({
      id: `negative-${termIndex}-${wrapperIndex}`,
      prompt: render(term),
      route: interruptiveRoutes[(termIndex + wrapperIndex) % interruptiveRoutes.length],
      allow: false,
      reason: 'no_execution_boundary'
    }))
  );
}

function buildCases(): BoundaryCase[] {
  return Array.from({ length: 25 }, (_, index) => ({
    id: `build-${index}`,
    prompt: `Build this at /Users/alchemistab/Documents/SparkProjects/intent-build-${index}: a local dashboard with source labels, route history, and a README smoke test.`,
    route: 'spawner.build' as const,
    allow: true,
    reason: 'concrete_project_build'
  }));
}

function localBuildSafetyCases(): BoundaryCase[] {
  const endings = [
    'Do not publish it.',
    'Do not deploy it.',
    'Keep it local only.',
    'No public claim yet.',
    'Network absorbable false until review.'
  ];
  return Array.from({ length: 15 }, (_, index) => ({
    id: `local-build-safety-${index}`,
    prompt: `Build this at /Users/alchemistab/Documents/SparkProjects/local-proof-${index}: a private local-first proof page. ${endings[index % endings.length]}`,
    route: 'spawner.build' as const,
    allow: true,
    reason: 'concrete_project_build_local_only'
  }));
}

function memoryCases(): BoundaryCase[] {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `memory-${index}`,
    prompt: `Remember that intent regression case ${index} must preserve explicit memory writes without routing to build.`,
    route: 'memory.write' as const,
    allow: true,
    reason: 'explicit_memory_write'
  }));
}

function accessCases(): BoundaryCase[] {
  return Array.from({ length: 15 }, (_, index) => ({
    id: `access-${index}`,
    prompt: `Change this chat to access level ${(index % 5) + 1}.`,
    route: 'access.change' as const,
    allow: true,
    reason: 'explicit_access_change'
  }));
}

function diagnosticsCases(): BoundaryCase[] {
  return Array.from({ length: 15 }, (_, index) => ({
    id: `diagnostics-${index}`,
    prompt: index % 2 === 0 ? 'Run diagnostics now.' : 'Please perform a fresh diagnostic scan again.',
    route: 'diagnostics.scan' as const,
    allow: true,
    reason: 'explicit_diagnostics_run'
  }));
}

function providerRunCases(): BoundaryCase[] {
  const providers = ['claude', 'codex', 'minimax', 'zai', 'glm', 'openrouter', 'all models'];
  return Array.from({ length: 20 }, (_, index) => ({
    id: `provider-run-${index}`,
    prompt: `ask ${providers[index % providers.length]} to review route-boundary case ${index}`,
    route: 'natural_run' as const,
    allow: true,
    reason: 'explicit_provider_run'
  }));
}

function externalResearchCases(): BoundaryCase[] {
  const verbs = ['Research', 'Inspect', 'Compare', 'Look into', 'Analyze'];
  return Array.from({ length: 15 }, (_, index) => ({
    id: `external-research-${index}`,
    prompt: `${verbs[index % verbs.length]} the latest public docs and GitHub repos for intent routing pattern ${index}.`,
    route: 'spawner.external_research' as const,
    allow: true,
    reason: 'explicit_external_research'
  }));
}

function selfImprovementCases(): BoundaryCase[] {
  return Array.from({ length: 15 }, (_, index) => ({
    id: `self-improvement-${index}`,
    prompt: `What should Spark improve next as an agent using weak-spot evidence and safe probe ${index}?`,
    route: 'spark.self_improvement' as const,
    allow: true,
    reason: 'explicit_spark_self_improvement'
  }));
}

function creatorCases(): BoundaryCase[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `creator-${index}`,
    prompt: `Stage a private creator mission for Telegram route QA case ${index}. Do not publish it.`,
    route: 'creator.mission' as const,
    allow: true,
    reason: 'creator_mission_plan_only'
  }));
}

function domainChipCases(): BoundaryCase[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `domain-chip-${index}`,
    prompt: `Build a domain-chip for Telegram intent boundary case ${index}.`,
    route: 'domain_chip.create' as const,
    allow: true
  }));
}

function mixedIntentCases(): BoundaryCase[] {
  const prompts = [
    'Build a local route QA app, but do not build yet. Just explain the plan.',
    'Run a mission is a phrase here, not a command; stay in chat.',
    'Remember is a keyword here, do not save memory.',
    'Codex and provider are terms in this bug report, not a request.',
    'No build or mission for now, just tell me the next test.',
    'Do not create a domain chip; explain when one would be useful.',
    'Schedule is just a word here, do not schedule anything.',
    'Access level is a topic here, not a request to change access.',
    'We can discuss Spawner here, no need to launch anything.',
    'The phrase publish this is quoted text, not an instruction.'
  ];
  return Array.from({ length: 30 }, (_, index) => ({
    id: `mixed-${index}`,
    prompt: `${prompts[index % prompts.length]} Case ${index}.`,
    route: interruptiveRoutes[index % interruptiveRoutes.length],
    allow: false,
    reason: 'no_execution_boundary'
  }));
}

const cases: BoundaryCase[] = [
  ...negativeCases(),
  ...buildCases(),
  ...localBuildSafetyCases(),
  ...memoryCases(),
  ...accessCases(),
  ...diagnosticsCases(),
  ...providerRunCases(),
  ...externalResearchCases(),
  ...selfImprovementCases(),
  ...creatorCases(),
  ...domainChipCases(),
  ...mixedIntentCases()
];

test('Telegram intent boundary matrix has exactly 350 generated messages', () => {
  assert.equal(cases.length, 350);
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
});

test('Telegram intent boundary matrix blocks hijacks and preserves explicit intents quickly', () => {
  const startedAt = Date.now();
  const failures: string[] = [];

  for (const item of cases) {
    const verdict = evaluateDeterministicRoute(item.route, item.prompt);
    if (verdict.allow !== item.allow) {
      failures.push(`${item.id}: allow ${String(verdict.allow)} !== ${String(item.allow)} route=${item.route} reason=${verdict.reason}`);
      continue;
    }
    if (item.reason && verdict.reason !== item.reason) {
      failures.push(`${item.id}: reason ${verdict.reason} !== ${item.reason} route=${item.route}`);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  assert.deepEqual(failures, []);
  assert.ok(elapsedMs < 3000, `350-message boundary matrix should stay fast; elapsed=${elapsedMs}ms`);
});
