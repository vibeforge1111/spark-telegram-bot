import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { isNoExecutionBoundary } from './conversationIntent';
import type { NaturalRouteDecision } from './naturalRouteDecision';
import type { TelegramIntentDecisionV2 } from './intentContract';
import type {
  TelegramActionAuthorityInput,
  TelegramActionAuthorityResult
} from './telegramActionAuthority';
import { withHiddenWindows } from './hiddenProcess';
import type { TurnIntentEnvelopeV1 } from './harnessContract';
import { buildTelegramDeliveryProofCapsule } from './telegramDeliveryProof';

type HarnessStatus = 'success' | 'failure' | 'partial';
const execFileAsync = promisify(execFile);

interface GeneratedLoopSmokeResult {
  ok: boolean;
  chipKey: string;
  caseCount?: number;
  scoreDelta?: number;
  gateStatus?: string;
  promotionBlocked?: boolean;
  networkAbsorbable?: boolean;
  error?: string;
}

interface FollowupDeps {
  ctx: any;
  text: string;
  decision: NaturalRouteDecision | null;
  rawCommand: string;
  requestId?: string;
  authorize(input: TelegramActionAuthorityInput & {
    action?: string;
    kind?: TelegramIntentDecisionV2['kind'];
    confidence?: TelegramIntentDecisionV2['confidence'];
  }): TelegramActionAuthorityResult;
  replyAuthorityBlocked(): Promise<void>;
  sendTyping(): Promise<void>;
  recordNaturalExecution(): void;
  recordHarnessExecution(
    authorization: TelegramActionAuthorityResult,
    status: HarnessStatus,
    summary: string
  ): void;
  replyExtra?(
    authorization: TelegramActionAuthorityResult,
    status: HarnessStatus,
    summary: string
  ): Record<string, unknown> | undefined;
  runLoopEngineering?(
    input: {
      kind: 'benchmark' | 'loop';
      chipKey: string;
      objective: string;
      roundLimit: number;
      requestId?: string;
    }
  ): Promise<{
    success: boolean;
    action?: string;
    missionId?: string;
    eventId?: string;
    inspectUrl?: string;
    message?: string;
    error?: string;
  }>;
  rememberAssistantReply(reply: string): Promise<void>;
  redact(value: string): string;
}

export function labelForTelegram(value: string): string {
  return String(value || '')
    .replace(/^path:/, '')
    .replace(/^path[_-]/, '')
    .replace(/^domain-chip-/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/^domain chip\s+/i, '')
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim() || 'specialization';
}

export function domainChipBenchmarkFollowupReplyExtra(
  envelope: TurnIntentEnvelopeV1,
  authorization: TelegramActionAuthorityResult,
  status: HarnessStatus,
  summary: string
): Record<string, unknown> {
  return {
    __sparkTraceContext: {
      route: 'recursive.start',
      command: 'telegram_domain_chip_benchmark_autoloop_followup',
      replyKind: status === 'success' ? 'domain_chip_loop_smoke' : 'domain_chip_loop_smoke_blocked',
      requestId: envelope.turnId,
      traceRef: envelope.traceId,
      proofCapsule: buildTelegramDeliveryProofCapsule({
        turnRef: envelope.traceId || envelope.turnId,
        route: 'recursive.start',
        owner: 'spark-telegram-bot',
        tool: 'recursive.loop',
        mutationClass: 'launches_mission',
        executionStatus: status === 'success' ? 'completed' : 'failed',
        replyDelivered: true,
        replyShape: 'natural',
        authorization,
        reasonSummary: summary,
        joins: { telegram: 'joined', builder: 'joined', spawner: 'not_applicable' }
      })
    }
  };
}

function naturalRecursiveStartDomainChip(rawCommand: string): { chipKey: string; rounds: number } | null {
  const match = rawCommand
    .trim()
    .match(/^start\s+(domain-chip-[a-z0-9][a-z0-9-]{1,100})(?:\s+rounds\s+(\d+))?$/i);
  const chipKey = match?.[1]?.toLowerCase();
  if (!chipKey) return null;
  const rounds = Math.max(1, Math.min(Number.parseInt(match?.[2] || '1', 10) || 1, 25));
  return { chipKey, rounds };
}

function isNaturalDomainChipBenchmarkAutoloopFollowup(
  text: string,
  decision: NaturalRouteDecision | null,
  rawCommand: string
): boolean {
  if (decision?.context_source !== 'hot_recent_turns') return false;
  if (!naturalRecursiveStartDomainChip(rawCommand)) return false;
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized || isNoExecutionBoundary(normalized)) return false;
  return /\b(?:benchmark|benchmarks|autoloop|loop|round|pass|private\s+check|starter\s+check|local\s+check)\b/.test(normalized);
}

function formatLoopMetric(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

async function readJson(root: string, rel: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(path.join(root, rel), 'utf8'));
  } catch {
    return null;
  }
}

function chipRootFor(chipKey: string): string {
  return path.join(
    process.env.SPARK_DOMAIN_CHIPS_DIR || path.join(os.homedir(), '.spark', 'chips'),
    chipKey
  );
}

function assertSafeGeneratedCommand(command: string[], expectedCommand: string): void {
  if (!Array.isArray(command) || command.some((part) => typeof part !== 'string' || !part.trim())) {
    throw new Error('invalid generated command');
  }
  const [bin, runner, subcommand, ...rest] = command;
  if (!['python', 'python3'].includes(path.basename(bin || ''))) {
    throw new Error('generated command must use the local chip runner');
  }
  if (runner !== 'chip-runner.py' || subcommand !== expectedCommand) {
    throw new Error('generated command must use the expected chip runner hook');
  }
  const pathFlags = new Set(['--input', '--output', '--baseline-results', '--candidate-results']);
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!pathFlags.has(arg)) {
      throw new Error('generated command uses an unsupported option');
    }
    const value = rest[index + 1];
    if (!value || value.startsWith('-') || path.isAbsolute(value) || value.includes('..')) {
      throw new Error('generated command uses an unsafe artifact path');
    }
    if (!/^(?:benchmark|reports)\//.test(value)) {
      throw new Error('generated command may only read benchmark artifacts or write reports');
    }
    index += 1;
  }
}

async function runGeneratedCommand(root: string, command: string[], expectedCommand: string): Promise<void> {
  assertSafeGeneratedCommand(command, expectedCommand);
  const [bin, ...args] = command;
  await execFileAsync(bin, args, withHiddenWindows({
    cwd: root,
    timeout: Number.parseInt(process.env.DOMAIN_CHIP_FOLLOWUP_TIMEOUT_MS || '180000', 10) || 180000,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    maxBuffer: 10 * 1024 * 1024
  }));
}

async function runGeneratedDomainChipLoopSmoke(chipKey: string): Promise<GeneratedLoopSmokeResult> {
  if (!/^domain-chip-[a-z0-9][a-z0-9-]{1,100}$/.test(chipKey)) {
    return { ok: false, chipKey, error: 'invalid chip key' };
  }
  const root = chipRootFor(chipKey);
  try {
    const commands = await readJson(root, 'spark-chip.json');
    const evaluateContract = await readJson(root, 'benchmark/evaluate-run-contract.json');
    await runGeneratedCommand(root, evaluateContract?.command || [
      'python3', 'chip-runner.py', 'evaluate',
      '--input', 'benchmark/cases.jsonl',
      '--output', 'reports/local-evaluate-smoke.json'
    ], 'evaluate');
    const commandMap = commands?.commands && typeof commands.commands === 'object'
      ? commands.commands
      : commands;
    for (const name of ['loop-round', 'watchtower-check', 'rollback-check', 'loop-gate-check']) {
      await runGeneratedCommand(root, commandMap?.[name] || ['python3', 'chip-runner.py', name], name);
    }
    const round = await readJson(root, 'reports/autoloop-round-001.json');
    const gate = await readJson(root, 'reports/loop-gate-check.json');
    const result = {
      ok: true,
      chipKey,
      caseCount: round?.case_count,
      scoreDelta: round?.score_delta,
      gateStatus: gate?.gate_status || round?.round_status,
      promotionBlocked: gate?.promotion_blocked ?? round?.promotion_blocked,
      networkAbsorbable: gate?.network_absorbable ?? round?.network_absorbable
    };
    if (result.promotionBlocked !== true || result.networkAbsorbable !== false) {
      return {
        ok: false,
        chipKey,
        error: 'local proof boundary failed: promotion must stay blocked and network absorption must stay false'
      };
    }
    return result;
  } catch (error: any) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.slice(-300) : '';
    return { ok: false, chipKey, error: stderr || error?.message || 'generated loop smoke failed' };
  }
}

function renderNaturalDomainChipLoopSmoke(result: GeneratedLoopSmokeResult, chipKey: string): string {
  const label = labelForTelegram(result.chipKey || chipKey);
  const details: string[] = [];
  if (typeof result.caseCount === 'number') details.push(`${result.caseCount} practice checks ran`);
  const scoreDelta = formatLoopMetric(result.scoreDelta);
  if (scoreDelta) {
    details.push(
      Number(result.scoreDelta) > 0
        ? `it measured a ${scoreDelta} usefulness gain`
        : 'it did not show a usefulness gain yet'
    );
  }
  if (result.gateStatus) {
    details.push(
      result.gateStatus === 'blocked'
        ? 'the safety gate stayed closed'
        : `the safety gate reported ${result.gateStatus}`
    );
  }
  const paragraphs = [
    `I ran the private starter check for ${label}. It completed locally and stayed private; nothing was promoted, published, activated, sent, or absorbed.`,
    ...(details.length ? [`Starter result: ${details.join('; ')}.`] : []),
    'That proves the scaffold can run. It does not prove this chip improves real work yet. Next useful step: run separated judges against real before/after work before any activation.'
  ];
  return paragraphs.join('\n\n');
}

function loopEngineeringRunKind(text: string): 'benchmark' | 'loop' {
  const normalized = String(text || '').toLowerCase();
  if (/\b(?:autoloop|self-improv|improvement\s+loop|loop\s+rounds?|rounds?)\b/.test(normalized)) return 'loop';
  return 'benchmark';
}

function isPrivateStarterCheckRequest(text: string): boolean {
  return /\b(?:private\s+check|starter\s+check|local\s+check)\b/i.test(String(text || ''));
}

function renderSpawnerLoopEngineeringRunReply(
  result: Awaited<ReturnType<NonNullable<FollowupDeps['runLoopEngineering']>>>,
  chipKey: string,
  kind: 'benchmark' | 'loop'
): string {
  const label = labelForTelegram(chipKey);
  if (!result.success) {
    return [
      `I tried to queue the private ${kind} for ${label}, but Spawner did not accept it yet.`,
      'I kept the chip private and did not activate anything. Next safe step: open Spawner and retry once the control plane is reachable.'
    ].join('\n\n');
  }
  const base = (
    kind === 'loop'
      ? `Queued a capped private loop mission for ${label}.`
      : `Queued a private benchmark mission for ${label}.`
  );
  const proofLine = kind === 'loop'
    ? 'The generator and evaluator still have to stay separated before any lesson counts; this is not activation.'
    : 'The evaluator result still decides whether anything counts as improvement; this is not activation.';
  return [base, proofLine, result.inspectUrl ? `Spawner: ${result.inspectUrl}` : '']
    .filter(Boolean)
    .join('\n\n');
}

export async function handleNaturalDomainChipBenchmarkAutoloopFollowup(
  deps: FollowupDeps
): Promise<boolean> {
  if (!/^start\b/i.test(deps.rawCommand)) return false;
  if (!isNaturalDomainChipBenchmarkAutoloopFollowup(deps.text, deps.decision, deps.rawCommand)) return false;
  const startTarget = naturalRecursiveStartDomainChip(deps.rawCommand);
  if (!startTarget) return false;

  const authorization = deps.authorize({
    route: 'recursive.start',
    text: deps.text,
    toolName: 'recursive.loop',
    ownerSystem: 'spark-telegram-bot',
    mutationClass: 'launches_mission',
    action: 'recursive.loop.start',
    kind: 'recursive_or_swarm',
    confidence: deps.decision?.confidence === 'explicit' ? 'explicit' : 'contextual'
  });
  if (!authorization.allow) {
    await deps.replyAuthorityBlocked();
    return true;
  }

  await deps.sendTyping();
  deps.recordNaturalExecution();
  deps.recordHarnessExecution(
    authorization,
    'partial',
    `Natural Domain Chip benchmark/autoloop follow-up started for ${startTarget.chipKey}.`
  );

  if (deps.runLoopEngineering && !isPrivateStarterCheckRequest(deps.text)) {
    const kind = loopEngineeringRunKind(deps.text);
    const result = await deps.runLoopEngineering({
      kind,
      chipKey: startTarget.chipKey,
      objective: kind === 'loop'
        ? `Run a capped private self-improvement loop for ${labelForTelegram(startTarget.chipKey)} with separated evaluator evidence.`
        : `Run a private benchmark for ${labelForTelegram(startTarget.chipKey)} with separated evaluator evidence.`,
      roundLimit: startTarget.rounds,
      requestId: deps.requestId
    });
    if (!result.success) {
      const error = deps.redact(result.error || `Spawner did not accept the private ${kind} run.`);
      deps.recordHarnessExecution(
        authorization,
        'failure',
        `Spawner Loop Engineering ${kind} queue failed for ${startTarget.chipKey}: ${error}.`
      );
      const reply = renderSpawnerLoopEngineeringRunReply(result, startTarget.chipKey, kind);
      await deps.ctx.reply(reply, deps.replyExtra?.(authorization, 'failure', `Spawner Loop Engineering ${kind} queue failed for ${startTarget.chipKey}.`));
      await deps.rememberAssistantReply(reply);
      return true;
    }
    deps.recordHarnessExecution(
      authorization,
      'success',
      `Spawner Loop Engineering ${kind} queued for ${startTarget.chipKey}.`
    );
    const reply = renderSpawnerLoopEngineeringRunReply(result, startTarget.chipKey, kind);
    await deps.ctx.reply(reply, deps.replyExtra?.(authorization, 'success', `Spawner Loop Engineering ${kind} queued for ${startTarget.chipKey}.`));
    await deps.rememberAssistantReply(reply);
    return true;
  }

  const result = await runGeneratedDomainChipLoopSmoke(startTarget.chipKey);
  if (!result.ok) {
    const error = deps.redact(result.error || 'The local loop runner did not return a usable result.');
    deps.recordHarnessExecution(
      authorization,
      'failure',
      `Natural Domain Chip benchmark/autoloop follow-up failed for ${startTarget.chipKey}: ${error}.`
    );
    const reply = `I tried the private local starter check for ${labelForTelegram(startTarget.chipKey)}, but the local runner is blocked right now. I kept the chip private and did not promote it.`;
    await deps.ctx.reply(reply, deps.replyExtra?.(authorization, 'failure', `Natural Domain Chip benchmark/autoloop follow-up failed for ${startTarget.chipKey}.`));
    await deps.rememberAssistantReply(reply);
    return true;
  }

  deps.recordHarnessExecution(
    authorization,
    'success',
    `Natural Domain Chip benchmark/autoloop follow-up completed for ${startTarget.chipKey}.`
  );
  const reply = renderNaturalDomainChipLoopSmoke(result, startTarget.chipKey);
  await deps.ctx.reply(reply, deps.replyExtra?.(authorization, 'success', `Natural Domain Chip benchmark/autoloop follow-up completed for ${startTarget.chipKey}.`));
  await deps.rememberAssistantReply(reply);
  return true;
}
