import { resolveSpawnerPublicUrl, resolveSpawnerUiUrl } from './spawnerUrl';

export interface LoopEngineeringStatusCheck {
  id: string;
  label: string;
  status: 'passed' | 'attention' | 'blocked' | 'missing';
  detail: string;
}

export interface LoopEngineeringStatusPacket {
  route: 'loop_engineering.status';
  chipId: string;
  domain: string;
  readinessLabel: string;
  freshnessLabel: string;
  passCount: number;
  totalCount: number;
  resultEventCount: number;
  latestResultEvent: LoopEngineeringResultEvent | null;
  topResultEvents: LoopEngineeringResultEvent[];
  blockedChecks: LoopEngineeringStatusCheck[];
  currentScheduleLine: string | null;
  currentScheduleUpdatedAt: string | null;
  distilledLearningLine: string | null;
  nextAction: string;
  detailUrl: string;
  liveTelegramProven: boolean;
  reply: string;
}

export interface LoopEngineeringResultEvent {
  eventType: string;
  label: string;
  status: 'passed' | 'failed' | 'blocked' | 'missing' | string;
  previousScore: number | null;
  candidateScore: number | null;
  utilityDelta: number | null;
  caseCount: number | null;
  roundsObserved: number | null;
  evaluatorSeparated: boolean;
  nextAction: string;
  updatedAt: string | null;
}

export type LoopEngineeringFetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
}>;

const EXACT_CHIP_ID_PATTERN = /\bdomain-chip-[a-z0-9][a-z0-9-]{2,}\b/i;
const STATUS_LOOKUP_WORD_PATTERN = /(?:status|state|readiness|evidence|proof|gate|blocked|details?|dashboard|management|results?|latest|current|fresh|stale|can\s+(?:use|activate)|why\s+(?:blocked|not))/;
const LOOP_STATUS_PATTERN = new RegExp(
  `\\b(?:loop[-\\s]+engineering|domain[-\\s]?chip|domain\\s+chip|chip)\\b[\\s\\S]{0,140}\\b${STATUS_LOOKUP_WORD_PATTERN.source}\\b|\\b${STATUS_LOOKUP_WORD_PATTERN.source}\\b[\\s\\S]{0,140}\\b(?:loop[-\\s]+engineering|domain[-\\s]?chip|domain\\s+chip|chip)\\b`,
  'i'
);
const MUTATING_ACTION_PATTERN = /\b(?:activate|publish|register|schedule|run|start|continue|rerun|auto[-\s]?loop|autoloop|create|build|scaffold|deploy|send|move|mutate)\b/i;
const STATUS_WORD_PATTERN = new RegExp(`\\b(?:${STATUS_LOOKUP_WORD_PATTERN.source}|why)\\b`, 'i');
const DAILY_ALIAS_PATTERN = /\b(?:daily\s+schedule|schedule\s+reliability|daily\s+reminder|reminder\s+reliability)\b/i;
const PRD_ALIAS_PATTERN = /\b(?:prd\s+writing|product\s+requirements?\s+doc(?:ument)?|prd\s+chip)\b/i;
const PROJECT_MAINTENANCE_ALIAS_PATTERN = /\b(?:project\s+maintenance|maintenance\s+steward|project\s+maintenance\s+steward)\b/i;
const OPERATIONS_RESEARCH_ALIAS_PATTERN = /\b(?:operations?\s+research|operations?\s+research\s+watchdesk|or\s+watchdesk|optimization\s+watchdesk)\b/i;
const FRESHNESS_WINDOW_MS = 10_000;
const RECENT_FRESHNESS_WINDOW_MS = 15 * 60_000;

function normalizeText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

export function isLoopEngineeringStatusRequest(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const prdLoopStateStatus = PRD_ALIAS_PATTERN.test(normalized) &&
    /\b(?:loop|schedule|spawner|control[-\s]?plane)\b/i.test(normalized) &&
    /\b(?:latest|current|state|status|fresh|stale|improved|distilled|reuse|rerun|link|read[-\s]?only)\b/i.test(normalized);
  const namedChipLoopStateStatus = (
    DAILY_ALIAS_PATTERN.test(normalized) ||
    PRD_ALIAS_PATTERN.test(normalized) ||
    PROJECT_MAINTENANCE_ALIAS_PATTERN.test(normalized) ||
    OPERATIONS_RESEARCH_ALIAS_PATTERN.test(normalized)
  ) &&
    /\b(?:loop|schedule|spawner|control[-\s]?plane|benchmark|readiness|state|status|result|evidence|truth)\b/i.test(normalized) &&
    /\b(?:latest|current|state|status|fresh|stale|readiness|benchmark|results?|link|read[-\s]?only|truth|changed|blocked)\b/i.test(normalized);
  if (!LOOP_STATUS_PATTERN.test(normalized) && !prdLoopStateStatus && !namedChipLoopStateStatus) return false;
  if (MUTATING_ACTION_PATTERN.test(normalized) && !STATUS_WORD_PATTERN.test(normalized)) return false;
  if (/\b(?:build|create|scaffold)\b[\s\S]{0,80}\bdomain[-\s]?chip\b/i.test(normalized)) return false;
  return true;
}

export function resolveLoopEngineeringChipId(text: string): string | null {
  const normalized = normalizeText(text);
  const exact = normalized.match(EXACT_CHIP_ID_PATTERN)?.[0]?.toLowerCase();
  if (exact) return exact;
  if (DAILY_ALIAS_PATTERN.test(normalized)) return 'domain-chip-daily-schedule-reliability-r30-persisted-context-qa';
  if (PRD_ALIAS_PATTERN.test(normalized)) return 'domain-chip-prd-writing-proof-loop';
  if (PROJECT_MAINTENANCE_ALIAS_PATTERN.test(normalized)) return 'domain-chip-project-maintenance-steward-r30-usefulness-loop';
  if (OPERATIONS_RESEARCH_ALIAS_PATTERN.test(normalized)) return 'domain-chip-operations-research-watchdesk-r30-bridge-qa';
  return null;
}

function topBlockedChecks(checks: LoopEngineeringStatusCheck[]): LoopEngineeringStatusCheck[] {
  return checks
    .filter((check) => check.status === 'blocked' || check.status === 'missing')
    .slice(0, 3);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resultEventFromValue(value: any): LoopEngineeringResultEvent | null {
  if (!value || typeof value !== 'object') return null;
  const label = typeof value.label === 'string' && value.label.trim() ? value.label.trim() : null;
  const eventType = typeof value.eventType === 'string' && value.eventType.trim() ? value.eventType.trim() : null;
  if (!label || !eventType) return null;
  return {
    eventType,
    label,
    status: typeof value.status === 'string' && value.status.trim() ? value.status.trim() : 'missing',
    previousScore: numberOrNull(value.previousScore),
    candidateScore: numberOrNull(value.candidateScore),
    utilityDelta: numberOrNull(value.utilityDelta),
    caseCount: numberOrNull(value.commandResult?.caseCount ?? value.caseCount),
    roundsObserved: numberOrNull(value.roundsObserved),
    evaluatorSeparated: value.evaluatorSeparated === true,
    nextAction: typeof value.nextAction === 'string' && value.nextAction.trim() ? value.nextAction.trim() : 'Inspect the event evidence.',
    updatedAt: typeof value.updatedAt === 'string' && value.updatedAt.trim() ? value.updatedAt.trim() : null
  };
}

function topResultEvents(events: LoopEngineeringResultEvent[]): LoopEngineeringResultEvent[] {
  const rank: Record<string, number> = {
    benchmark_run: 0,
    loop_batch: 1,
    evaluator_review: 2,
    watchtower_check: 3,
    rollback_check: 4,
    activation_gate: 5,
    schedule_contract: 6,
    schedule_lifecycle: 7
  };
  return [...events]
    .filter((event) => event.status === 'passed' || event.status === 'blocked' || event.status === 'failed')
    .sort((a, b) => (rank[a.eventType] ?? 99) - (rank[b.eventType] ?? 99) || a.label.localeCompare(b.label))
    .slice(0, 4);
}

function eventTimestampMs(event: LoopEngineeringResultEvent): number {
  if (!event.updatedAt) return 0;
  const parsed = Date.parse(event.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestResultEvent(events: LoopEngineeringResultEvent[]): LoopEngineeringResultEvent | null {
  const relevant = events.filter((event) =>
    ['benchmark_run', 'loop_batch', 'evaluator_review', 'watchtower_check', 'rollback_check', 'activation_gate', 'schedule_contract', 'schedule_created', 'schedule_lifecycle'].includes(event.eventType)
  );
  const sorted = relevant.sort((a, b) => eventTimestampMs(b) - eventTimestampMs(a));
  return sorted[0] || null;
}

function formatDelta(value: number | null): string {
  if (typeof value !== 'number') return '';
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function formatEventWorkUnits(event: LoopEngineeringResultEvent): string | null {
  if (event.eventType === 'benchmark_run') {
    if (typeof event.caseCount === 'number') return `${event.caseCount} cases`;
    if (typeof event.roundsObserved === 'number') return `${event.roundsObserved} cases`;
    return null;
  }
  if (typeof event.roundsObserved === 'number') return `${event.roundsObserved} rounds`;
  return null;
}

function renderEventLine(events: LoopEngineeringResultEvent[]): string {
  if (!events.length) return 'I do not see loop result events in the Spawner packet yet.';
  const parts = events.map((event) => {
    const details: string[] = [];
    const delta = formatDelta(event.utilityDelta);
    if (delta) details.push(delta);
    const units = formatEventWorkUnits(event);
    if (units) details.push(units);
    if (event.evaluatorSeparated) details.push('separated evaluator');
    return `${event.label} ${event.status}${details.length ? ` (${details.join(', ')})` : ''}`;
  });
  return `Loop results: ${parts.join('; ')}.`;
}

function renderLatestEventLine(event: LoopEngineeringResultEvent | null): string {
  if (!event) return 'Latest result: I do not see a completed loop or benchmark event in the current Spawner packet yet.';
  const delta = formatDelta(event.utilityDelta);
  const details: string[] = [];
  if (typeof event.previousScore === 'number' && typeof event.candidateScore === 'number') {
    details.push(`${event.previousScore.toFixed(1)} -> ${event.candidateScore.toFixed(1)}`);
  } else if (delta) {
    details.push(delta);
  }
  const units = formatEventWorkUnits(event);
  if (units) details.push(units);
  if (event.evaluatorSeparated) details.push('separated evaluator');
  if (event.updatedAt) details.push(event.updatedAt);
  return `Latest result: ${event.label} ${event.status}${details.length ? ` (${details.join(', ')})` : ''}.`;
}

function readableBlockedCheck(check: LoopEngineeringStatusCheck): string {
  if (check.id === 'hard_blockers') {
    const detail = check.detail.trim().replace(/_/g, ' ');
    return detail || 'operator approval missing';
  }
  if (check.id === 'live_telegram_proof') return 'live Telegram proof missing';
  if (check.id === 'local_telegram_handler') return 'local Telegram fast-path proof missing';
  return check.label;
}

function readableActionText(value: string): string {
  return value.replace(/operator_publication_approval_missing/g, 'operator publication approval missing');
}

function renderActivationProofLine(packet: Pick<LoopEngineeringStatusPacket, 'blockedChecks' | 'liveTelegramProven'>): string {
  const blockers = packet.blockedChecks.map(readableBlockedCheck).filter(Boolean);
  if (packet.liveTelegramProven && blockers.length === 0) {
    return 'Activation proof: live Telegram proof is present and I do not see readiness blockers in Spawner.';
  }
  if (blockers.length) {
    return `Activation proof: not live-approved yet; blockers I can prove are ${blockers.join(', ')}.`;
  }
  return 'Activation proof: no readiness blocker is listed in Spawner, but activation still needs scoped approval.';
}

function timestampMs(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s old`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m old`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h old`;
  const days = Math.round(hours / 24);
  return `${days}d old`;
}

function freshnessLabelFromTimestamp(latestTimestamp: string, nowMs: number): string {
  if (!latestTimestamp) return 'read from Spawner now; no event timestamp was present.';
  const parsed = timestampMs(latestTimestamp);
  if (!parsed) return `read from Spawner now; latest Spawner event timestamp is ${latestTimestamp}; freshness: unknown.`;
  const ageMs = nowMs - parsed;
  if (Math.abs(ageMs) <= FRESHNESS_WINDOW_MS) {
    return `read from Spawner now; latest Spawner event timestamp is ${latestTimestamp}; freshness: fresh within 10s.`;
  }
  if (ageMs < 0) {
    return `read from Spawner now; latest Spawner event timestamp is ${latestTimestamp}; freshness: clock-skew/future timestamp.`;
  }
  if (ageMs <= RECENT_FRESHNESS_WINDOW_MS) {
    return `read from Spawner now; latest Spawner event timestamp is ${latestTimestamp}; freshness: recent (${formatAge(ageMs)}).`;
  }
  return `read from Spawner now; latest Spawner event timestamp is ${latestTimestamp}; freshness: stale (${formatAge(ageMs)}).`;
}

function currentScheduleFromChip(chip: any): { line: string | null; updatedAt: string | null } {
  const schedules = Array.isArray(chip?.schedules) ? chip.schedules : [];
  const latest = [...schedules]
    .filter((item) => item && typeof item === 'object')
    .sort((a, b) => {
      const bTime = Math.max(timestampMs(b.updatedAt), timestampMs(b.lastRunAt), timestampMs(b.createdAt));
      const aTime = Math.max(timestampMs(a.updatedAt), timestampMs(a.lastRunAt), timestampMs(a.createdAt));
      return bTime - aTime;
    })[0];
  if (!latest) return { line: null, updatedAt: null };

  const rawStatus = typeof latest.status === 'string' && latest.status.trim() ? latest.status.trim() : 'unknown';
  const status = rawStatus.replace(/_/g, ' ');
  const active = latest.active === true ? 'active' : 'inactive';
  const updatedAt = typeof latest.updatedAt === 'string' && latest.updatedAt.trim()
    ? latest.updatedAt.trim()
    : (typeof latest.lastRunAt === 'string' && latest.lastRunAt.trim() ? latest.lastRunAt.trim() : null);
  const lastRun = typeof latest.lastRunAt === 'string' && latest.lastRunAt.trim() ? latest.lastRunAt.trim() : null;
  const timing = [
    updatedAt ? `last changed ${updatedAt}` : '',
    lastRun && lastRun !== updatedAt ? `last run ${lastRun}` : ''
  ].filter(Boolean).join('; ');
  return {
    line: `Current schedule: ${status}, ${active}${timing ? ` (${timing})` : ''}.`,
    updatedAt
  };
}

function distilledLearningLineFromChip(chip: any): string | null {
  const distillations = Array.isArray(chip?.distillations) ? chip.distillations : [];
  const latest = [...distillations]
    .filter((item) => item && typeof item === 'object' && item.status !== 'rejected')
    .sort((a, b) => Date.parse(String(b.updatedAt || b.createdAt || '')) - Date.parse(String(a.updatedAt || a.createdAt || '')))[0];
  if (!latest) return null;
  const lesson = Array.isArray(latest.lessons)
    ? latest.lessons.find((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim()))
    : '';
  const cleanLesson = String(lesson || '').trim();
  const tokenHint = typeof latest.tokenBudgetHint === 'string' && latest.tokenBudgetHint.trim()
    ? latest.tokenBudgetHint.trim()
    : 'reuse this lesson before rerunning the full loop when the PRD request fits the same case shape.';
  if (!cleanLesson) return `Distilled reuse: Spawner has a reusable lesson staged; ${tokenHint}`;
  return `Distilled reuse: ${cleanLesson} ${tokenHint}`;
}

function wantsCompactLatestReply(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  return (
    /\blink\s+only\b/.test(normalized) ||
    (
      /\blatest\b/.test(normalized) &&
      /\b(?:schedule|loop|result|state)\b/.test(normalized) &&
      /\b(?:fresh|stale|freshness)\b/.test(normalized)
    )
  );
}

function wantsDistilledLearningLine(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  return /\b(?:what improved|improved|distilled|reuse|rerun|without rerun|without rerunning|next prds?)\b/.test(normalized);
}

function renderCompactReply(packet: Omit<LoopEngineeringStatusPacket, 'reply'>): string {
  const lines = [
    `${packet.domain} is ${packet.readinessLabel.toLowerCase()} (${packet.passCount}/${packet.totalCount} checks pass); ${packet.freshnessLabel}`,
    renderLatestEventLine(packet.latestResultEvent),
    renderEventLine(packet.topResultEvents),
    renderActivationProofLine(packet),
    ...(packet.currentScheduleLine ? [packet.currentScheduleLine] : []),
    'I only read Spawner here; nothing was queued or changed.'
  ];
  lines.push(`Details: ${packet.detailUrl}`);
  return lines.join('\n');
}

function renderReply(packet: Omit<LoopEngineeringStatusPacket, 'reply'>, text = ''): string {
  if (wantsCompactLatestReply(text)) {
    const reply = renderCompactReply(packet);
    if (!wantsDistilledLearningLine(text)) return reply;
    const lines = reply.split('\n');
    lines.splice(Math.max(2, lines.length - 2), 0, packet.distilledLearningLine || 'Distilled reuse: I do not see a reusable distilled lesson in Spawner yet.');
    return lines.join('\n');
  }
  const blockedLine = packet.blockedChecks.length
    ? `The blockers I can prove are ${packet.blockedChecks.map(readableBlockedCheck).join(', ')}.`
    : 'I do not see a blocker in the current readiness packet.';
  return [
    `${packet.domain} is ${packet.readinessLabel.toLowerCase()}: ${packet.passCount}/${packet.totalCount} checks pass. ${blockedLine}`,
    `Freshness: ${packet.freshnessLabel}`,
    renderLatestEventLine(packet.latestResultEvent),
    renderActivationProofLine(packet),
    ...(packet.currentScheduleLine ? [packet.currentScheduleLine] : []),
    ...(wantsDistilledLearningLine(text) ? [packet.distilledLearningLine || 'Distilled reuse: I do not see a reusable distilled lesson in Spawner yet.'] : []),
    renderEventLine(packet.topResultEvents),
    'I only read Spawner here; no loop, benchmark, schedule, activation, or publication was queued.',
    '',
    `Next safe step: ${readableActionText(packet.nextAction)}`,
    `Details: ${packet.detailUrl}`
  ].join('\n');
}

function unavailablePacket(input: {
  chipId: string;
  publicBaseUrl: string;
  reason: string;
  kind?: 'unreachable' | 'unreadable';
}): LoopEngineeringStatusPacket {
  const detailUrl = `${input.publicBaseUrl}/loop-engineering/${encodeURIComponent(input.chipId)}`;
  const isUnreachable = input.kind === 'unreachable';
  const firstLine = isUnreachable
    ? `I found the chip key ${input.chipId}, but Spawner is unavailable right now, so I cannot verify the latest state or freshness from Telegram.`
    : `I found the chip key ${input.chipId}, but Spawner did not return a readable evidence packet for it yet.`;
  const freshnessLabel = isUnreachable
    ? 'Spawner is unavailable, so freshness could not be verified from Telegram.'
    : 'Spawner evidence was not readable from Telegram.';
  const nextAction = isUnreachable
    ? 'Restart or open Spawner, then ask for status again.'
    : 'Open Spawner or register the private chip evidence, then ask for status again.';
  return {
    route: 'loop_engineering.status',
    chipId: input.chipId,
    domain: input.chipId.replace(/^domain-chip-/, '').replace(/-/g, ' '),
    readinessLabel: 'Evidence unavailable',
    freshnessLabel,
    passCount: 0,
    totalCount: 1,
    resultEventCount: 0,
    latestResultEvent: null,
    topResultEvents: [],
    blockedChecks: [
      {
        id: 'spawner_evidence_unavailable',
        label: 'Spawner evidence packet',
        status: 'blocked',
        detail: input.reason
      }
    ],
    currentScheduleLine: null,
    currentScheduleUpdatedAt: null,
    distilledLearningLine: null,
    nextAction,
    detailUrl,
    liveTelegramProven: false,
    reply: [
      firstLine,
      'I did not queue any loop, benchmark, schedule, activation, or publication.',
      '',
      `Next safe step: ${nextAction}`,
      `Details: ${detailUrl}`
    ].join('\n')
  };
}

export async function fetchLoopEngineeringStatusPacket(
  text: string,
  options: { fetchImpl?: LoopEngineeringFetchLike; timeoutMs?: number; nowMs?: number } = {}
): Promise<LoopEngineeringStatusPacket | null> {
  if (!isLoopEngineeringStatusRequest(text)) return null;
  const chipId = resolveLoopEngineeringChipId(text);
  if (!chipId) {
    const baseUrl = resolveSpawnerPublicUrl().replace(/\/+$/, '');
    const detailUrl = `${baseUrl}/loop-engineering`;
    return {
      route: 'loop_engineering.status',
      chipId: '',
      domain: 'Loop Engineering',
      readinessLabel: 'Needs chip selection',
      freshnessLabel: 'No chip was selected, so no Spawner evidence was read.',
      passCount: 0,
      totalCount: 0,
      resultEventCount: 0,
      latestResultEvent: null,
      topResultEvents: [],
      blockedChecks: [],
      currentScheduleLine: null,
      currentScheduleUpdatedAt: null,
      distilledLearningLine: null,
      nextAction: 'Name a specific domain chip, such as Daily Schedule Reliability, so I can read its evidence packet.',
      detailUrl,
      liveTelegramProven: false,
      reply: [
        'I can check Loop Engineering status, but I need the specific chip first.',
        '',
        `Open the board: ${detailUrl}`
      ].join('\n')
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const internalBaseUrl = resolveSpawnerUiUrl().replace(/\/+$/, '');
  const publicBaseUrl = resolveSpawnerPublicUrl().replace(/\/+$/, '');
  try {
    const response = await fetchImpl(`${internalBaseUrl}/api/loop-engineering/chips/${encodeURIComponent(chipId)}`, {
      signal: controller.signal
    });
    if (!response.ok) {
      return unavailablePacket({
        chipId,
        publicBaseUrl,
        reason: `Spawner returned HTTP ${response.status}.`
      });
    }
    const body = await response.json();
    const chip = body?.chip;
    if (!chip || typeof chip !== 'object') {
      return unavailablePacket({
        chipId,
        publicBaseUrl,
        reason: 'Spawner response did not include a chip evidence packet.'
      });
    }
    const summary = chip?.summary ?? {};
    const readiness = chip?.readiness ?? {};
    const checks = Array.isArray(readiness.checks) ? readiness.checks as LoopEngineeringStatusCheck[] : [];
    const events = Array.isArray(chip?.events)
      ? chip.events.map(resultEventFromValue).filter((event: LoopEngineeringResultEvent | null): event is LoopEngineeringResultEvent => Boolean(event))
      : [];
    const latestEvent = latestResultEvent(events);
    const scheduleState = currentScheduleFromChip(chip);
    const latestTimestamp = [latestEvent?.updatedAt, scheduleState.updatedAt, typeof summary.updatedAt === 'string' ? summary.updatedAt : '']
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .sort((a, b) => timestampMs(b) - timestampMs(a))[0] || '';
    const nowMs = typeof options.nowMs === 'number' && Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
    const packetBase = {
      route: 'loop_engineering.status' as const,
      chipId,
      domain: String(summary.domain || chipId),
      readinessLabel: String(readiness.label || 'Unknown readiness'),
      freshnessLabel: freshnessLabelFromTimestamp(latestTimestamp, nowMs),
      passCount: Number(readiness.passCount || 0),
      totalCount: Number(readiness.totalCount || 0),
      resultEventCount: events.length,
      latestResultEvent: latestEvent,
      topResultEvents: topResultEvents(events),
      blockedChecks: topBlockedChecks(checks),
      currentScheduleLine: scheduleState.line,
      currentScheduleUpdatedAt: scheduleState.updatedAt,
      distilledLearningLine: distilledLearningLineFromChip(chip),
      nextAction: String(readiness.nextAction || summary.nextAction || 'Inspect the chip evidence before taking action.'),
      detailUrl: `${publicBaseUrl}/loop-engineering/${encodeURIComponent(chipId)}`,
      liveTelegramProven: Boolean(summary.activation?.liveTelegramProven)
    };
    return {
      ...packetBase,
      reply: renderReply(packetBase, text)
    };
  } catch {
    return unavailablePacket({
      chipId,
      publicBaseUrl,
      reason: 'Spawner could not be reached from Telegram.',
      kind: 'unreachable'
    });
  } finally {
    clearTimeout(timeout);
  }
}
