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

function normalizeLookupText(text: string): string {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isLoopEngineeringStatusRequest(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return false;
  const domainChipPlanning =
    /\bdomain[-\s]?chip\b/i.test(normalized) &&
    /\b(?:options?|proposals?|compare|comparing|discuss|discussion|which|what)\b/i.test(normalized);
  const operationalStatus =
    /\b(?:status|state|readiness|results?|latest|current|fresh|stale|blocked|dashboard|management)\b/i.test(normalized);
  if (domainChipPlanning && !operationalStatus) return false;
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
  const registryBackedLoopStatus =
    /\b(?:spawner|control[-\s]?plane|domain[-\s]?chip|chip)\b/i.test(normalized) &&
    (/\b(?:loop|benchmark|schedule|readiness)\b[\s\S]{0,100}\b(?:latest|current|state|status|fresh|stale|results?|evidence|blocked|changed)\b|\b(?:latest|current|state|status|fresh|stale|results?|evidence|blocked|changed)\b[\s\S]{0,100}\b(?:loop|benchmark|schedule|readiness)\b/i.test(normalized));
  if (!LOOP_STATUS_PATTERN.test(normalized) && !prdLoopStateStatus && !namedChipLoopStateStatus && !registryBackedLoopStatus) return false;
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

function registryChipIdFromBody(text: string, body: any): string | null {
  const registry = Array.isArray(body?.registry) ? body.registry : [];
  const lookup = normalizeLookupText(text);
  if (!lookup) return null;
  let best: { id: string; score: number } | null = null;
  for (const item of registry) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!EXACT_CHIP_ID_PATTERN.test(id)) continue;
    const candidates = [
      typeof item.domain === 'string' ? item.domain : '',
      typeof item.name === 'string' ? item.name : '',
      id.replace(/^domain-chip-/, '')
    ].map(normalizeLookupText).filter(Boolean);
    for (const candidate of candidates) {
      if (!candidate || candidate.length < 4) continue;
      const candidateTokens = candidate.split(' ').filter((token) => token.length > 2);
      const matchedTokens = candidateTokens.filter((token) => lookup.includes(token));
      const phraseMatch = lookup.includes(candidate);
      const score = (phraseMatch ? 100 : 0) + matchedTokens.length * 10 + Math.min(candidateTokens.length, 8);
      const enoughTokenCoverage = matchedTokens.length >= Math.min(2, candidateTokens.length);
      if ((phraseMatch || enoughTokenCoverage) && (!best || score > best.score)) {
        best = { id: id.toLowerCase(), score };
      }
    }
  }
  return best?.id ?? null;
}

async function resolveLoopEngineeringChipIdFromRegistry(
  text: string,
  fetchImpl: LoopEngineeringFetchLike,
  internalBaseUrl: string,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const response = await fetchImpl(`${internalBaseUrl}/api/loop-engineering/chips`, { signal });
    if (!response.ok) return null;
    const body = await response.json();
    return registryChipIdFromBody(text, body);
  } catch {
    return null;
  }
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

function renderShortEvent(event: LoopEngineeringResultEvent): string {
  const details: string[] = [];
  const delta = formatDelta(event.utilityDelta);
  if (delta) details.push(delta);
  const units = formatEventWorkUnits(event);
  if (units) details.push(units);
  return `${event.label} ${event.status}${details.length ? ` (${details.join(', ')})` : ''}`;
}

function renderEvidenceBrief(events: LoopEngineeringResultEvent[], latest: LoopEngineeringResultEvent | null): string | null {
  const latestKey = latest ? `${latest.eventType}:${latest.label}:${latest.updatedAt || ''}` : '';
  const others = events
    .filter((event) => `${event.eventType}:${event.label}:${event.updatedAt || ''}` !== latestKey)
    .slice(0, 2);
  if (!others.length) return null;
  return `Other evidence: ${others.map(renderShortEvent).join('; ')}.`;
}

function renderLatestEventForTelegram(event: LoopEngineeringResultEvent | null): string {
  if (!event) return 'Latest: I do not see a completed loop or benchmark event in Spawner yet.';
  const status = String(event.status || '').trim();
  const label = event.label.trim();
  const firstSentence = status === 'passed' && /\b(?:completed|executed|queued|cancelled)\b/i.test(label)
    ? `Latest: ${label}.`
    : `Latest: ${label}${status ? ` ${status}` : ''}.`;
  const details: string[] = [];
  if (typeof event.previousScore === 'number' && typeof event.candidateScore === 'number') {
    details.push(`Score ${event.previousScore.toFixed(1)} -> ${event.candidateScore.toFixed(1)}`);
  } else {
    const delta = formatDelta(event.utilityDelta);
    if (delta) details.push(`Delta ${delta}`);
  }
  const units = formatEventWorkUnits(event);
  if (units) details.push(units);
  if (event.evaluatorSeparated) details.push('separated evaluator');
  return details.length ? `${firstSentence} ${details.join('; ')}.` : firstSentence;
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

function renderActivationForTelegram(packet: Pick<LoopEngineeringStatusPacket, 'blockedChecks' | 'liveTelegramProven'>): string {
  const blockers = packet.blockedChecks.map(readableBlockedCheck).filter(Boolean);
  if (packet.liveTelegramProven && blockers.length === 0) {
    return 'Live Telegram proof is present, and I do not see readiness blockers in Spawner.';
  }
  if (blockers.length) {
    return `Activation is still blocked by ${blockers.join(', ')}.`;
  }
  return 'Activation still needs scoped approval before use.';
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

function renderFreshnessForTelegram(freshnessLabel: string): string {
  const match = freshnessLabel.match(/latest Spawner event timestamp is ([^;]+);\s*freshness:\s*([^.]*)\./i);
  if (match) return `Freshness: ${match[2]}. Latest Spawner event: ${match[1]}.`;
  return `Freshness: ${freshnessLabel}`;
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

function renderScheduleForTelegram(line: string | null): string | null {
  if (!line) return null;
  const match = line.match(/^Current schedule:\s*([^,]+),\s*([^(.]+)(?:\s*\(([^)]*)\))?\./i);
  if (!match) return line;
  const status = match[1].trim();
  const active = match[2].trim();
  const timing = match[3]?.trim();
  return `Schedule: ${status} and ${active}${timing ? ` (${timing})` : ''}.`;
}

function privateReadOnlyLine(): string {
  return 'Still private: I only read Spawner here; nothing was queued or changed.';
}

function noMutationLine(): string {
  return 'Still private: I only read Spawner here; no loop, benchmark, schedule, activation, or publication was queued.';
}

function bulletLine(value: string | null | undefined): string | null {
  const clean = String(value || '').trim();
  return clean ? `• ${clean}` : null;
}

function renderProofBlock(lines: Array<string | null | undefined>): string | null {
  const bullets = lines.map(bulletLine).filter((line): line is string => Boolean(line));
  return bullets.length ? ['Proof:', ...bullets].join('\n') : null;
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
      /\b(?:fresh|stale|freshness|link|status)\b/.test(normalized)
    )
  );
}

function wantsDistilledLearningLine(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  return /\b(?:what improved|improved|distilled|reuse|rerun|without rerun|without rerunning|next prds?)\b/.test(normalized);
}

function renderCompactReply(packet: Omit<LoopEngineeringStatusPacket, 'reply'>, text = ''): string {
  const wantsDistillation = wantsDistilledLearningLine(text);
  const activationLine = renderActivationForTelegram(packet);
  const scheduleLine = renderScheduleForTelegram(packet.currentScheduleLine);
  const learningOrEvidence = wantsDistillation
    ? packet.distilledLearningLine || 'I do not see a reusable distilled lesson in Spawner yet.'
    : renderEvidenceBrief(packet.topResultEvents, packet.latestResultEvent);
  const paragraphs = [
    `${packet.domain} is ${packet.readinessLabel.toLowerCase()}: ${packet.passCount}/${packet.totalCount} checks pass.`,
    renderProofBlock([
      renderFreshnessForTelegram(packet.freshnessLabel),
      renderLatestEventForTelegram(packet.latestResultEvent),
      scheduleLine,
      wantsDistillation ? learningOrEvidence : null,
      !wantsDistillation ? learningOrEvidence : null,
      activationLine
    ]),
    privateReadOnlyLine(),
    `Next: ${readableActionText(packet.nextAction)}`,
    `Spawner: ${packet.detailUrl}`
  ];
  return paragraphs.filter(Boolean).join('\n\n');
}

function renderReply(packet: Omit<LoopEngineeringStatusPacket, 'reply'>, text = ''): string {
  if (wantsCompactLatestReply(text)) {
    return renderCompactReply(packet, text);
  }
  const blockedLine = packet.blockedChecks.length
    ? `Blocked by: ${packet.blockedChecks.map(readableBlockedCheck).join(', ')}.`
    : 'I do not see a blocker in the current Spawner evidence.';
  const freshnessLine = renderFreshnessForTelegram(packet.freshnessLabel);
  const scheduleAndDistillation = [
    renderScheduleForTelegram(packet.currentScheduleLine),
    wantsDistilledLearningLine(text) ? packet.distilledLearningLine || 'Distilled reuse: I do not see a reusable distilled lesson in Spawner yet.' : ''
  ].filter(Boolean).join(' ');
  const activationLine = renderActivationForTelegram(packet);
  const evidenceLine = renderEvidenceBrief(packet.topResultEvents, packet.latestResultEvent);
  return [
    `${packet.domain} is ${packet.readinessLabel.toLowerCase()}: ${packet.passCount}/${packet.totalCount} checks pass. ${blockedLine}`,
    renderProofBlock([
      freshnessLine,
      renderLatestEventForTelegram(packet.latestResultEvent),
      activationLine,
      scheduleAndDistillation,
      evidenceLine
    ]),
    noMutationLine(),
    `Next: ${readableActionText(packet.nextAction)}`,
    `Spawner: ${packet.detailUrl}`
  ].join('\n\n');
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
      `Spawner: ${detailUrl}`
    ].join('\n\n')
  };
}

export async function fetchLoopEngineeringStatusPacket(
  text: string,
  options: { fetchImpl?: LoopEngineeringFetchLike; timeoutMs?: number; nowMs?: number } = {}
): Promise<LoopEngineeringStatusPacket | null> {
  if (!isLoopEngineeringStatusRequest(text)) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const internalBaseUrl = resolveSpawnerUiUrl().replace(/\/+$/, '');
  const publicBaseUrl = resolveSpawnerPublicUrl().replace(/\/+$/, '');
  const chipId = resolveLoopEngineeringChipId(text) ||
    await resolveLoopEngineeringChipIdFromRegistry(text, fetchImpl, internalBaseUrl, controller.signal);
  if (!chipId) {
    clearTimeout(timeout);
    const detailUrl = `${publicBaseUrl}/loop-engineering`;
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
        'I only read Spawner evidence here; nothing will be queued, activated, or published.',
        '',
        `Spawner: ${detailUrl}`
      ].join('\n\n')
    };
  }
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
