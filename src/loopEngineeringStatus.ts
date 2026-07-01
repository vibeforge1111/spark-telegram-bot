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
  roundsObserved: number | null;
  evaluatorSeparated: boolean;
  nextAction: string;
  updatedAt: string | null;
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
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

function normalizeText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

export function isLoopEngineeringStatusRequest(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  if (!LOOP_STATUS_PATTERN.test(normalized)) return false;
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
    schedule_contract: 6
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
    ['benchmark_run', 'loop_batch', 'evaluator_review', 'watchtower_check', 'rollback_check', 'activation_gate', 'schedule_contract', 'schedule_created'].includes(event.eventType)
  );
  const sorted = relevant.sort((a, b) => eventTimestampMs(b) - eventTimestampMs(a));
  return sorted[0] || null;
}

function formatDelta(value: number | null): string {
  if (typeof value !== 'number') return '';
  return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function renderEventLine(events: LoopEngineeringResultEvent[]): string {
  if (!events.length) return 'I do not see loop result events in the Spawner packet yet.';
  const parts = events.map((event) => {
    const details: string[] = [];
    const delta = formatDelta(event.utilityDelta);
    if (delta) details.push(delta);
    if (typeof event.roundsObserved === 'number') details.push(`${event.roundsObserved} rounds`);
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
  if (typeof event.roundsObserved === 'number') details.push(`${event.roundsObserved} rounds`);
  if (event.evaluatorSeparated) details.push('separated evaluator');
  if (event.updatedAt) details.push(event.updatedAt);
  return `Latest result: ${event.label} ${event.status}${details.length ? ` (${details.join(', ')})` : ''}.`;
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

function renderCompactReply(packet: Omit<LoopEngineeringStatusPacket, 'reply'>): string {
  return [
    `${packet.domain} is ${packet.readinessLabel.toLowerCase()} (${packet.passCount}/${packet.totalCount} checks pass); ${packet.freshnessLabel}`,
    renderLatestEventLine(packet.latestResultEvent),
    'I only read Spawner here; nothing was queued or changed.',
    `Details: ${packet.detailUrl}`
  ].join('\n');
}

function renderReply(packet: Omit<LoopEngineeringStatusPacket, 'reply'>, text = ''): string {
  if (wantsCompactLatestReply(text)) return renderCompactReply(packet);
  const blockedLine = packet.blockedChecks.length
    ? `The blockers I can prove are ${packet.blockedChecks.map((check) => check.label).join(', ')}.`
    : 'I do not see a blocker in the current readiness packet.';
  return [
    `${packet.domain} is ${packet.readinessLabel.toLowerCase()}: ${packet.passCount}/${packet.totalCount} checks pass. ${blockedLine}`,
    `Freshness: ${packet.freshnessLabel}`,
    renderLatestEventLine(packet.latestResultEvent),
    renderEventLine(packet.topResultEvents),
    'I only read Spawner here; no loop, benchmark, schedule, activation, or publication was queued.',
    '',
    `Next safe step: ${packet.nextAction}`,
    `Details: ${packet.detailUrl}`
  ].join('\n');
}

function unavailablePacket(input: {
  chipId: string;
  publicBaseUrl: string;
  reason: string;
}): LoopEngineeringStatusPacket {
  const detailUrl = `${input.publicBaseUrl}/loop-engineering/${encodeURIComponent(input.chipId)}`;
  return {
    route: 'loop_engineering.status',
    chipId: input.chipId,
    domain: input.chipId.replace(/^domain-chip-/, '').replace(/-/g, ' '),
    readinessLabel: 'Evidence unavailable',
    freshnessLabel: 'Spawner evidence was not readable from Telegram.',
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
    nextAction: 'Open Spawner or register the private chip evidence, then ask for status again.',
    detailUrl,
    liveTelegramProven: false,
    reply: [
      `I found the chip key ${input.chipId}, but Spawner did not return a readable evidence packet for it yet.`,
      'I did not queue any loop, benchmark, schedule, activation, or publication.',
      '',
      `Next safe step: Open Spawner or register the private chip evidence, then ask for status again.`,
      `Details: ${detailUrl}`
    ].join('\n')
  };
}

export async function fetchLoopEngineeringStatusPacket(
  text: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}
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
    const latestTimestamp = latestEvent?.updatedAt || (typeof summary.updatedAt === 'string' ? summary.updatedAt : '');
    const packetBase = {
      route: 'loop_engineering.status' as const,
      chipId,
      domain: String(summary.domain || chipId),
      readinessLabel: String(readiness.label || 'Unknown readiness'),
      freshnessLabel: latestTimestamp
        ? `read from Spawner now; latest Spawner event timestamp is ${latestTimestamp}.`
        : 'read from Spawner now; no event timestamp was present.',
      passCount: Number(readiness.passCount || 0),
      totalCount: Number(readiness.totalCount || 0),
      resultEventCount: events.length,
      latestResultEvent: latestEvent,
      topResultEvents: topResultEvents(events),
      blockedChecks: topBlockedChecks(checks),
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
      reason: 'Spawner could not be reached from Telegram.'
    });
  } finally {
    clearTimeout(timeout);
  }
}
