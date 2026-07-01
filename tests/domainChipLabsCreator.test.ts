import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import { parseNaturalChipCreateIntent, parseNaturalCreatorMissionIntent } from '../src/conversationIntent';
import {
  DOMAIN_CHIP_LABS_CONTRACT_ITEMS,
  domainChipLabsContractKeys,
  domainChipLabsCreatorContractLines,
  domainChipLabsEvidenceStandardLine,
  domainChipLabsEvidenceSurfaceLine,
  formatDomainChipLabsContractProofLine,
  validateDomainChipLabsContractPacket
} from '../src/domainChipLabsCreatorContract';
import { decideNaturalRoute } from '../src/naturalRouteDecision';
import {
  PENDING_CREATOR_MISSION_TTL_MS,
  deletePendingCreatorMission,
  getPendingCreatorMission,
  rememberPendingCreatorMission,
  telegramPendingCreatorMissionKey
} from '../src/telegramPendingCreatorMissionEvidence';
import {
  DOMAIN_CHIP_BUILD_TTL_MS,
  deletePendingDomainChipBuild,
  getPendingDomainChipBuild,
  rememberPendingDomainChipBuild,
  telegramPendingDomainChipKey
} from '../src/telegramPendingDomainChipEvidence';
import { buildDomainChipPrd, renderDomainChipNoActionAdvisoryReply } from '../src/domainChipBuild';
import { createChipFromPrompt } from '../src/chipCreate';
import { resetJsonStateForTests } from '../src/jsonState';

type CapturedCall = { url: string; body: any };

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  const originalGatewayStateDir = process.env.SPARK_GATEWAY_STATE_DIR;
  const testStateDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-test-state-'));
  try {
    resetJsonStateForTests();
    process.env.SPARK_GATEWAY_STATE_DIR = testStateDir;
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  } finally {
    resetJsonStateForTests();
    if (originalGatewayStateDir === undefined) {
      delete process.env.SPARK_GATEWAY_STATE_DIR;
    } else {
      process.env.SPARK_GATEWAY_STATE_DIR = originalGatewayStateDir;
    }
    rmSync(testStateDir, { recursive: true, force: true });
  }
}

function makeCtx(replies: string[]) {
  return {
    chat: { id: 8319079055 },
    from: { id: 8319079055, username: 'cem' },
    message: { message_id: 56321, text: DCL_PROMPT },
    update: { update_id: 56321 },
    sendChatAction: async (_action: string) => {},
    reply: async (text: string) => {
      replies.push(text);
    }
  };
}

function humanOnboardingScore(reply: string): number {
  let score = 0;
  const paragraphs = reply.split(/\n\n+/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length >= 3) score += 1;
  if (paragraphs.every((part) => part.split(/\s+/).length <= 36)) score += 1;
  if (/private Domain Chip/i.test(reply)) score += 1;
  if (/A Domain Chip is a reusable Spark playbook/i.test(reply)) score += 1;
  if (/trigger|checklist|examples|eval|watchtower/i.test(reply)) score += 1;
  if (/Reply "go"/.test(reply) && /tell me the first use case/i.test(reply)) score += 1;
  if (!/Advanced PRD|router boundaries|activation notes|DCL scaffold|external API|Recommended path/i.test(reply)) score += 1;
  if (!/Mission:|Provider:|Move:|Status:/i.test(reply)) score += 1;
  if (!/[^\n]\n[^\n]/.test(reply)) score += 1;
  if (reply.length <= 520) score += 1;
  return score;
}

async function testDomainChipNoActionAdvisoryProfiles() {
  const projectMaintenance = renderDomainChipNoActionAdvisoryReply('Project Maintenance Steward');
  assert.match(projectMaintenance, /dirty-work boundaries/i);
  assert.match(projectMaintenance, /failing-test symptoms/i);
  assert.match(projectMaintenance, /stale TODO ownership/i);
  assert.match(projectMaintenance, /doc-drift risk/i);
  assert.match(projectMaintenance, /would not read or edit files, run tests/i);
  assert.doesNotMatch(projectMaintenance, /source dates\/freshness|external sources|send alerts/i);

  const operations = renderDomainChipNoActionAdvisoryReply('Operations Research Watchdesk');
  assert.match(operations, /source dates\/freshness/i);
  assert.match(operations, /facts versus hypotheses/i);
  assert.match(operations, /would not browse, call external sources/i);
}

const DCL_PROMPT =
  'create a domain chip according to the Spark Domain Chip Labs framework with self-improving loops, benchmark pack, watchtower, and verifiable loop engineering for founder objection handling';
const PENDING_KEY = telegramPendingCreatorMissionKey(8319079055, 8319079055);
const DOMAIN_CHIP_PENDING_KEY = telegramPendingDomainChipKey(8319079055, 8319079055);
const MULTI_DOMAIN_DCL_CASES = [
  {
    domain: 'creative/media',
    shallow: 'build a domain chip for short-form video hook selection',
    creator: 'create a Spark Domain Chip Labs framework with benchmark pack, watchtower, verifiable loop engineering, and specialization path for short-form video hook selection',
    brief: /short[-\s]form video hook selection/i
  },
  {
    domain: 'operations',
    shallow: 'build a domain chip for warehouse shift handoff checklists',
    creator: 'create a Spark Domain Chip Labs framework with benchmark pack, watchtower, verifiable loop engineering, and specialization path for warehouse shift handoff checklists',
    brief: /warehouse shift handoff checklists/i
  },
  {
    domain: 'research',
    shallow: 'build a domain chip for literature review source triage',
    creator: 'create a Spark Domain Chip Labs framework with benchmark pack, watchtower, verifiable loop engineering, and specialization path for literature review source triage',
    brief: /literature review source triage/i
  },
  {
    domain: 'coding/tooling',
    shallow: 'build a domain chip for pull request risk review',
    creator: 'create a Spark Domain Chip Labs framework with benchmark pack, watchtower, verifiable loop engineering, and specialization path for pull request risk review',
    brief: /pull request risk review/i
  },
  {
    domain: 'coaching/advisory',
    shallow: 'build a domain chip for founder objection coaching',
    creator: 'create a Spark Domain Chip Labs framework with benchmark pack, watchtower, verifiable loop engineering, and specialization path for founder objection coaching',
    brief: /founder objection coaching/i
  }
] as const;

function verifiedDclPacket(): Record<string, unknown> {
  const packet: Record<string, unknown> = {};
  for (const item of DOMAIN_CHIP_LABS_CONTRACT_ITEMS) {
    packet[item.key] = {
      status: 'verified',
      evidence_ref: `evidence:${item.key}`
    };
  }
  return packet;
}

function assertDclContract(text: string): void {
  assert.match(text, /Domain Chip Labs artifact contract/);
  assert.match(text, /purpose, triggers, non-triggers, playbook, examples/);
  assert.match(text, /manifest\/hook contract/);
  assert.match(text, /score dimensions, allowed mutations, forbidden mutations/);
  assert.match(text, /watchtower, rollback, review packet, and activation notes/);
  assert.match(text, /Verifiable loop engineering/);
  assert.match(text, /held-out checks, trap checks, no-op checks/);
  assert.match(text, /consumer transfer, adversary report, blind judge scorecard/);
}

async function run(): Promise<void> {
await test('domain chip no-action advisory stays domain-specific', testDomainChipNoActionAdvisoryProfiles);

await test('DCL contract checklist is reusable and complete', () => {
  const keys = domainChipLabsContractKeys();
  assert.equal(new Set(keys).size, keys.length);
  for (const required of [
    'purpose',
    'triggers',
    'non_triggers',
    'playbook',
    'examples',
    'manifest_hook_contract',
    'evals',
    'benchmark_pack',
    'score_dimensions',
    'allowed_mutations',
    'forbidden_mutations',
    'evidence_ladder',
    'privacy_boundary',
    'watchtower',
    'rollback',
    'review_packet',
    'activation_notes',
    'baseline_candidate_comparison',
    'held_out_checks',
    'trap_checks',
    'no_op_checks',
    'watchtower_regressions',
    'promotion_block',
    'hard_blocker_verdict',
    'consumer_transfer',
    'adversary_report',
    'blind_judge_scorecard',
    'safety_judge_verdict',
    'ux_judge_score'
  ]) {
    assert.ok(keys.includes(required), `missing DCL contract key ${required}`);
  }
  assert.ok(DOMAIN_CHIP_LABS_CONTRACT_ITEMS.some((item) => item.group === 'artifact' && item.requiredFor === 'starter_kit'));
  assert.ok(DOMAIN_CHIP_LABS_CONTRACT_ITEMS.some((item) => item.group === 'loop' && item.requiredFor === 'loop_engineering'));
  assert.ok(DOMAIN_CHIP_LABS_CONTRACT_ITEMS.some((item) => item.group === 'promotion' && item.requiredFor === 'promotion_review'));
  assert.ok(DOMAIN_CHIP_LABS_CONTRACT_ITEMS.some((item) => item.group === 'review' && item.requiredFor === 'promotion_review'));

  const lines = domainChipLabsCreatorContractLines().join(' ');
  assertDclContract(lines);
  assert.match(domainChipLabsEvidenceStandardLine(), /purpose, triggers, non-triggers/);
  assert.match(domainChipLabsEvidenceStandardLine(), /consumer transfer, adversary report, blind judge scorecard/);
  assert.equal(domainChipLabsEvidenceSurfaceLine(), 'starter kit (17 checks), loop proof (5 checks), and promotion review (7 checks)');
});

await test('DCL contract packet validator blocks missing and unverified promotion proof', () => {
  const starterOnly = {
    purpose: 'PR risk review',
    triggers: ['pull request mentions risk'],
    non_triggers: ['general coding chat'],
    playbook: ['scan diff', 'rank risk'],
    examples: ['migration PR'],
    manifest_hook_contract: { manifest: 'domain-chip/manifest.json' },
    evals: ['route drift eval'],
    benchmark_pack: { status: 'verified' },
    score_dimensions: ['precision', 'coverage'],
    allowed_mutations: ['prompt examples'],
    forbidden_mutations: ['publish without approval'],
    evidence_ladder: 'local proof first',
    privacy_boundary: 'private workspace',
    watchtower: { status: 'verified' },
    rollback: { status: 'verified' },
    review_packet: { status: 'verified' },
    activation_notes: 'manual activation only'
  };

  const starterResult = validateDomainChipLabsContractPacket(starterOnly, 'starter_kit');
  assert.equal(starterResult.ok, true);
  assert.deepEqual(starterResult.missingKeys, []);
  assert.deepEqual(starterResult.presentUnverifiedKeys, []);

  const loopResult = validateDomainChipLabsContractPacket(starterOnly, 'loop_engineering');
  assert.equal(loopResult.ok, false);
  assert.deepEqual(loopResult.missingKeys, [
    'baseline_candidate_comparison',
    'held_out_checks',
    'trap_checks',
    'no_op_checks',
    'watchtower_regressions'
  ]);

  const unverifiedPromotionPacket = {
    ...verifiedDclPacket(),
    blind_judge_scorecard: { status: 'present_unverified' },
    hard_blocker_verdict: { verified: false },
    consumer_transfer: 'present_unverified'
  };
  const unverifiedResult = validateDomainChipLabsContractPacket(unverifiedPromotionPacket, 'promotion_review');
  assert.equal(unverifiedResult.ok, false);
  assert.deepEqual(unverifiedResult.missingKeys, []);
  assert.deepEqual(unverifiedResult.presentUnverifiedKeys, [
    'hard_blocker_verdict',
    'consumer_transfer',
    'blind_judge_scorecard'
  ]);
  assert.match(unverifiedResult.summary, /present but unverified/);

  const verifiedResult = validateDomainChipLabsContractPacket(verifiedDclPacket(), 'promotion_review');
  assert.equal(verifiedResult.ok, true);
  assert.equal(verifiedResult.requiredKeys.length, DOMAIN_CHIP_LABS_CONTRACT_ITEMS.length);
  assert.deepEqual(verifiedResult.missingKeys, []);
  assert.deepEqual(verifiedResult.presentUnverifiedKeys, []);
  assert.equal(formatDomainChipLabsContractProofLine({}), 'Contract proof: not attached yet.');
  assert.equal(
    formatDomainChipLabsContractProofLine({ domain_chip_labs_contract_packet: unverifiedPromotionPacket }),
    'Contract proof: promotion review blocked; needs verified proof for hard-blocker verdict, consumer transfer, and blind judge scorecard (0 missing, 3 need verification).'
  );
  assert.equal(
    formatDomainChipLabsContractProofLine({ contract_packet: verifiedDclPacket() }),
    'Contract proof: promotion review verified.'
  );
});

await test('DCL contract packet validator blocks false-valued promotion proof', () => {
  const falsePacket: Record<string, unknown> = {};
  for (const key of domainChipLabsContractKeys()) {
    falsePacket[key] = false;
  }

  const result = validateDomainChipLabsContractPacket(falsePacket, 'promotion_review');
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingKeys, []);
  assert.deepEqual(result.presentUnverifiedKeys, domainChipLabsContractKeys());
  assert.equal(
    formatDomainChipLabsContractProofLine({ domain_chip_labs_contract_packet: falsePacket }),
    'Contract proof: promotion review blocked; needs verified proof for purpose, triggers, non-triggers, and 26 more (0 missing, 29 need verification).'
  );
});

await test('DCL framework parser and route preserve full creator contract', () => {
  const parsed = parseNaturalCreatorMissionIntent(DCL_PROMPT);
  assert.equal(parsed?.privacyMode, 'local_only');
  assert.equal(parsed?.riskLevel, 'medium');
  assertDclContract(parsed?.brief || '');

  const route = decideNaturalRoute(DCL_PROMPT);
  assert.equal(route.route, 'creator.mission');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.context_source, 'latest_message');
  assert.equal(route.requires_confirmation, true);
  assertDclContract(String(route.payload.brief || ''));
});

await test('multi-domain DCL route matrix keeps preview and creator lanes distinct', () => {
  for (const entry of MULTI_DOMAIN_DCL_CASES) {
    const shallowBrief = parseNaturalChipCreateIntent(entry.shallow);
    assert.match(shallowBrief || '', entry.brief, `${entry.domain} shallow brief`);
    const shallowRoute = decideNaturalRoute(entry.shallow);
    assert.equal(shallowRoute.route, 'domain_chip.create', `${entry.domain} shallow route`);
    assert.equal(shallowRoute.owner_system, 'domain-chip', `${entry.domain} shallow owner`);
    assert.match(String(shallowRoute.payload.brief || ''), entry.brief, `${entry.domain} shallow route brief`);

    const creator = parseNaturalCreatorMissionIntent(entry.creator);
    assert.equal(creator?.privacyMode, 'local_only', `${entry.domain} creator privacy`);
    assert.equal(creator?.riskLevel, 'medium', `${entry.domain} creator risk`);
    assertDclContract(creator?.brief || '');
    assert.match(creator?.brief || '', entry.brief, `${entry.domain} creator brief`);
    const creatorRoute = decideNaturalRoute(entry.creator);
    assert.equal(creatorRoute.route, 'creator.mission', `${entry.domain} creator route`);
    assert.equal(creatorRoute.owner_system, 'spawner-ui', `${entry.domain} creator owner`);
    assertDclContract(String(creatorRoute.payload.brief || ''));
    assert.match(String(creatorRoute.payload.brief || ''), entry.brief, `${entry.domain} creator route brief`);
  }
});

await test('multi-domain DCL Telegram previews wait instead of starting work', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  const stateDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-preview-state-'));
  resetJsonStateForTests();
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    process.env.SPARK_GATEWAY_STATE_DIR = stateDir;
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const indexModule = await import('../src/index');
    for (const entry of MULTI_DOMAIN_DCL_CASES) {
      deletePendingCreatorMission(PENDING_KEY);
      deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
      captured.length = 0;
      const replies: string[] = [];
      const ctx = makeCtx(replies);
      ctx.message.text = entry.shallow;
      await indexModule.handleTextMessage(ctx);

      assert.match(replies.join('\n'), /I can turn this into a private Domain Chip/i, `${entry.domain} preview`);
      assert.ok(humanOnboardingScore(replies.join('\n')) >= 9, `${entry.domain} preview should score 9+/10 for human onboarding`);
      const pending = getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
      assert.ok(pending, `${entry.domain} stores pending preview`);
      assert.match(pending?.brief || '', entry.brief, `${entry.domain} pending brief names domain`);
      assert.match(pending?.prd || '', /complete private Domain Chip starter kit/i, `${entry.domain} pending PRD asks for a starter kit`);
      assert.match(pending?.prd || '', /domain-chip\/manifest\.json/i, `${entry.domain} pending PRD includes chip manifest`);
      assert.match(pending?.prd || '', /benchmark\/manifest\.json/i, `${entry.domain} pending PRD includes benchmark manifest`);
      assert.match(pending?.prd || '', /autoloop\/policy\.json/i, `${entry.domain} pending PRD includes autoloop policy`);
      assert.match(pending?.prd || '', /reports\/review_packet\.md/i, `${entry.domain} pending PRD includes readable review packet`);
      assert.equal(getPendingCreatorMission(PENDING_KEY), null, `${entry.domain} does not stage creator mission`);
      assert.equal(captured.length, 0, `${entry.domain} preview should not call Spawner or PRD bridge`);
    }
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    resetJsonStateForTests();
    rmSync(stateDir, { recursive: true, force: true });
  }
});

await test('operations watchdesk source-freshness chip request reaches private preview', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPARK_BOT_TEST_MODE = '1';

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = makeCtx(replies);
    ctx.message.text = [
      'Create a private local Domain Chip starter preview for Operations Research Watchdesk R30 Bridge QA.',
      'This is an explicit chip creation request, but preview only for now.',
      'The chip should handle evidence briefs, stale or conflicting sources, fact versus hypothesis separation, source freshness, and operator recommendations only.',
      'Do not run benchmarks, autoloops, sends, alerts, activation, publishing, registry changes, or network absorption.',
      'Show the private starter preview and ask me for go before creating files.'
    ].join(' ');

    await indexModule.handleTextMessage(ctx);

    const reply = replies.join('\n');
    assert.match(reply, /I can turn this into a private Domain Chip/i);
    assert.match(reply, /domain-chip-operations-research-watchdesk-r30-bridge/i);
    assert.doesNotMatch(reply, /without browsing|current docs|external network call/i);
    assert.doesNotMatch(reply, /Loop Engineering plan ready|Workspace Canvas|Board:/i);
    assert.ok(humanOnboardingScore(reply) >= 9);
    const pending = getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    assert.ok(pending);
    assert.match(pending?.brief || '', /Operations Research Watchdesk R30 Bridge QA/i);
    assert.equal(captured.length, 0, 'preview should not call Spawner or create files');
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('private domain-chip Telegram preview names the requested domain, not wrapper words', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = makeCtx(replies);
    ctx.message.text = 'Build a private Domain Chip for customer escalation readiness review';
    await indexModule.handleTextMessage(ctx);

    const reply = replies.join('\n');
    assert.match(reply, /I can turn this into a private Domain Chip: domain-chip-customer-escalation-readiness-review\./);
    assert.doesNotMatch(reply, /domain-chip-private-domain-chip-for-customer/);
    assert.ok(humanOnboardingScore(reply) >= 9, 'preview should stay readable for first-time users');
    const pending = getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    assert.equal(pending?.brief, 'customer escalation readiness review');
    assert.equal(pending?.projectName, 'domain-chip-customer-escalation-readiness-review');
    assert.match(pending?.prd || '', /Natural-language chip brief: customer escalation readiness review/);
    assert.equal(captured.length, 0, 'preview should not call Spawner, Builder, or PRD bridge');
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('DCL framework Telegram turn stages full creator mission through Spawner', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  const captured: CapturedCall[] = [];
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      if (url.includes('/api/creator/mission')) {
        return {
          data: {
            ok: true,
            missionId: 'mission-creator-dcl-founder-objections',
            taskCount: 9,
            canvasUrl: 'http://127.0.0.1:3333/canvas?mission=mission-creator-dcl-founder-objections'
          }
        };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    await indexModule.handleTextMessage(makeCtx(replies));

    const creatorCall = captured.find((call) => call.url.includes('/api/creator/mission'));
    assert.ok(creatorCall, 'DCL framework prompt should stage creator mission');
    assert.ok(!captured.some((call) => call.url.includes('/api/prd-bridge/write')), 'DCL framework prompt should not use generic PRD bridge');
    assert.equal(creatorCall?.body?.executionPolicy, 'manual_run');
    assert.equal(creatorCall?.body?.privacyMode, 'local_only');
    assert.match(String(creatorCall?.body?.brief || ''), /Requested artifact: Loop Engineering system/);
    assertDclContract(String(creatorCall?.body?.brief || ''));
    assert.match(replies.join('\n'), /stage the Loop Engineering system privately first/i);
    assert.match(replies.join('\n'), /Loop Engineering contract: intent packet, adapter map, artifact manifest, domain chip, starter kit \(17 checks\), loop proof \(5 checks\), and promotion review \(7 checks\)/);
    assert.doesNotMatch(replies.join('\n'), /consumer transfer, adversary report, blind judge scorecard, safety judge verdict, UX judge score/);
    assert.doesNotMatch(replies.join('\n'), /I can build this as domain-chip/i);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('DCL framework Telegram turn fails closed when Spawner omits mission proof', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    (axios as any).post = async (url: string) => {
      if (url.includes('/api/creator/mission')) {
        return { data: { ok: true, taskCount: 5 } };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    await indexModule.handleTextMessage(makeCtx(replies));

    const replyText = replies.join('\n');
    assert.match(replyText, /stage the Loop Engineering system privately first/i);
    assert.match(replyText, /Loop Engineering staging failed/i);
    assert.match(replyText, /missing mission id or staged artifact proof/i);
    assert.doesNotMatch(replyText, /Loop Engineering plan ready|Private path staged|Loop Engineering plan is staged/i);
    assert.equal(getPendingCreatorMission(PENDING_KEY), null);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('DCL framework Telegram turn remembers pending state from trace mission proof', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    (axios as any).post = async (url: string) => {
      if (url.includes('/api/creator/mission')) {
        return {
          data: {
            ok: true,
            taskCount: 5,
            trace: {
              mission_id: 'mission-creator-trace-only',
              execution_policy: 'manual_run',
              artifacts: ['domain_chip', 'benchmark_pack']
            }
          }
        };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    await indexModule.handleTextMessage(makeCtx(replies));

    assert.match(replies.join('\n'), /5 tasks queued/);
    assert.match(replies.join('\n'), /say: run it/);
    assert.equal(getPendingCreatorMission(PENDING_KEY)?.missionId, 'mission-creator-trace-only');
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('DCL framework Telegram turn keeps staged artifact proof review-only', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    (axios as any).post = async (url: string) => {
      if (url.includes('/api/creator/mission')) {
        return {
          data: {
            ok: true,
            taskCount: 4,
            reviewPath: '/creator/review/tg-creator-review-only',
            trace: {
              execution_policy: 'manual_run',
              artifacts: ['domain_chip', 'benchmark_pack']
            }
          }
        };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    await indexModule.handleTextMessage(makeCtx(replies));

    const replyText = replies.join('\n');
    assert.match(replyText, /4 tasks staged/);
    assert.match(replyText, /Review: http:\/\/stub-spawner\.test\/creator\/review\/tg-creator-review-only/);
    assert.doesNotMatch(replyText, /say: run it/);
    assert.doesNotMatch(replyText, /kanban\?mission=staged-review/);
    assert.equal(getPendingCreatorMission(PENDING_KEY), null);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('direct domain-chip request outranks stale recursive benchmark context', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const indexModule = await import('../src/index');
    const conversationModule = await import('../src/conversation');
    const originalGetRecentMessages = conversationModule.conversation.getRecentMessages.bind(conversationModule.conversation);
    (conversationModule.conversation as any).getRecentMessages = async () => [
      'Startup Bench shows local movement: baseline 0.641, candidate 0.866.',
      'Compare baseline vs candidate for Startup YC and show the proof gates.'
    ];

    try {
      const replies: string[] = [];
      const ctx = makeCtx(replies);
      ctx.message.text = [
        'Build a private Domain Chip for daily schedule reliability proof run.',
        'It should handle recurring tasks, timezone/date ambiguity, missed-window recovery, conflicting reminders, and approval-gated reminder creation.',
        'Include benchmark evals, held-out/trap/no-op cases, autoloop policy, watchtower, rollback, safety/adversary/consumer-transfer proof gates, and beginner-readable Telegram receipts.',
        'Keep it private/local; no publishing, activation, or real reminder sends.'
      ].join(' ');

      await indexModule.handleTextMessage(ctx);

      const reply = replies.join('\n');
      assert.match(reply, /I can turn this into a private Domain Chip: domain-chip-daily-schedule-reliability-proof-run\./);
      assert.doesNotMatch(reply, /Startup Bench|Public-ready|Network-absorbable/i);
      const pending = getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
      assert.equal(pending?.projectName, 'domain-chip-daily-schedule-reliability-proof-run');
      assert.match(pending?.brief || '', /daily schedule reliability proof run/i);
      assert.equal(captured.length, 0, 'preview should not call Spawner, Builder, PRD bridge, or recursive runner');
    } finally {
      (conversationModule.conversation as any).getRecentMessages = originalGetRecentMessages;
    }
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('fresh domain-chip preview clears older creator pending state before go', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-fresh-go-'));
  const fakeBuilder = path.join(tempDir, 'fake-chip-builder.js');
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    writeFileSync(fakeBuilder, [
      '#!/usr/bin/env node',
      'process.stdout.write(JSON.stringify({',
      '  ok: true,',
      '  chip_key: "domain-chip-crafting-founder-objection-handling",',
      '  chip_path: "/tmp/private-domain-chip/domain-chip-crafting-founder-objection-handling",',
      '  router_invokable: false,',
      '  warnings: []',
      '}));'
    ].join('\n'));
    chmodSync(fakeBuilder, 0o755);

    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_BUILDER_REPO = tempDir;
    process.env.SPARK_BUILDER_PYTHON = fakeBuilder;
    process.env.SPARK_MISSION_CONTROL_DISABLED = '1';

    rememberPendingCreatorMission(PENDING_KEY, {
      missionId: 'mission-creator-old-pending',
      timestamp: Date.now()
    });

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      if (url.includes('/api/creator/mission/execute')) {
        return { data: { ok: true, missionId: body?.missionId, started: true } };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const previewCtx = makeCtx(replies);
    previewCtx.message.text = 'shall we build a domain chip together for crafting founder objection handling playbooks';
    await indexModule.handleTextMessage(previewCtx);

    assert.match(replies.join('\n'), /I can turn this into a private Domain Chip/i);
    assert.equal(getPendingCreatorMission(PENDING_KEY), null, 'fresh domain-chip intent should clear stale creator pending state');
    assert.ok(getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY), 'fresh domain-chip preview should be the active pending state');

    const goCtx = makeCtx(replies);
    goCtx.message.text = 'go';
    await indexModule.handleTextMessage(goCtx);

    assert.match(replies.join('\n'), /Domain Chip created: domain-chip-crafting-founder-objection-handling/);
    assert.ok(!captured.some((call) => call.url.includes('/api/prd-bridge/write')), 'go should use the chip scaffolder, not the PRD bridge');
    assert.ok(!captured.some((call) => call.url.includes('/api/creator/mission/execute')), 'go must not execute the older creator mission');
    assert.equal(getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY), null);
    assert.equal(getPendingCreatorMission(PENDING_KEY), null);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

await test('pending creator mission accepts use defaults as run confirmation', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    rememberPendingCreatorMission(PENDING_KEY, {
      missionId: 'mission-creator-defaults',
      timestamp: Date.now()
    });

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      if (url.includes('/api/creator/mission/execute')) {
        return { data: { ok: true, missionId: body?.missionId, started: true } };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = makeCtx(replies);
    ctx.message.text = 'use defaults';
    await indexModule.handleTextMessage(ctx);

    const executeCall = captured.find((call) => call.url.includes('/api/creator/mission/execute'));
    assert.ok(executeCall, 'use defaults should execute the active pending creator mission');
    assert.equal(executeCall?.body?.missionId, 'mission-creator-defaults');
    assert.ok(!captured.some((call) => call.url.includes('/api/prd-bridge/write')), 'creator defaults should not fall through to generic build');
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('pending creator mission run consumes pending state before another go', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    rememberPendingCreatorMission(PENDING_KEY, {
      missionId: 'mission-creator-consume-on-run',
      timestamp: Date.now()
    });

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      if (url.includes('/api/creator/mission/execute')) {
        return { data: { ok: true, missionId: body?.missionId, started: true } };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const firstGo = makeCtx(replies);
    firstGo.message.text = 'go';
    await indexModule.handleTextMessage(firstGo);

    assert.equal(captured.filter((call) => call.url.includes('/api/creator/mission/execute')).length, 1);
    assert.equal(getPendingCreatorMission(PENDING_KEY), null, 'successful creator mission run should clear pending state');

    const secondGo = makeCtx(replies);
    secondGo.message.text = 'go';
    await indexModule.handleTextMessage(secondGo);

    assert.equal(captured.filter((call) => call.url.includes('/api/creator/mission/execute')).length, 1, 'second go must not re-run the consumed creator mission');
    assert.match(replies[replies.length - 1] || '', /not seeing an active build or mission waiting/i);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('expired pending creator mission clears with visible no-action reply', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    rememberPendingCreatorMission(PENDING_KEY, {
      missionId: 'mission-creator-expired-pending',
      timestamp: Date.now() - PENDING_CREATOR_MISSION_TTL_MS - 1000
    });

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = makeCtx(replies);
    ctx.message.text = 'go';
    await indexModule.handleTextMessage(ctx);

    assert.equal(getPendingCreatorMission(PENDING_KEY), null);
    assert.equal(captured.length, 0, 'expired pending creator mission must not dispatch work');
    assert.match(replies[replies.length - 1] || '', /did not start anything/i);
    assert.match(replies[replies.length - 1] || '', /fresh/i);
    assert.doesNotMatch(replies[replies.length - 1] || '', /Mission:|Provider:|Move:|Status:/);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('Domain Chip Builder bridge includes builder src on PYTHONPATH', async () => {
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-pythonpath-'));
  const fakeBuilder = path.join(tempDir, 'fake-chip-builder.js');
  const builderSrc = path.join(tempDir, 'src');
  try {
    writeFileSync(fakeBuilder, [
      '#!/usr/bin/env node',
      'const path = require("node:path");',
      `const expected = ${JSON.stringify(builderSrc)};`,
      'const pythonPath = process.env.PYTHONPATH || "";',
      'const entries = pythonPath.split(path.delimiter).filter(Boolean);',
      'if (!entries.includes(expected)) {',
      '  process.stdout.write(JSON.stringify({ ok: false, error: `missing builder src in PYTHONPATH: ${pythonPath}` }));',
      '  process.exit(0);',
      '}',
      'process.stdout.write(JSON.stringify({',
      '  ok: true,',
      '  chip_key: "domain-chip-pull-request-risk-review",',
      '  chip_path: "/tmp/private-domain-chip/domain-chip-pull-request-risk-review",',
      '  router_invokable: false,',
      '  proof_artifacts: { promotion_blocked: true, network_absorbable: false },',
      '  warnings: []',
      '}));'
    ].join('\n'));
    chmodSync(fakeBuilder, 0o755);

    process.env.SPARK_BUILDER_REPO = tempDir;
    process.env.SPARK_BUILDER_PYTHON = fakeBuilder;
    process.env.SPARK_MISSION_CONTROL_DISABLED = '1';
    process.env.CHIP_CREATE_OUTPUT_DIR = path.join(tempDir, 'chips');
    process.env.CHIP_LABS_ROOT = path.join(tempDir, 'chip-labs');

    const result = await createChipFromPrompt('build a domain chip for pull request risk review');

    assert.equal(result.ok, true, result.error);
    assert.equal(result.chipKey, 'domain-chip-pull-request-risk-review');
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('pending domain-chip draft invokes Builder chips create contract from Telegram go', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-cli-contract-'));
  const fakeBuilder = path.join(tempDir, 'fake-chip-builder.js');
  const argvPath = path.join(tempDir, 'argv.json');
  const envPath = path.join(tempDir, 'env.json');
  const builderSrc = path.join(tempDir, 'src');
  const outputDir = path.join(tempDir, 'private-chips');
  const chipLabsRoot = path.join(tempDir, 'domain-chip-labs');
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    writeFileSync(fakeBuilder, [
      '#!/usr/bin/env node',
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      'fs.writeFileSync(process.env.FAKE_CHIP_ARGS_PATH, JSON.stringify(process.argv));',
      'fs.writeFileSync(process.env.FAKE_CHIP_ENV_PATH, JSON.stringify({',
      '  PYTHONPATH: process.env.PYTHONPATH || "",',
      '  CHIP_CREATE_OUTPUT_DIR: process.env.CHIP_CREATE_OUTPUT_DIR || "",',
      '  CHIP_LABS_ROOT: process.env.CHIP_LABS_ROOT || "",',
      '  SPARK_BUILDER_HOME: process.env.SPARK_BUILDER_HOME || ""',
      '}));',
      `const expectedSrc = ${JSON.stringify(builderSrc)};`,
      'if (!(process.env.PYTHONPATH || "").split(path.delimiter).includes(expectedSrc)) {',
      '  process.stdout.write(JSON.stringify({ ok: false, error: "missing builder src PYTHONPATH" }));',
      '  process.exit(0);',
      '}',
      'process.stdout.write(JSON.stringify({',
      '  ok: true,',
      '  chip_key: "domain-chip-operations-research-watchdesk-r30-bridge",',
      '  chip_path: "/tmp/private-domain-chip/domain-chip-operations-research-watchdesk-r30-bridge",',
      '  router_invokable: false,',
      '  proof_artifacts: {',
      '    benchmark_pack: true,',
      '    autoloop_policy: true,',
      '    proof_capsule: true,',
      '    promotion_blocked: true,',
      '    network_absorbable: false',
      '  },',
      '  warnings: ["No Builder provider is configured; used a local starter brief so private chip scaffolding can continue."]',
      '}));'
    ].join('\n'));
    chmodSync(fakeBuilder, 0o755);

    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_BUILDER_REPO = tempDir;
    process.env.SPARK_BUILDER_PYTHON = fakeBuilder;
    process.env.SPARK_MISSION_CONTROL_DISABLED = '1';
    process.env.FAKE_CHIP_ARGS_PATH = argvPath;
    process.env.FAKE_CHIP_ENV_PATH = envPath;
    process.env.CHIP_CREATE_OUTPUT_DIR = outputDir;
    process.env.CHIP_LABS_ROOT = chipLabsRoot;

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = makeCtx(replies);
    ctx.message.text = [
      'Create a private local Domain Chip starter preview for Operations Research Watchdesk R30 Bridge QA.',
      'This is an explicit chip creation request, but preview only for now.',
      'The chip should handle evidence briefs, stale or conflicting sources, fact versus hypothesis separation, source freshness, and operator recommendations only.',
      'Do not run benchmarks, autoloops, sends, alerts, activation, publishing, registry changes, or network absorption.',
      'Show the private starter preview and ask me for go before creating files.'
    ].join(' ');
    await indexModule.handleTextMessage(ctx);

    assert.match(replies.join('\n'), /domain-chip-operations-research-watchdesk-r30-bridge/i);
    assert.ok(getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY), 'preview should stage pending Domain Chip approval');
    assert.equal(captured.length, 0, 'preview should not dispatch work before go');

    ctx.message.text = 'go';
    await indexModule.handleTextMessage(ctx);

    const builderArgs = JSON.parse(readFileSync(argvPath, 'utf8'));
    assert.deepEqual(builderArgs.slice(2, 6), ['-m', 'spark_intelligence.cli', 'chips', 'create']);
    const builderPrompt = String(builderArgs[builderArgs.indexOf('--prompt') + 1] || '');
    assert.match(builderPrompt, /build a domain chip for Operations Research Watchdesk R30 Bridge QA/i);
    assert.match(builderPrompt, /default Loop Engineering direction/i);
    assert.match(builderPrompt, /benchmark pack/i);
    assert.match(builderPrompt, /held-out\/trap\/no-op cases/i);
    assert.match(builderPrompt, /watchtower checks/i);
    assert.match(builderPrompt, /rollback/i);
    assert.doesNotMatch(builderPrompt, /Create a Spark domain chip named/i);
    assert.doesNotMatch(builderPrompt, /Natural-language chip brief/i);
    assert.equal(builderArgs[builderArgs.indexOf('--output-dir') + 1], outputDir);
    assert.equal(builderArgs[builderArgs.indexOf('--chip-labs-root') + 1], chipLabsRoot);
    assert.ok(builderArgs.includes('--home'), 'Builder home must be passed explicitly');
    assert.ok(builderArgs.includes('--json'), 'Telegram bridge must request machine-readable Builder output');
    assert.ok(builderArgs.includes('--governor-decision-json'), 'Telegram bridge must pass Governor authority into Builder');
    const governorArg = JSON.parse(String(builderArgs[builderArgs.indexOf('--governor-decision-json') + 1] || '{}'));
    assert.equal(governorArg.schema_version, 'governor-decision-v1');
    assert.equal(governorArg.outcome, 'execute');
    assert.ok(JSON.stringify(governorArg).includes('chip.create'));
    assert.ok(JSON.stringify(governorArg).includes('spark-intelligence-builder'));

    const builderEnv = JSON.parse(readFileSync(envPath, 'utf8'));
    assert.ok(String(builderEnv.PYTHONPATH).split(path.delimiter).includes(builderSrc));
    assert.equal(builderEnv.CHIP_CREATE_OUTPUT_DIR, outputDir);
    assert.equal(builderEnv.CHIP_LABS_ROOT, chipLabsRoot);
    assert.doesNotMatch(replies.join('\n'), /fresh command text does not authorize/i);
    assert.match(replies.join('\n'), /Domain Chip created: domain-chip-operations-research-watchdesk-r30-bridge/);
    assert.ok(!captured.some((call) => call.url.includes('/api/creator/mission/execute')), 'Telegram go should not detour through creator mission execution');
    assert.equal(getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY), null);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

await test('pending domain-chip draft failure reply hides raw Builder command and prompt wall', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-failure-copy-'));
  const fakeBuilder = path.join(tempDir, 'fake-chip-builder.js');
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    writeFileSync(fakeBuilder, [
      '#!/usr/bin/env node',
      'process.stderr.write([',
      '  "Command failed: /usr/local/bin/python3 -m spark_intelligence.cli chips create --home /Users/alchemistab/.spark/state/spark-intelligence --prompt Create a Spark domain chip named domain-chip-pull-request-risk-review.",',
      '  "Natural-language chip brief: pull request risk review",',
      '  "Required starter kit:",',
      '  "- domain-chip/manifest.json",',
      '  "- benchmark/manifest.json",',
      '  "- autoloop/policy.json"',
      '].join("\\n"));',
      'process.exit(1);'
    ].join('\n'));
    chmodSync(fakeBuilder, 0o755);

    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_BUILDER_REPO = tempDir;
    process.env.SPARK_BUILDER_PYTHON = fakeBuilder;
    process.env.SPARK_MISSION_CONTROL_DISABLED = '1';

    rememberPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY, {
      brief: 'pull request risk review',
      prd: 'Build a domain chip for pull request risk review.',
      projectName: 'domain-chip-pull-request-risk-review',
      buildMode: 'advanced_prd',
      buildModeReason: 'Private Domain Chip starter needs checklist, examples, evals, rollback, and watchtower proof.',
      timestamp: Date.now()
    });

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = makeCtx(replies);
    ctx.message.text = 'go';
    await indexModule.handleTextMessage(ctx);

    const reply = replies.join('\n');
    assert.match(reply, /I could not create domain-chip-pull-request-risk-review yet\./);
    assert.match(reply, /Creation blocker: the private chip scaffolder failed before returning creation proof\./);
    assert.match(reply, /Next: send the chip idea again after Builder health is green/i);
    assert.match(reply, /Nothing was published or activated\./);
    assert.ok(reply.length <= 420, `failure reply should stay compact, got ${reply.length} chars`);
    assert.doesNotMatch(reply, /Command failed|python3|-m spark_intelligence\.cli|--prompt|--home/i);
    assert.doesNotMatch(reply, /Natural-language chip brief|Required starter kit|domain-chip\/manifest\.json|benchmark\/manifest\.json|autoloop\/policy\.json/i);
    assert.doesNotMatch(reply, /\/Users\/|\/usr\/local\/bin|Mission:|Provider:|Move:|Status:/i);
    assert.ok(!captured.some((call) => call.url.includes('/api/creator/mission/execute')), 'failed chip creation should not detour through creator mission execution');
    assert.equal(getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY), null);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

await test('domain-chip failure-copy no-action prompt stays out of benchmark clarification', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPARK_BOT_TEST_MODE = '1';
    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });
    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = makeCtx(replies);
    ctx.message.text = 'Quick QA no-action check: Do not create, run, benchmark, autoloop, repair, publish, or promote anything. If Domain Chip creation fails, how should Spark explain it without confusing a first-time user?';
    await indexModule.handleTextMessage(ctx);
    const reply = replies[0] || '';
    for (const pattern of [/chip was not created/i, /one plain blocker/i, /one next action/i]) {
      assert.match(reply, pattern);
    }
    assert.match(reply, /hide raw commands, local paths, stack traces, and the full prompt/i);
    assert.doesNotMatch(reply, /Choose the specialization path|benchmark level first|Mission:|Provider:|Move:|Status:/i);
    assert.equal(captured.length, 0, 'failure-copy no-action QA must not call Spawner or PRD bridge');
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('pending domain-chip draft accepts doesnt matter as default direction', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-real-create-'));
  const fakeBuilder = path.join(tempDir, 'fake-chip-builder.js');
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    writeFileSync(fakeBuilder, [
      '#!/usr/bin/env node',
      'process.stdout.write(JSON.stringify({',
      '  ok: true,',
      '  chip_key: "domain-chip-founder-objection-handling-playbooks",',
      '  chip_path: "/tmp/private-domain-chip/domain-chip-founder-objection-handling-playbooks",',
      '  router_invokable: false,',
      '  proof_artifacts: {',
      '    schema_version: "spark-domain-chip.proof_artifact_summary.v1",',
      '    benchmark_pack: true,',
      '    autoloop_policy: true,',
      '    proof_capsule: true,',
      '    qa_evidence_lane_packet: true,',
      '    qa_evidence_lane_packet_ref: "reports/qa-evidence-lane-packet.json",',
      '    consumer_transfer_trial_contract: true,',
      '    consumer_transfer_trial_contract_ref: "reports/consumer-transfer-trial-contract.json",',
      '    evaluate_run_contract: true,',
      '    evaluate_run_contract_ref: "benchmark/evaluate-run-contract.json",',
      '    evaluate_input_ref: "benchmark/cases.jsonl",',
      '    evaluate_output_ref: "reports/local-evaluate-smoke.json",',
      '    evaluate_expected_output_schema: "spark-domain-chip.local_evaluate_smoke.v1",',
      '    benchmark_case_count: 14,',
      '    benchmark_case_lanes: { development: 5, held_out: 5, no_op: 1, adversarial: 3 },',
      '    trap_case_count: 3,',
      '    promotion_tier: "candidate_review",',
      '    review_role_packets: { blind_judge: true, adversary: true, safety_judge: true, consumer: true, operator: true },',
      '    review_role_packet_count: 5,',
      '    promotion_blocked: true,',
      '    qa_evidence_lane_blockers: ["positive_score_delta", "blind_judge_score_range", "safety_judge_clear", "adversary_clear", "consumer_transfer_passed"],',
      '    qa_evidence_lane_next_evidence: ["positive benchmark movement", "cited blind score", "safety clearance", "adversary clearance", "consumer transfer"],',
      '    network_absorbable: false,',
      '    consumer_transfer_claimed: false,',
      '    operator_publication_approved: false',
      '  },',
      '  warnings: ["benchmark and autoloop proof are present_unverified until scored"]',
      '}));'
    ].join('\n'));
    chmodSync(fakeBuilder, 0o755);

    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_BUILDER_REPO = tempDir;
    process.env.SPARK_BUILDER_PYTHON = fakeBuilder;
    process.env.SPARK_MISSION_CONTROL_DISABLED = '1';

    rememberPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY, {
      brief: 'founder objection handling playbooks',
      prd: 'Build a domain chip for founder objection handling playbooks.',
      projectName: 'domain-chip-founder-objection-handling-playbooks',
      buildMode: 'advanced_prd',
      buildModeReason: 'Domain-chip creation needs manifest design and router-safe tests.',
      timestamp: Date.now()
    });

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = makeCtx(replies);
    ctx.message.text = "doesn't matter";
    await indexModule.handleTextMessage(ctx);

    assert.ok(!captured.some((call) => call.url.includes('/api/prd-bridge/write')), "doesn't matter should not fall back to the PRD bridge");
    assert.match(replies.join('\n'), /Domain Chip created/i);
    assert.match(replies.join('\n'), /domain-chip-founder-objection-handling-playbooks/i);
	    assert.match(replies.join('\n'), /Private starter kit is ready\. It includes the trigger, playbook, examples, local starter checks, independent review packets, safety monitoring notes, and rollback notes/i);
	    assert.match(replies.join('\n'), /Starter checks: 14 practice checks covering examples, hidden-style checks, no-action checks, and safety challenges, plus 3 trick cases/i);
	    assert.match(replies.join('\n'), /Spark can run the first local check now/i);
	    assert.match(replies.join('\n'), /The independent review packets are staged, but no reviewer has passed it yet/i);
	    assert.match(replies.join('\n'), /Still needed before anyone relies on it: a useful before\/after win, review checks the chip has not seen, safety challenge review, a cold-user trial, rollback proof, an evidence audit, and human approval/i);
	    assert.match(replies.join('\n'), /Next: say "run the private check" or "run the benchmark for it"/i);
	    assert.match(replies.join('\n'), /Privacy: private\/local only/i);
	    assert.doesNotMatch(replies.join('\n'), /reports\/|Evaluate handoff|Blind score binding|Consumer transfer trial|QA Evidence Lane handoff/i);
	    assert.doesNotMatch(replies.join('\n'), /Benchmark\/autoloop:/i);
    assert.doesNotMatch(replies.join('\n'), /\/tmp\/private-domain-chip|Mission:|Provider:|Move:|Status:/i);
    assert.ok(!captured.some((call) => call.url.includes('/api/creator/mission/execute')), 'domain-chip defaults should not execute a creator mission');
    assert.equal(getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY), null);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

await test('pending domain-chip draft can create and evaluate a real Builder starter chip', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-builder-harness-'));
  const builderHarness = path.join(tempDir, 'builder-chip-create-harness.py');
  const outputDir = path.join(tempDir, 'chips');
  const resultPath = path.join(tempDir, 'create-result.json');
  const invocationPath = path.join(tempDir, 'builder-invocations.jsonl');
  const builderSource = '/Users/alchemistab/.spark/modules/spark-intelligence-builder/source/src';
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    writeFileSync(builderHarness, [
      '#!/usr/bin/env python3',
      'from __future__ import annotations',
      'import json',
      'import os',
      'import sys',
      'from pathlib import Path',
      '',
      `sys.path.insert(0, ${JSON.stringify(builderSource)})`,
      'from spark_intelligence.bridge_authority import authorize_builder_bridge_action',
      'from spark_intelligence.harness_contract import build_vnext_action_intent_envelope',
      'from spark_intelligence.chip_create import pipeline',
      '',
      'invocation_path = os.environ.get("REAL_CHIP_CREATE_INVOCATIONS_PATH")',
      'if invocation_path:',
      '    Path(invocation_path).parent.mkdir(parents=True, exist_ok=True)',
      '    with Path(invocation_path).open("a", encoding="utf-8") as handle:',
      '        handle.write(json.dumps({"argv": sys.argv}) + "\\n")',
      '',
      'def arg_value(name, default=""):',
      '    try:',
      '        return sys.argv[sys.argv.index(name) + 1]',
      '    except Exception:',
      '        return default',
      '',
      'def required_governor():',
      '    raw = arg_value("--governor-decision-json")',
      '    if not raw:',
      '        raise RuntimeError("missing --governor-decision-json from Telegram bridge")',
      '    decision = json.loads(raw)',
      '    if "chip.create" not in json.dumps(decision):',
      '        raise RuntimeError("Telegram Governor decision did not authorize chip.create")',
      '    return decision',
      '',
      'def command_receipt_context():',
      '    flags = [arg for arg in sys.argv if arg.startswith("--")]',
      '    shape = []',
      '    redact_next = False',
      '    for arg in sys.argv[1:]:',
      '        if redact_next:',
      '            shape.append("[redacted]")',
      '            redact_next = False',
      '            continue',
      '        shape.append(arg)',
      '        if arg in {"--home", "--prompt", "--output-dir", "--chip-labs-root", "--governor-decision-json"}:',
      '            redact_next = True',
      '    return {',
      '        "command_source": "telegram-domain-chip-builder-harness",',
      '        "argv_shape": shape,',
      '        "flags_present": sorted(set(flags)),',
      '    }',
      '',
      'def governor():',
      '    request_id = "req-telegram-builder-harness"',
      '    envelope = build_vnext_action_intent_envelope(',
      '        surface="telegram-test",',
      '        actor_id_ref="human-domain-chip-harness",',
      '        request_id=request_id,',
      '        source_kind="telegram_domain_chip_harness",',
      '        intent_summary="Test authorizes chip.create from Telegram pending go.",',
      '        raw_turn_summary="Top-level Telegram pending Domain Chip go test.",',
      '        actions=[{',
      '            "tool_name": "chip.create",',
      '            "owner_system": "spark-intelligence-builder",',
      '            "mutation_class": "creates_chip",',
      '            "args_path": "builder://chip-create/telegram-harness/chip.create",',
      '        }],',
      '    )',
      '    authority = authorize_builder_bridge_action(',
      '        {"turn_intent_envelope_vnext": envelope},',
      '        tool_name="chip.create",',
      '        owner_system="spark-intelligence-builder",',
      '        mutation_class="creates_chip",',
      '        request_id=request_id,',
      '        actor_id="telegram-test",',
      '        component="domainChipLabsCreator.test",',
      '    )',
      '    if not authority.allowed:',
      '        raise RuntimeError(f"governor denied: {authority.reason_codes}")',
      '    return authority.governor_decision',
      '',
      'def parse_brief(prompt, *, provider, **_kwargs):',
      '    return {',
      '        "domain_id": "pull-request-risk-review",',
      '        "domain_name": "Pull Request Risk Review",',
      '        "description": "Help reviewers identify risky pull requests with private evidence.",',
      '        "category": "coding_tooling",',
      '        "primary_metric": "risk_review_quality_score",',
      '        "mutation_axes": [',
      '            {"name": "risk_focus", "values": ["security", "tests", "data"]},',
      '            {"name": "review_depth", "values": ["fast", "standard", "deep"]},',
      '        ],',
      '        "task_topics": ["pull_request_review", "risk_review"],',
      '        "task_keywords": ["pull", "request", "review", "risk"],',
      '        "combine_with": [],',
      '    }',
      '',
      'class Provider:',
      '    secret_value = "dummy-secret"',
      '    provider_id = "telegram-test"',
      '    auth_method = "test"',
      '',
      'prompt = arg_value("--prompt")',
      'output_dir = Path(arg_value("--output-dir", os.getcwd()))',
      'chip_labs_root = Path(arg_value("--chip-labs-root", str(Path(os.getcwd()) / "missing-chip-labs")))',
      'pipeline._parse_brief_via_llm = parse_brief',
      'import spark_intelligence.auth.runtime as runtime',
      'runtime.resolve_runtime_provider = lambda **kwargs: Provider()',
      'result = pipeline.create_chip_from_prompt(',
      '    prompt=prompt,',
      '    config_manager=None,',
      '    state_db=None,',
      '    output_dir=output_dir,',
      '    chip_labs_root=chip_labs_root,',
      '    governor_decision=required_governor(),',
      '    command_receipt_context=command_receipt_context(),',
      ')',
      'payload = result.to_dict()',
      'Path(os.environ["REAL_CHIP_CREATE_RESULT_PATH"]).write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")',
      'print(json.dumps(payload))',
    ].join('\n'));
    chmodSync(builderHarness, 0o755);

    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_BUILDER_REPO = tempDir;
    process.env.SPARK_BUILDER_PYTHON = builderHarness;
    process.env.CHIP_CREATE_OUTPUT_DIR = outputDir;
    process.env.CHIP_LABS_ROOT = path.join(tempDir, 'missing-domain-chip-labs');
    process.env.SPARK_MISSION_CONTROL_DISABLED = '1';
    process.env.REAL_CHIP_CREATE_RESULT_PATH = resultPath;
    process.env.REAL_CHIP_CREATE_INVOCATIONS_PATH = invocationPath;

    rememberPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY, {
      brief: 'pull request risk review',
      prd: buildDomainChipPrd('pull request risk review'),
      projectName: 'domain-chip-pull-request-risk-review',
      buildMode: 'advanced_prd',
      buildModeReason: 'Private Domain Chip starter needs checklist, examples, evals, rollback, and watchtower proof.',
      timestamp: Date.now()
    });

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = makeCtx(replies);
    ctx.message.text = 'go';
    await indexModule.handleTextMessage(ctx);

    const invocations = readFileSync(invocationPath, 'utf8')
      .trim()
      .split(/\n+/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(invocations.length, 1, 'pending Domain Chip go should call the Builder harness exactly once');
    const invocationArgv = invocations[0]?.argv || [];
    assert.deepEqual(invocationArgv.slice(1, 5), ['-m', 'spark_intelligence.cli', 'chips', 'create']);
    assert.ok(!invocationArgv.join(' ').includes('memory inspect-capsule'), 'pending Domain Chip go must not run cold-memory inspection before create');

    const result = JSON.parse(readFileSync(resultPath, 'utf8'));
    const chipPath = String(result.chip_path || '');
    const proof = result.proof_artifacts || {};
    assert.equal(result.ok, true, result.error || JSON.stringify(result));
    assert.equal(result.chip_key, 'domain-chip-pull-request-risk-review');
    assert.ok(chipPath.startsWith(outputDir), 'chip should be created under the temp test output dir');
    assert.equal(proof.benchmark_case_count, 14);
    assert.deepEqual(proof.benchmark_case_lanes, {
      adversarial: 3,
      development: 5,
      held_out: 5,
      no_op: 1,
    });
    assert.equal(proof.evaluate_run_contract_ref, 'benchmark/evaluate-run-contract.json');
    assert.equal(proof.qa_evidence_lane_packet_ref, 'reports/qa-evidence-lane-packet.json');
    assert.equal(proof.consumer_transfer_trial_contract_ref, 'reports/consumer-transfer-trial-contract.json');
    assert.equal(proof.consumer_transfer_trial_binding_ref, 'reports/consumer-transfer-trial-binding.json');
    assert.equal(proof.consumer_transfer_trial_binding_status, 'awaiting_report');
    assert.equal(proof.consumer_transfer_supported, false);
    assert.equal(proof.blind_judge_score_binding_ref, 'reports/blind-judge-score-binding.json');
    assert.equal(proof.blind_judge_score_binding_status, 'awaiting_scorecard');
    assert.equal(proof.blind_judge_score_bound, false);
    assert.equal(proof.quality_supported, false);
    assert.equal(proof.safety_judge_binding_ref, 'reports/safety-judge-binding.json');
    assert.equal(proof.safety_judge_binding_status, 'awaiting_report');
    assert.equal(proof.safety_clear, false);
    assert.equal(proof.adversary_report_binding_ref, 'reports/adversary-report-binding.json');
    assert.equal(proof.adversary_report_binding_status, 'awaiting_report');
    assert.equal(proof.adversary_clear, false);
    assert.equal(proof.builder_command_receipt, true);
    assert.equal(proof.builder_command_receipt_ref, 'reports/builder-command-receipt.json');
    assert.equal(proof.builder_command_receipt_status, 'verified');
    assert.equal(proof.builder_command_has_governor_decision_json, true);
    assert.match(String(proof.builder_command_governor_hash || ''), /^[a-f0-9]{64}$/);
    const builderReceipt = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'builder-command-receipt.json'), 'utf8'));
    assert.equal(builderReceipt.schema_version, 'spark-domain-chip.builder_command_receipt.v1');
    assert.equal(builderReceipt.command.has_governor_decision_json_flag, true);
    assert.ok(builderReceipt.command.flags_present.includes('--governor-decision-json'));
    assert.ok(builderReceipt.command.argv_shape.includes('[redacted]'));
    assert.equal(builderReceipt.governor.verification_allowed, true);
    assert.equal(builderReceipt.restrictions.publish_allowed, false);
    assert.equal(builderReceipt.restrictions.network_absorbable, false);
    assert.doesNotMatch(JSON.stringify(builderReceipt), /Build a domain chip|Natural-language chip brief|Telegram Governor decision did not authorize/i);
	    assert.match(replies.join('\n'), /Domain Chip created: domain-chip-pull-request-risk-review/);
	    assert.match(replies.join('\n'), /Starter checks: 14 practice checks covering examples, hidden-style checks, no-action checks, and safety challenges, plus 3 trick cases/i);
	    assert.match(replies.join('\n'), /The independent review packets are staged, but no reviewer has passed it yet/i);
	    assert.match(replies.join('\n'), /Next: say "run the private check" or "run the benchmark for it"/i);
	    assert.doesNotMatch(replies.join('\n'), /reports\/|Evaluate handoff|Blind score binding|Consumer transfer trial|QA Evidence Lane handoff/i);
    assert.doesNotMatch(replies.join('\n'), new RegExp(tempDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(!captured.some((call) => call.url.includes('/api/prd-bridge/write')), 'real Builder harness should use the chip scaffolder');

    const evaluateOutput = path.join(chipPath, 'reports', 'telegram-route-evaluate-smoke.json');
    execFileSync('python3', [
      '-m',
      'pull_request_risk_review.cli',
      'evaluate',
      '--input',
      'benchmark/cases.jsonl',
      '--output',
      'reports/telegram-route-evaluate-smoke.json',
    ], {
      cwd: chipPath,
      env: { ...process.env, PYTHONPATH: path.join(chipPath, 'src') },
      stdio: 'pipe',
    });
    const evaluateReport = JSON.parse(readFileSync(evaluateOutput, 'utf8'));
    assert.equal(evaluateReport.schema_version, 'spark-domain-chip.local_evaluate_smoke.v1');
    assert.equal(evaluateReport.case_count, 14);
    assert.equal(evaluateReport.promotion_blocked, true);
    assert.equal(evaluateReport.network_absorbable, false);

    const reviewInput = path.join(chipPath, 'benchmark', 'telegram-sample-pr-risk-input.json');
    const reviewOutput = path.join(chipPath, 'reports', 'telegram-sample-pr-risk-review.json');
    writeFileSync(reviewInput, JSON.stringify({
      title: 'Tighten OAuth callback and billing webhook',
      summary: 'Changes auth callback, billing webhook retries, and adds focused tests.',
      changed_files: [
        'src/auth/oauthCallback.ts',
        'src/billing/webhook.ts',
        'tests/billing/webhook.test.ts',
      ],
      notes: 'Security-sensitive entrypoints with some test coverage.',
    }));
    execFileSync('python3', [
      '-m',
      'pull_request_risk_review.cli',
      'review',
      '--input',
      reviewInput,
      '--output',
      reviewOutput,
    ], {
      cwd: chipPath,
      env: { ...process.env, PYTHONPATH: path.join(chipPath, 'src') },
      stdio: 'pipe',
    });
    const reviewReport = JSON.parse(readFileSync(reviewOutput, 'utf8'));
    assert.equal(reviewReport.schema_version, 'spark-domain-chip.private_review.v1');
    assert.equal(reviewReport.domain_id, 'pull-request-risk-review');
    assert.equal(reviewReport.privacy_boundary, 'private_local_only');
    assert.equal(reviewReport.promotion_blocked, true);
    assert.equal(reviewReport.network_absorbable, false);
    assert.ok(reviewReport.risk_signals.includes('security_or_auth_surface'));
    assert.ok(reviewReport.risk_signals.includes('test_evidence_present'));
    assert.match(reviewReport.claim_boundary, /does not prove quality/i);

    const consumerTransferRun = spawnSync('python3', [
      '-m',
      'domain_chip_spark_qa_evidence_lane.cli',
      'consumer-transfer',
      '--trial-id',
      'telegram-pr-risk-consumer-transfer',
      '--domain',
      'Pull Request Risk Review',
      '--chip-ref',
      'spark-chip.json',
      '--held-out-case-ref',
      'benchmark/cases.jsonl#pull-request-risk-review-held-out-001',
      '--transcript-ref',
      'reports/telegram-sample-pr-risk-review.json',
      '--creator-id',
      'builder-starter-agent',
      '--consumer-id',
      'telegram-consumer-agent',
      '--route-invoked',
      '--task-completed',
    ], {
      cwd: '/Users/alchemistab/.spark/modules/domain-chip-spark-qa-evidence-lane/source',
      env: {
        ...process.env,
        PYTHONPATH: '/Users/alchemistab/.spark/modules/domain-chip-spark-qa-evidence-lane/source/src',
      },
      encoding: 'utf8',
    });
    assert.equal(consumerTransferRun.status, 0, consumerTransferRun.stderr || consumerTransferRun.stdout);
    const transferReport = JSON.parse(consumerTransferRun.stdout);
    assert.equal(transferReport.schema_version, 'spark-domain-chip-consumer-transfer.v1');
    assert.equal(transferReport.transfer_passed, true);
    assert.equal(transferReport.consumer_visibility, 'chip_artifact_only');
    assert.equal(transferReport.role_separation, true);
    assert.deepEqual(transferReport.hard_blockers, []);
    const transferReportPath = path.join(chipPath, 'reports', 'telegram-consumer-transfer-report.json');
    writeFileSync(transferReportPath, consumerTransferRun.stdout);

    const bindingOutputPath = path.join(chipPath, 'reports', 'consumer-transfer-trial-binding.json');
    execFileSync('python3', [
      '-m',
      'pull_request_risk_review.cli',
      'bind-transfer',
      '--input',
      transferReportPath,
      '--output',
      bindingOutputPath,
    ], {
      cwd: chipPath,
      env: { ...process.env, PYTHONPATH: path.join(chipPath, 'src') },
      stdio: 'pipe',
    });
    const bindingReport = JSON.parse(readFileSync(bindingOutputPath, 'utf8'));
    assert.equal(bindingReport.schema_version, 'spark-domain-chip.consumer_transfer_trial_binding.v1');
    assert.equal(bindingReport.transfer_report_status, 'pass');
    assert.equal(bindingReport.transfer_passed, true);
    assert.equal(bindingReport.transfer_supported, false);
    assert.equal(bindingReport.promotion_blocked, true);
    assert.equal(bindingReport.network_absorbable, false);
    const reboundCapsule = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'proof-capsule-starter.json'), 'utf8'));
    assert.equal(reboundCapsule.proof.consumer_transfer_trial_binding.status, 'report_bound_unpromoted');
    assert.equal(reboundCapsule.proof.consumer_transfer_trial_binding.transfer_supported, false);

    const blindAbRun = spawnSync('python3', [
      '-m',
      'domain_chip_spark_qa_evidence_lane.cli',
      'blind-ab',
      '--trial-id',
      'telegram-pr-risk-blind-ab',
      '--domain',
      'Pull Request Risk Review',
      '--baseline-ref',
      'reports/baseline.json',
      '--candidate-ref',
      'reports/candidate.json',
      '--seed',
      'telegram-pr-risk-blind-seed',
      '--judge-only',
    ], {
      cwd: '/Users/alchemistab/.spark/modules/domain-chip-spark-qa-evidence-lane/source',
      env: {
        ...process.env,
        PYTHONPATH: '/Users/alchemistab/.spark/modules/domain-chip-spark-qa-evidence-lane/source/src',
      },
      encoding: 'utf8',
    });
    assert.equal(blindAbRun.status, 0, blindAbRun.stderr || blindAbRun.stdout);
    const blindPacket = JSON.parse(blindAbRun.stdout);
    assert.equal(blindPacket.schema_version, 'spark-domain-chip-blind-eval.v1');
    assert.equal(blindPacket.judge_visibility, 'outputs_only');
    assert.equal(blindPacket.score_refs_required, true);
    assert.equal('unblinding_record' in blindPacket, false);

    const blindScorecardPath = path.join(chipPath, 'reports', 'telegram-blind-judge-scorecard.json');
    writeFileSync(blindScorecardPath, JSON.stringify({
      schema_version: 'spark-domain-chip.blind_judge_scorecard.v1',
      blind_judge_score: 88,
      blind_judge_score_refs: [
        'reports/telegram-blind-judge-scorecard.json',
        'reports/blind-anonymized-output-only-judge.json',
      ],
      blind_labels_hidden: true,
      output_only_judge: true,
      judge_disagreement: 7,
      hard_blockers: [],
    }));
    const blindBindingPath = path.join(chipPath, 'reports', 'blind-judge-score-binding.json');
    execFileSync('python3', [
      '-m',
      'pull_request_risk_review.cli',
      'bind-blind-scores',
      '--input',
      blindScorecardPath,
      '--output',
      blindBindingPath,
    ], {
      cwd: chipPath,
      env: { ...process.env, PYTHONPATH: path.join(chipPath, 'src') },
      stdio: 'pipe',
    });
    const blindBindingReport = JSON.parse(readFileSync(blindBindingPath, 'utf8'));
    assert.equal(blindBindingReport.schema_version, 'spark-domain-chip.blind_judge_score_binding.v1');
    assert.equal(blindBindingReport.blind_score_status, 'pass');
    assert.equal(blindBindingReport.blind_judge_score, 88);
    assert.equal(blindBindingReport.blind_judge_score_refs.length, 2);
    assert.equal(blindBindingReport.blind_labels_hidden, true);
    assert.equal(blindBindingReport.output_only_judge, true);
    assert.equal(blindBindingReport.judge_disagreement, 7);
    assert.equal(blindBindingReport.quality_supported, false);
    assert.equal(blindBindingReport.promotion_blocked, true);
    const reboundBlindCapsule = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'proof-capsule-starter.json'), 'utf8'));
    assert.equal(reboundBlindCapsule.proof.blind_judge_score_binding.status, 'score_bound_unpromoted');
    assert.equal(reboundBlindCapsule.proof.blind_judge_score_binding.quality_supported, false);

    const safetyRun = spawnSync('python3', [
      '-m',
      'domain_chip_spark_qa_evidence_lane.cli',
      'safety-judge',
      '--trial-id',
      'telegram-pr-risk-safety',
      '--domain',
      'Pull Request Risk Review',
      '--chip-ref',
      'spark-chip.json',
      '--creator-id',
      'builder-starter-agent',
      '--safety-judge-id',
      'telegram-safety-judge',
      '--score',
      'forbidden_actions=0.95',
      '--score',
      'privacy=0.96',
      '--score',
      'tool_use_safety=0.94',
      '--score',
      'route_authority=0.93',
      '--score',
      'publication_boundary=0.97',
    ], {
      cwd: '/Users/alchemistab/.spark/modules/domain-chip-spark-qa-evidence-lane/source',
      env: {
        ...process.env,
        PYTHONPATH: '/Users/alchemistab/.spark/modules/domain-chip-spark-qa-evidence-lane/source/src',
      },
      encoding: 'utf8',
    });
    assert.equal(safetyRun.status, 0, safetyRun.stderr || safetyRun.stdout);
    const safetyReport = JSON.parse(safetyRun.stdout);
    assert.equal(safetyReport.schema_version, 'spark-domain-chip-safety-judge.v1');
    assert.equal(safetyReport.safety_judge_clear, true);
    assert.deepEqual(safetyReport.hard_blockers, []);
    const safetyReportPath = path.join(chipPath, 'reports', 'telegram-safety-judge-report.json');
    writeFileSync(safetyReportPath, safetyRun.stdout);

    const safetyBindingPath = path.join(chipPath, 'reports', 'safety-judge-binding.json');
    execFileSync('python3', [
      '-m',
      'pull_request_risk_review.cli',
      'bind-safety',
      '--input',
      safetyReportPath,
      '--output',
      safetyBindingPath,
    ], {
      cwd: chipPath,
      env: { ...process.env, PYTHONPATH: path.join(chipPath, 'src') },
      stdio: 'pipe',
    });
    const safetyBindingReport = JSON.parse(readFileSync(safetyBindingPath, 'utf8'));
    assert.equal(safetyBindingReport.schema_version, 'spark-domain-chip.safety_judge_binding.v1');
    assert.equal(safetyBindingReport.safety_report_status, 'pass');
    assert.equal(safetyBindingReport.safety_clear, true);
    assert.equal(safetyBindingReport.promotion_blocked, true);
    assert.equal(safetyBindingReport.network_absorbable, false);
    const reboundSafetyCapsule = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'proof-capsule-starter.json'), 'utf8'));
    assert.equal(reboundSafetyCapsule.proof.safety_judge_binding.status, 'report_bound_unpromoted');
    assert.equal(reboundSafetyCapsule.proof.safety_judge_binding.safety_clear, true);

    const adversaryRun = spawnSync('python3', [
      '-m',
      'domain_chip_spark_qa_evidence_lane.cli',
      'adversary-report',
      '--trial-id',
      'telegram-pr-risk-adversary',
      '--domain',
      'Pull Request Risk Review',
      '--chip-ref',
      'spark-chip.json',
      '--creator-id',
      'builder-starter-agent',
      '--adversary-id',
      'telegram-adversary-agent',
      '--finding-ref',
      'reports/adversary-route-drift-check.md',
    ], {
      cwd: '/Users/alchemistab/.spark/modules/domain-chip-spark-qa-evidence-lane/source',
      env: {
        ...process.env,
        PYTHONPATH: '/Users/alchemistab/.spark/modules/domain-chip-spark-qa-evidence-lane/source/src',
      },
      encoding: 'utf8',
    });
    assert.equal(adversaryRun.status, 0, adversaryRun.stderr || adversaryRun.stdout);
    const adversaryReport = JSON.parse(adversaryRun.stdout);
    assert.equal(adversaryReport.schema_version, 'spark-domain-chip-adversary-report.v1');
    assert.equal(adversaryReport.adversary_clear, true);
    assert.deepEqual(adversaryReport.hard_blockers, []);
    const adversaryReportPath = path.join(chipPath, 'reports', 'telegram-adversary-report.json');
    writeFileSync(adversaryReportPath, adversaryRun.stdout);

    const adversaryBindingPath = path.join(chipPath, 'reports', 'adversary-report-binding.json');
    execFileSync('python3', [
      '-m',
      'pull_request_risk_review.cli',
      'bind-adversary',
      '--input',
      adversaryReportPath,
      '--output',
      adversaryBindingPath,
    ], {
      cwd: chipPath,
      env: { ...process.env, PYTHONPATH: path.join(chipPath, 'src') },
      stdio: 'pipe',
    });
    const adversaryBindingReport = JSON.parse(readFileSync(adversaryBindingPath, 'utf8'));
    assert.equal(adversaryBindingReport.schema_version, 'spark-domain-chip.adversary_report_binding.v1');
    assert.equal(adversaryBindingReport.adversary_report_status, 'pass');
    assert.equal(adversaryBindingReport.adversary_clear, true);
    assert.equal(adversaryBindingReport.promotion_blocked, true);
    assert.equal(adversaryBindingReport.network_absorbable, false);
    const reboundAdversaryCapsule = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'proof-capsule-starter.json'), 'utf8'));
    assert.equal(reboundAdversaryCapsule.proof.adversary_report_binding.status, 'report_bound_unpromoted');
    assert.equal(reboundAdversaryCapsule.proof.adversary_report_binding.adversary_clear, true);

    const manifest = JSON.parse(readFileSync(path.join(chipPath, 'spark-chip.json'), 'utf8'));
    const commandEnv = { ...process.env };
    delete commandEnv.PYTHONPATH;
    const runManifestCommand = (name: string, args: string[] = []) => {
      const command = manifest.commands?.[name];
      assert.ok(Array.isArray(command), `${name} command should be declared in spark-chip.json`);
      assert.deepEqual(command.slice(0, 3), ['python3', 'chip-runner.py', name]);
      execFileSync(command[0], [...command.slice(1), ...args], {
        cwd: chipPath,
        env: commandEnv,
        stdio: 'pipe',
      });
    };

    runManifestCommand('loop-round');
    const autoloopRoundReport = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'autoloop-round-001.json'), 'utf8'));
    assert.equal(autoloopRoundReport.schema_version, 'spark-domain-chip.autoloop_round.v1');
    assert.equal(autoloopRoundReport.round_status, 'blocked');
    assert.equal(autoloopRoundReport.promotion_blocked, true);
    assert.equal(autoloopRoundReport.network_absorbable, false);

    runManifestCommand('watchtower-check');
    const watchtowerReport = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'watchtower-check.json'), 'utf8'));
    assert.equal(watchtowerReport.schema_version, 'spark-domain-chip.watchtower_check.v1');
    assert.equal(watchtowerReport.watchtower_executed, false);
    assert.equal(watchtowerReport.starter_watchtower_check_executed, true);
    assert.equal(watchtowerReport.promotion_blocked, true);
    assert.equal(watchtowerReport.network_absorbable, false);

    runManifestCommand('rollback-check');
    const rollbackReport = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'rollback-check.json'), 'utf8'));
    assert.equal(rollbackReport.schema_version, 'spark-domain-chip.rollback_check.v1');
    assert.equal(rollbackReport.rollback_executed, false);
    assert.equal(rollbackReport.starter_rollback_check_executed, true);
    assert.equal(rollbackReport.promotion_blocked, true);
    assert.equal(rollbackReport.network_absorbable, false);

    runManifestCommand('ux-readability-check', [
      '--input',
      'reports/human-onboarding-rubric.md',
      '--output',
      'reports/ux-readability-check.json',
    ]);
    const uxReport = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'ux-readability-check.json'), 'utf8'));
    assert.equal(uxReport.schema_version, 'spark-domain-chip.ux_readability_check.v1');
    assert.equal(uxReport.ux_status, 'pass');
    assert.ok(uxReport.ux_score >= 9);
    assert.equal(uxReport.promotion_blocked, true);
    assert.equal(uxReport.network_absorbable, false);

    runManifestCommand('loop-gate-check');
    const loopGateReport = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'loop-gate-check.json'), 'utf8'));
    assert.equal(loopGateReport.schema_version, 'spark-domain-chip.loop_gate_check.v1');
    assert.equal(loopGateReport.gate_status, 'blocked');
    assert.equal(loopGateReport.watchtower_executed, false);
    assert.equal(loopGateReport.rollback_executed, false);
    assert.equal(loopGateReport.ux_readability_bound, true);
    assert.equal(loopGateReport.ux_readability_passed, true);
    assert.equal(loopGateReport.promotion_blocked, true);
    assert.equal(loopGateReport.network_absorbable, false);
    assert.ok(loopGateReport.hard_blockers.includes('operator_publication_approval_missing'));

    runManifestCommand('proof-auditor-check');
    const proofAuditorReport = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'proof-auditor-check.json'), 'utf8'));
    assert.equal(proofAuditorReport.schema_version, 'spark-domain-chip.proof_auditor_check.v1');
    assert.equal(proofAuditorReport.proof_auditor_executed, true);
    assert.equal(proofAuditorReport.promotion_blocked, true);
    assert.equal(proofAuditorReport.network_absorbable, false);

    runManifestCommand('loop-gate-check', ['--output', 'reports/telegram-loop-gate-after-auditor.json']);
    const finalLoopGateReport = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'telegram-loop-gate-after-auditor.json'), 'utf8'));
    assert.equal(finalLoopGateReport.proof_auditor_bound, true);
    assert.equal(finalLoopGateReport.proof_auditor_passed, false);
    assert.equal(finalLoopGateReport.promotion_blocked, true);
    assert.equal(finalLoopGateReport.network_absorbable, false);
    assert.ok(!finalLoopGateReport.hard_blockers.includes('proof_auditor_clearance_missing'));
    assert.ok(finalLoopGateReport.hard_blockers.includes('proof_auditor_clearance_not_passed'));
    const loopCommandCapsule = JSON.parse(readFileSync(path.join(chipPath, 'reports', 'proof-capsule-starter.json'), 'utf8'));
    assert.equal(loopCommandCapsule.proof.autoloop_round.status, 'round_bound_blocked');
    assert.equal(loopCommandCapsule.proof.watchtower_check.status, 'watchtower_bound_blocked');
    assert.equal(loopCommandCapsule.proof.rollback_check.status, 'rollback_bound_blocked');
    assert.equal(loopCommandCapsule.proof.ux_readability_check.status, 'ux_readability_bound_pass');
    assert.equal(loopCommandCapsule.proof.proof_auditor_check.status, 'proof_auditor_bound_blocked');
    assert.equal(loopCommandCapsule.network_absorbable, false);

    const qaSource = '/Users/alchemistab/.spark/modules/domain-chip-spark-qa-evidence-lane/source/src';
    const qaRun = spawnSync('python3', [
      '-m',
      'domain_chip_spark_qa_evidence_lane.cli',
      'evaluate-run',
      chipPath,
    ], {
      cwd: '/Users/alchemistab/.spark/modules/domain-chip-spark-qa-evidence-lane/source',
      env: { ...process.env, PYTHONPATH: qaSource },
      encoding: 'utf8',
    });
    assert.equal(qaRun.status, 1, qaRun.stderr || qaRun.stdout);
    const qaReport = JSON.parse(qaRun.stdout);
    assert.equal(qaReport.passed, false);
    assert.equal(qaReport.run_dir, chipPath);
    assert.equal(qaReport.packet_path, path.join(chipPath, 'reports', 'qa-evidence-lane-packet.json'));
    assert.ok(!qaReport.failures.includes('schema_validation'), JSON.stringify(qaReport, null, 2));
    assert.ok(qaReport.failures.includes('held_out_passed'), JSON.stringify(qaReport, null, 2));
    assert.ok(qaReport.failures.includes('proof_capsule_core_loop_evidence'), JSON.stringify(qaReport, null, 2));
    assert.ok(qaReport.hard_blockers.includes('proof_capsule_core_loop_evidence'), JSON.stringify(qaReport, null, 2));
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

await test('created domain-chip receipt becomes the safe benchmark follow-up target', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-followup-'));
  const fakeBuilder = path.join(tempDir, 'fake-chip-builder.js');
  const stateDir = path.join(tempDir, 'state');
  const testUserId = 8319079055;
  const pendingKey = telegramPendingDomainChipKey(testUserId, testUserId);
  deletePendingCreatorMission(telegramPendingCreatorMissionKey(testUserId, testUserId));
  deletePendingDomainChipBuild(pendingKey);
  try {
    resetJsonStateForTests();
    process.env.SPARK_GATEWAY_STATE_DIR = stateDir;
	    writeFileSync(fakeBuilder, [
	      '#!/usr/bin/env node',
	      'const args = process.argv.slice(2);',
	      'if (args.includes("loops") && args.includes("run")) {',
	      '  process.stdout.write(JSON.stringify({',
	      '    ok: true,',
	      '    chip_key: "domain-chip-pull-request-risk-review",',
	      '    rounds_completed: 1,',
	      '    total_rounds: 1,',
	      '    status_path: "/tmp/private-domain-chip/domain-chip-pull-request-risk-review/reports/loop-status.json",',
	      '    history: [{',
	      '      round_index: 1,',
	      '      suggestions_count: 3,',
	      '      best_verdict: "blocked",',
	      '      best_metric: 0.73',
	      '    }]',
	      '  }));',
	      '  process.exit(0);',
	      '}',
	      'process.stdout.write(JSON.stringify({',
	      '  ok: true,',
	      '  chip_key: "domain-chip-pull-request-risk-review",',
	      '  chip_path: "/tmp/private-domain-chip/domain-chip-pull-request-risk-review",',
	      '  router_invokable: false,',
	      '  proof_artifacts: {',
	      '    benchmark_pack: true,',
	      '    autoloop_policy: true,',
	      '    proof_capsule: true,',
	      '    benchmark_case_count: 14,',
	      '    benchmark_case_lanes: { development: 5, held_out: 5, no_op: 1, adversarial: 3 },',
	      '    trap_case_count: 3,',
	      '    promotion_blocked: true',
	      '  },',
	      '  warnings: []',
	      '}));'
	    ].join('\n'));
	    chmodSync(fakeBuilder, 0o755);
	    const chipsDir = path.join(tempDir, 'chips');
	    const chipRoot = path.join(chipsDir, 'domain-chip-pull-request-risk-review');
	    mkdirSync(path.join(chipRoot, 'benchmark'), { recursive: true });
	    mkdirSync(path.join(chipRoot, 'reports'), { recursive: true });
	    writeFileSync(path.join(chipRoot, 'spark-chip.json'), JSON.stringify({
	      evaluate: ['python3', 'chip-runner.py', 'evaluate', '--input', 'benchmark/cases.jsonl', '--output', 'reports/local-evaluate-smoke.json'],
	      'loop-round': ['python3', 'chip-runner.py', 'loop-round'],
	      'watchtower-check': ['python3', 'chip-runner.py', 'watchtower-check'],
	      'rollback-check': ['python3', 'chip-runner.py', 'rollback-check'],
	      'loop-gate-check': ['python3', 'chip-runner.py', 'loop-gate-check']
	    }));
	    writeFileSync(path.join(chipRoot, 'benchmark', 'evaluate-run-contract.json'), JSON.stringify({
	      command: ['python3', 'chip-runner.py', 'evaluate', '--input', 'benchmark/cases.jsonl', '--output', 'reports/local-evaluate-smoke.json']
	    }));
	    writeFileSync(path.join(chipRoot, 'chip-runner.py'), [
	      'import json, pathlib, sys',
	      'cmd = sys.argv[1] if len(sys.argv) > 1 else ""',
	      'reports = pathlib.Path("reports")',
	      'reports.mkdir(exist_ok=True)',
	      'if cmd == "loop-round":',
	      '    (reports / "autoloop-round-001.json").write_text(json.dumps({"case_count": 14, "score_delta": 0.0, "round_status": "blocked", "promotion_blocked": True, "network_absorbable": False}))',
	      'elif cmd == "loop-gate-check":',
	      '    (reports / "loop-gate-check.json").write_text(json.dumps({"gate_status": "blocked", "promotion_blocked": True, "network_absorbable": False}))',
	      'elif cmd == "evaluate":',
	      '    (reports / "local-evaluate-smoke.json").write_text(json.dumps({"ok": True}))',
	      'elif cmd in {"watchtower-check", "rollback-check"}:',
	      '    (reports / f"{cmd}.json").write_text(json.dumps({"status": "blocked", "promotion_blocked": True}))',
	      'else:',
	      '    raise SystemExit(2)'
	    ].join('\n'));

	    process.env.ADMIN_TELEGRAM_IDS = String(testUserId);
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
	    process.env.SPARK_BOT_TEST_MODE = '1';
	    process.env.SPARK_BUILDER_REPO = tempDir;
	    process.env.SPARK_BUILDER_PYTHON = fakeBuilder;
	    process.env.SPARK_DOMAIN_CHIPS_DIR = chipsDir;
	    process.env.SPARK_MISSION_CONTROL_DISABLED = '1';

    rememberPendingDomainChipBuild(pendingKey, {
      brief: 'pull request risk review',
      prd: 'Build a domain chip for pull request risk review.',
      projectName: 'domain-chip-pull-request-risk-review',
      buildMode: 'advanced_prd',
      buildModeReason: 'Private Domain Chip starter needs checklist, examples, evals, rollback, and watchtower proof.',
      timestamp: Date.now()
    });

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = {
      ...makeCtx(replies),
      chat: { id: testUserId },
      from: { id: testUserId, username: 'followup-tester' },
      message: { message_id: 56322, text: 'go' },
      update: { update_id: 56322 }
    };

    await indexModule.handleTextMessage(ctx);
    assert.match(replies.join('\n'), /Domain Chip created: domain-chip-pull-request-risk-review/);

    const { conversation } = await import('../src/conversation');
    for (let index = 0; index < 18; index += 1) {
      await conversation.rememberAssistantReply(ctx.from, 'We are working on Spark QA Operator and path:spark-qa-operator.');
    }

    replies.length = 0;
    ctx.message = { message_id: 56323, text: 'run the private check' };
    ctx.update = { update_id: 56323 };
    await indexModule.handleTextMessage(ctx);

    const followup = replies.join('\n');
    assert.match(followup, /I ran the private starter check for Pull Request Risk Review/i);
    assert.match(followup, /14 practice checks ran/i);
    assert.match(followup, /did not show a usefulness gain yet/i);
    assert.match(followup, /safety gate stayed closed/i);
    assert.match(followup, /nothing was promoted, published, activated, sent, or absorbed/i);
    assert.doesNotMatch(followup, /\/recursive start|Mission:|Provider:|Move:|Status:|\/tmp\/private-domain-chip/i);
    assert.ok(!captured.some((call) => call.url.includes('/api/creator/mission/execute')), 'natural benchmark follow-up should not execute a mission');

    replies.length = 0;
    ctx.message = {
      message_id: 56324,
      text: 'Hypothetical only: if I ask this Domain Chip to prepare an evidence brief, do not start anything, do not browse, do not call external sources, do not edit files, and do not send alerts. What would you check first?'
    };
    ctx.update = { update_id: 56324 };
    await indexModule.handleTextMessage(ctx);

    const advisory = replies.join('\n');
    assert.match(advisory, /Pull Request Risk Review/i);
    assert.match(advisory, /PR evidence the user already supplied/i);
    assert.match(advisory, /changed surfaces/i);
    assert.match(advisory, /test signals/i);
    assert.match(advisory, /migration or security risk/i);
    assert.match(advisory, /separate review facts from hypotheses/i);
    assert.match(advisory, /would not read files, run tests, inspect a repository, post review comments/i);
    assert.doesNotMatch(advisory, /source dates\/freshness|external sources|send alerts/i);
    assert.doesNotMatch(advisory, /does not look like an attached specialization path|\/recursive paths|\/recursive start/i);
  } finally {
    deletePendingCreatorMission(telegramPendingCreatorMissionKey(testUserId, testUserId));
    deletePendingDomainChipBuild(pendingKey);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    resetJsonStateForTests();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

await test('expired pending domain-chip draft clears without starting work', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    rememberPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY, {
      brief: 'pull request risk review',
      prd: 'Build a domain chip for pull request risk review.',
      projectName: 'domain-chip-pull-request-risk-review',
      buildMode: 'advanced_prd',
      buildModeReason: 'Private Domain Chip starter needs checklist, examples, evals, rollback, and watchtower proof.',
      timestamp: Date.now() - DOMAIN_CHIP_BUILD_TTL_MS - 1000
    });

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = makeCtx(replies);
    ctx.message.text = 'go';
    await indexModule.handleTextMessage(ctx);

    assert.equal(getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY), null);
    assert.equal(captured.length, 0, 'expired pending domain-chip draft must not dispatch work');
    assert.match(replies[replies.length - 1] || '', /did not start anything/i);
    assert.match(replies[replies.length - 1] || '', /fresh private draft/i);
    assert.doesNotMatch(replies[replies.length - 1] || '', /Mission:|Provider:|Move:|Status:/);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('pending domain-chip draft accepts workflow and benchmark steering', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-steering-'));
  const fakeBuilder = path.join(tempDir, 'fake-chip-builder.js');
  const argvPath = path.join(tempDir, 'argv.json');
  deletePendingCreatorMission(PENDING_KEY);
  deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
  try {
    writeFileSync(fakeBuilder, [
      '#!/usr/bin/env node',
      'const fs = require("node:fs");',
      'fs.writeFileSync(process.env.FAKE_CHIP_ARGS_PATH, JSON.stringify(process.argv));',
      'process.stdout.write(JSON.stringify({',
      '  ok: true,',
      '  chip_key: "domain-chip-pull-request-risk-review",',
      '  chip_path: "/tmp/private-domain-chip/domain-chip-pull-request-risk-review",',
      '  router_invokable: false,',
      '  warnings: []',
      '}));'
    ].join('\n'));
    chmodSync(fakeBuilder, 0o755);

    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_BUILDER_REPO = tempDir;
    process.env.SPARK_BUILDER_PYTHON = fakeBuilder;
    process.env.SPARK_MISSION_CONTROL_DISABLED = '1';
    process.env.FAKE_CHIP_ARGS_PATH = argvPath;

    rememberPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY, {
      brief: 'pull request risk review',
      prd: 'Build a domain chip for pull request risk review.',
      projectName: 'domain-chip-pull-request-risk-review',
      buildMode: 'advanced_prd',
      buildModeReason: 'Private Domain Chip starter needs checklist, examples, evals, rollback, and watchtower proof.',
      timestamp: Date.now()
    });

    const captured: CapturedCall[] = [];
    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    const ctx = makeCtx(replies);
    ctx.message.text = 'focus on the reviewer workflow, benchmark cases, held-out traps, and rollback';
    await indexModule.handleTextMessage(ctx);

    const builderArgs = JSON.parse(readFileSync(argvPath, 'utf8'));
    const promptIndex = builderArgs.indexOf('--prompt');
    assert.ok(promptIndex >= 0, 'chip scaffolder should receive a prompt');
    const builderPrompt = String(builderArgs[promptIndex + 1] || '');
    assert.match(builderPrompt, /build a domain chip for pull request risk review/i);
    assert.match(builderPrompt, /reviewer workflow, benchmark cases, held-out traps, and rollback/i);
    assert.doesNotMatch(builderPrompt, /Create a Spark domain chip named/i);
    assert.doesNotMatch(builderPrompt, /Natural-language chip brief/i);
    assert.doesNotMatch(builderPrompt, /Required starter kit/i);
    assert.doesNotMatch(builderPrompt, /complete private Domain Chip starter kit/i);
    assert.ok(!captured.some((call) => call.url.includes('/api/prd-bridge/write')), 'workflow and benchmark steering should use the chip scaffolder');
    assert.match(replies.join('\n'), /Domain Chip created: domain-chip-pull-request-risk-review/);
    assert.ok(!captured.some((call) => call.url.includes('/api/creator/mission/execute')), 'domain-chip steering should not execute a creator mission');
    assert.equal(getPendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY), null);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    deletePendingDomainChipBuild(DOMAIN_CHIP_PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    rmSync(tempDir, { recursive: true, force: true });
  }
});
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
