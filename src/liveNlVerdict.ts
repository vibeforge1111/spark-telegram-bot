import {
  createTelegramLiveQaEvidencePacket,
  type TelegramLiveQaEvidencePacketV1,
  type TelegramLiveQaVerdict
} from '@spark/harness-core';

export type LiveNlRisk = 'safe' | 'mission' | 'writes_files' | 'external';

export interface LiveNlCommandCase {
  id: string;
  suite: string;
  risk: LiveNlRisk;
  prompt: string;
  turns?: string[];
  expectedRoute: string;
  expectedOutcome: string;
}

export interface LiveNlSelection {
  caseId?: string | null;
  caseIds?: string[];
  suite?: string | null;
  includeRisky?: boolean;
}

export interface LiveNlVerdictReportOptions {
  generatedAt?: Date;
  title?: string;
  suite?: string | null;
}

export interface LiveNlEvidencePacketOptions {
  generatedAt?: Date;
  title?: string;
  catalog?: string;
  suite?: string | null;
  includeRisky?: boolean;
  runId?: string;
  requiredSessionEvidence?: Partial<TelegramLiveQaEvidencePacketV1['required_session_evidence']>;
}

export interface LiveNlCopyPasteOptions {
  title?: string;
}

export type LiveNlHarnessCoreAuthorityExpectation =
  | 'chat_only'
  | 'read_only_allowed'
  | 'confirmation_required_or_allowed'
  | 'blocked_without_authority';

export type LiveNlHarnessCoreMutationClass =
  | 'none'
  | 'read_only'
  | 'writes_memory'
  | 'writes_files'
  | 'launches_mission'
  | 'external_network'
  | 'updates_access_setting'
  | 'media_read';

export type LiveNlHarnessCoreUse =
  | 'keep_legacy_breadth'
  | 'promote_after_refurbish'
  | 'run_only_with_intentional_action_confirmation';

export interface LiveNlHarnessCoreMapping {
  id: string;
  suite: string;
  risk: LiveNlRisk;
  expectedRoute: string;
  expectedAuthority: LiveNlHarnessCoreAuthorityExpectation;
  expectedMutationClass: LiveNlHarnessCoreMutationClass;
  recommendedUse: LiveNlHarnessCoreUse;
  proofRequiredIfPromoted: boolean;
  captureRequired: string[];
  notes: string[];
}

export interface LiveNlHarnessCoreMapOptions {
  catalog?: string;
  title?: string;
}

type LiveNlPacketCase = TelegramLiveQaEvidencePacketV1['cases'][number];
type LiveNlObservedTurn = LiveNlPacketCase['observed_turns'][number];
type LiveNlSideEffects = LiveNlPacketCase['side_effects'];
type LiveNlEvidenceRefs = LiveNlPacketCase['evidence_refs'];

export interface LiveNlObservationFile {
  generatedAt?: string;
  runId?: string;
  title?: string;
  session?: Partial<TelegramLiveQaEvidencePacketV1['required_session_evidence']>;
  cases: LiveNlCaseObservation[];
}

export interface LiveNlCaseObservation {
  id: string;
  verdict: TelegramLiveQaVerdict;
  actualRoute?: string | null;
  actualOutcome?: string | null;
  replies?: Array<string | null>;
  observedTurns?: Array<Partial<LiveNlObservedTurn> & { turnIndex?: number }>;
  sideEffects?: Partial<LiveNlSideEffects>;
  evidenceRefs?: Partial<LiveNlEvidenceRefs>;
  issue?: string | null;
  fixCommit?: string | null;
  retestRequired?: boolean;
}

export const LIVE_NL_SUITE_ALIASES: Record<string, string[]> = {
  memory_architecture: ['memory', 'self_awareness', 'wiki', 'anti_drift'],
  routing_architecture: ['route_firewall', 'operator', 'access', 'diagnostics', 'spawner_flow', 'research']
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean);
}

function parseLiveNlCommandCase(value: unknown, index: number): LiveNlCommandCase {
  const record = objectValue(value);
  if (!record) {
    throw new Error(`Live NL case ${index + 1} is not an object.`);
  }

  const turns = stringArrayField(record, 'turns');
  const parsed = {
    id: stringField(record, 'id'),
    suite: stringField(record, 'suite'),
    risk: stringField(record, 'risk') as LiveNlRisk,
    prompt: stringField(record, 'prompt') || turns[0] || '',
    turns: turns.length > 0 ? turns : undefined,
    expectedRoute: stringField(record, 'expectedRoute'),
    expectedOutcome: stringField(record, 'expectedOutcome')
  };

  if (!parsed.id || !parsed.suite || !parsed.prompt || !parsed.expectedRoute || !parsed.expectedOutcome) {
    throw new Error(`Live NL case ${index + 1} needs id, suite, prompt or turns, expectedRoute, and expectedOutcome.`);
  }
  if (!['safe', 'mission', 'writes_files', 'external'].includes(parsed.risk)) {
    throw new Error(`Live NL case ${parsed.id} has unsupported risk ${parsed.risk || 'unknown'}.`);
  }

  return parsed;
}

export function parseLiveNlCommandCases(value: unknown): LiveNlCommandCase[] {
  if (!Array.isArray(value)) {
    throw new Error('Live NL command cases must be a JSON array.');
  }
  return value.map(parseLiveNlCommandCase);
}

export function liveNlCaseTurns(entry: LiveNlCommandCase): string[] {
  const turns = entry.turns?.map((turn) => turn.trim()).filter(Boolean) || [];
  return turns.length > 0 ? turns : [entry.prompt];
}

export function selectLiveNlCommandCases(
  cases: LiveNlCommandCase[],
  selection: LiveNlSelection = {}
): LiveNlCommandCase[] {
  const caseId = selection.caseId?.trim();
  const caseIds = (selection.caseIds || []).map((id) => id.trim()).filter(Boolean);
  const orderedCaseIds = [...(caseId ? [caseId] : []), ...caseIds];
  const selectedCaseIds = new Set(orderedCaseIds);
  const suite = selection.suite?.trim();
  const suiteNames = suite ? new Set(LIVE_NL_SUITE_ALIASES[suite] ?? [suite]) : null;

  let selected = cases;
  if (selectedCaseIds.size > 0) {
    const byId = new Map(cases.map((entry) => [entry.id, entry]));
    selected = orderedCaseIds.map((id) => byId.get(id)).filter((entry): entry is LiveNlCommandCase => Boolean(entry));
  }
  if (suiteNames) selected = selected.filter((entry) => suiteNames.has(entry.suite));
  if (!selection.includeRisky && selectedCaseIds.size === 0) selected = selected.filter((entry) => entry.risk === 'safe');
  return selected;
}

function liveNlHarnessHaystack(entry: LiveNlCommandCase): string {
  return [
    entry.suite,
    entry.risk,
    entry.expectedRoute,
    entry.expectedOutcome,
    entry.prompt,
    ...(entry.turns || [])
  ].join(' ').toLowerCase();
}

function liveNlPromptRouteHaystack(entry: LiveNlCommandCase): string {
  return [
    entry.suite,
    entry.risk,
    entry.expectedRoute,
    entry.prompt,
    ...(entry.turns || [])
  ].join(' ').toLowerCase();
}

function deriveLiveNlMutationClass(entry: LiveNlCommandCase): LiveNlHarnessCoreMutationClass {
  const route = entry.expectedRoute.toLowerCase();
  const text = liveNlPromptRouteHaystack(entry);

  if (entry.risk === 'mission' || /(?:slash_run|natural_run|launch_mission|diagnostic_followup_or_mission)/.test(route)) {
    return 'launches_mission';
  }
  if (
    entry.risk === 'writes_files' ||
    /(?:build_intent|operator_safe_action|domain_chip_create_preview|create_chip|writes?_files|create .*file|write .*file)/.test(text)
  ) {
    return 'writes_files';
  }
  if (entry.risk === 'external' || /(?:external_research|external_link|inspect https?:|fetch current|github repos and docs)/.test(text)) {
    return 'external_network';
  }
  if (
    /access/.test(route) &&
    /(?:\/access\s*[1-5]\b|change (?:my )?access|change it to\s*[1-5]\b|set .*access|level\s*[1-5]\b)/.test(text)
  ) {
    return 'updates_access_setting';
  }
  if (
    /(?:memory_directive|execute_action_write_memory|remember this|memory update:|please save|save this as|preferred mission updates|\/updates|mission updates verbose|mission link preference|kanban and canvas links)/.test(text)
  ) {
    return 'writes_memory';
  }
  if (/(?:voice|photo|image|media|audio)/.test(`${entry.suite} ${route}`)) {
    return 'media_read';
  }
  if (
    /(?:status|diagnose|board|read_current_state|recall|inventory|doctor|provider_status|context_recall|wiki|self_awareness|local_service|mission status|list|check|what |which |show |tell |explain)/.test(text)
  ) {
    return 'read_only';
  }
  return 'none';
}

function deriveLiveNlAuthorityExpectation(
  entry: LiveNlCommandCase,
  mutationClass: LiveNlHarnessCoreMutationClass
): LiveNlHarnessCoreAuthorityExpectation {
  const text = liveNlHarnessHaystack(entry);
  const blockedBoundary = /(?:blocked|guard|do not|don't|without authority|missing approval|no action|clarify_or_block)/.test(text);
  if (blockedBoundary && (mutationClass === 'none' || mutationClass === 'read_only' || mutationClass === 'media_read')) {
    return 'blocked_without_authority';
  }
  if (
    mutationClass === 'writes_memory' ||
    mutationClass === 'writes_files' ||
    mutationClass === 'launches_mission' ||
    mutationClass === 'external_network' ||
    mutationClass === 'updates_access_setting'
  ) {
    return 'confirmation_required_or_allowed';
  }
  if (mutationClass === 'read_only' || mutationClass === 'media_read') return 'read_only_allowed';
  return 'chat_only';
}

function liveNlRequiresIntentionalAction(mutationClass: LiveNlHarnessCoreMutationClass): boolean {
  return (
    mutationClass === 'writes_memory' ||
    mutationClass === 'writes_files' ||
    mutationClass === 'launches_mission' ||
    mutationClass === 'external_network' ||
    mutationClass === 'updates_access_setting'
  );
}

function deriveLiveNlRecommendedUse(
  entry: LiveNlCommandCase,
  mutationClass: LiveNlHarnessCoreMutationClass
): LiveNlHarnessCoreUse {
  const text = liveNlHarnessHaystack(entry);
  if (liveNlRequiresIntentionalAction(mutationClass)) {
    return 'run_only_with_intentional_action_confirmation';
  }
  if (/(?:do not|don't|blocked|guard|hijack|stale|fresh|authority|only if|proof|clarify)/.test(text)) {
    return 'promote_after_refurbish';
  }
  return 'keep_legacy_breadth';
}

export function deriveLiveNlHarnessCoreMapping(entry: LiveNlCommandCase): LiveNlHarnessCoreMapping {
  const mutationClass = deriveLiveNlMutationClass(entry);
  const authority = deriveLiveNlAuthorityExpectation(entry, mutationClass);
  const recommendedUse = deriveLiveNlRecommendedUse(entry, mutationClass);
  const captureRequired = ['observed_reply'];
  const notes = [
    'As-is NL case proves broad behavior only; promotion needs Harness Core fields and live evidence capture.'
  ];

  if (mutationClass !== 'none' && mutationClass !== 'read_only') captureRequired.push('side_effects');
  if (recommendedUse !== 'keep_legacy_breadth') captureRequired.push('proof_panel');
  if (recommendedUse !== 'keep_legacy_breadth' || mutationClass === 'media_read') {
    captureRequired.push('screenshot_or_user_confirmation');
  }
  if (entry.risk === 'safe' && liveNlRequiresIntentionalAction(mutationClass)) {
    notes.push(`Old risk "safe" hides Harness mutation class "${mutationClass}".`);
  }
  if (recommendedUse === 'run_only_with_intentional_action_confirmation') {
    notes.push('Keep out of default live runs unless the operator intentionally tests this action boundary.');
  }
  if (recommendedUse === 'promote_after_refurbish') {
    notes.push('Good source material for a smaller control-proof canary after adding authority, proof, side-effect, and reply-shape expectations.');
  }

  return {
    id: entry.id,
    suite: entry.suite,
    risk: entry.risk,
    expectedRoute: entry.expectedRoute,
    expectedAuthority: authority,
    expectedMutationClass: mutationClass,
    recommendedUse,
    proofRequiredIfPromoted: recommendedUse !== 'keep_legacy_breadth',
    captureRequired: Array.from(new Set(captureRequired)),
    notes
  };
}

function countBy<T extends string>(values: T[], orderedKeys: T[]): Record<T, number> {
  const counts = orderedKeys.reduce((record, key) => {
    record[key] = 0;
    return record;
  }, {} as Record<T, number>);
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return counts;
}

function tableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

export function formatLiveNlHarnessCoreMap(
  cases: LiveNlCommandCase[],
  options: LiveNlHarnessCoreMapOptions = {}
): string {
  const mapped = cases.map(deriveLiveNlHarnessCoreMapping);
  const useCounts = countBy(mapped.map((entry) => entry.recommendedUse), [
    'keep_legacy_breadth',
    'promote_after_refurbish',
    'run_only_with_intentional_action_confirmation'
  ]);
  const mutationCounts = countBy(mapped.map((entry) => entry.expectedMutationClass), [
    'none',
    'read_only',
    'writes_memory',
    'writes_files',
    'launches_mission',
    'external_network',
    'updates_access_setting',
    'media_read'
  ]);
  const authorityCounts = countBy(mapped.map((entry) => entry.expectedAuthority), [
    'chat_only',
    'read_only_allowed',
    'confirmation_required_or_allowed',
    'blocked_without_authority'
  ]);
  const title = options.title || 'Natural Language Harness Core Map';
  const catalog = options.catalog || 'selected catalog';
  const lines = [
    `# ${title}`,
    '',
    `Catalog: ${catalog}`,
    `Cases: ${mapped.length}`,
    '',
    'Decision: keep the old natural-language suite as fast legacy breadth. Do not treat this map or a passing `nl:live` run as Harness Core release proof.',
    '',
    'Refurbishment rule: promote selected prompts by copying them into the control-proof canary schema with authority, mutation, proof join, side-effect, reply-shape, and live Telegram evidence fields.',
    '',
    '## Recommended Use',
    '',
    `- keep_legacy_breadth: ${useCounts.keep_legacy_breadth}`,
    `- promote_after_refurbish: ${useCounts.promote_after_refurbish}`,
    `- run_only_with_intentional_action_confirmation: ${useCounts.run_only_with_intentional_action_confirmation}`,
    '',
    '## Mutation Classes',
    '',
    `- none: ${mutationCounts.none}`,
    `- read_only: ${mutationCounts.read_only}`,
    `- writes_memory: ${mutationCounts.writes_memory}`,
    `- writes_files: ${mutationCounts.writes_files}`,
    `- launches_mission: ${mutationCounts.launches_mission}`,
    `- external_network: ${mutationCounts.external_network}`,
    `- updates_access_setting: ${mutationCounts.updates_access_setting}`,
    `- media_read: ${mutationCounts.media_read}`,
    '',
    '## Authority Expectations',
    '',
    `- chat_only: ${authorityCounts.chat_only}`,
    `- read_only_allowed: ${authorityCounts.read_only_allowed}`,
    `- confirmation_required_or_allowed: ${authorityCounts.confirmation_required_or_allowed}`,
    `- blocked_without_authority: ${authorityCounts.blocked_without_authority}`,
    '',
    '## Cases',
    '',
    '| Case | Suite | Old risk | Mutation | Authority | Use | Proof if promoted |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ];

  for (const entry of mapped) {
    lines.push([
      tableCell(entry.id),
      tableCell(entry.suite),
      entry.risk,
      entry.expectedMutationClass,
      entry.expectedAuthority,
      entry.recommendedUse,
      entry.proofRequiredIfPromoted ? 'yes' : 'no'
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  return lines.join('\n').trimEnd() + '\n';
}

function riskCounts(cases: LiveNlCommandCase[]): string {
  const counts = new Map<LiveNlRisk, number>();
  for (const entry of cases) {
    counts.set(entry.risk, (counts.get(entry.risk) || 0) + 1);
  }
  return ['safe', 'mission', 'writes_files', 'external']
    .map((risk) => `${risk}: ${counts.get(risk as LiveNlRisk) || 0}`)
    .join(', ');
}

function indentedBlock(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `    ${line}`)
    .join('\n');
}

export function buildLiveNlEvidencePacket(
  cases: LiveNlCommandCase[],
  options: LiveNlEvidencePacketOptions = {}
): TelegramLiveQaEvidencePacketV1 {
  const generatedAt = (options.generatedAt || new Date()).toISOString();
  const catalog = options.catalog || 'natural-language-live-commands';
  const suite = options.suite?.trim() || null;
  const includeRisky = Boolean(options.includeRisky);

  return createTelegramLiveQaEvidencePacket({
    generated_at: generatedAt,
    run_id: options.runId,
    title: options.title || 'Spark Telegram Live QA Evidence Packet',
    catalog,
    suite,
    include_risky: includeRisky,
    required_session_evidence: options.requiredSessionEvidence,
    cases: buildLiveNlPacketCases(cases)
  });
}

export function buildLiveNlObservationTemplate(
  cases: LiveNlCommandCase[],
  options: LiveNlEvidencePacketOptions = {}
): LiveNlObservationFile {
  const generatedAt = (options.generatedAt || new Date()).toISOString();

  return {
    generatedAt,
    runId: options.runId,
    title: options.title || 'Spark Telegram Live QA Observation Template',
    session: options.requiredSessionEvidence,
    cases: cases.map((entry) => ({
      id: entry.id,
      verdict: 'untested',
      actualRoute: null,
      actualOutcome: null,
      observedTurns: liveNlCaseTurns(entry).map((turn, index) => ({
        turnIndex: index + 1,
        prompt: turn,
        reply: null,
        reply_timestamp: null
      })),
      sideEffects: {
        files_changed: null,
        memory_written: null,
        mission_started: null,
        external_network_called: null,
        pr_opened: null,
        publish_or_deploy_started: null,
        schedule_changed: null,
        tool_or_browser_used: null
      },
      evidenceRefs: {
        authorization_ledgers: [],
        tool_ledgers: [],
        traces: [],
        runtime_status: [],
        screenshots: [],
        commits: [],
        prs: []
      },
      issue: null,
      fixCommit: null,
      retestRequired: false
    }))
  };
}

function buildLiveNlPacketCases(cases: LiveNlCommandCase[]): LiveNlPacketCase[] {
  return cases.map((entry, index) => {
    const turns = liveNlCaseTurns(entry);
    return {
      ordinal: index + 1,
      id: entry.id,
      suite: entry.suite,
      risk: entry.risk,
      expected_route: entry.expectedRoute,
      expected_outcome: entry.expectedOutcome,
      verdict: 'untested',
      actual_route: null,
      actual_outcome: null,
      observed_turns: turns.map((turn, turnIndex) => ({
        turn_index: turnIndex + 1,
        prompt: turn,
        reply: null,
        reply_timestamp: null
      })),
      side_effects: {
        files_changed: null,
        memory_written: null,
        mission_started: null,
        external_network_called: null,
        pr_opened: null,
        publish_or_deploy_started: null,
        schedule_changed: null,
        tool_or_browser_used: null
      },
      evidence_refs: {
        authorization_ledgers: [],
        tool_ledgers: [],
        traces: [],
        runtime_status: [],
        screenshots: [],
        commits: [],
        prs: []
      },
      issue: null,
      fix_commit: null,
      retest_required: false
    };
  });
}

const LIVE_NL_VERDICTS = new Set<TelegramLiveQaVerdict>(['pass', 'fail', 'blocked', 'needs-retest', 'untested']);
const LIVE_NL_SIDE_EFFECT_KEYS: Array<keyof LiveNlSideEffects> = [
  'files_changed',
  'memory_written',
  'mission_started',
  'external_network_called',
  'pr_opened',
  'publish_or_deploy_started',
  'schedule_changed',
  'tool_or_browser_used'
];
const LIVE_NL_EVIDENCE_REF_KEYS: Array<keyof LiveNlEvidenceRefs> = [
  'authorization_ledgers',
  'tool_ledgers',
  'traces',
  'runtime_status',
  'screenshots',
  'commits',
  'prs'
];

function nullableStringFromRecord(record: Record<string, unknown>, ...keys: string[]): string | null | undefined {
  for (const key of keys) {
    if (!(key in record)) continue;
    const value = record[key];
    if (value === null) return null;
    if (typeof value === 'string') return value.trim() || null;
  }
  return undefined;
}

function booleanOrNull(value: unknown): boolean | null | undefined {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  return undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean);
}

function objectField(record: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = record[key];
    const object = objectValue(value);
    if (object) return object;
  }
  return null;
}

function observationTurns(record: Record<string, unknown>): LiveNlCaseObservation['observedTurns'] {
  const raw = record.observedTurns || record.observed_turns;
  if (!Array.isArray(raw)) return undefined;
  const turns: Array<Partial<LiveNlObservedTurn> & { turnIndex?: number }> = [];
  for (const entry of raw) {
    const turn = objectValue(entry);
    if (!turn) continue;
    const turnIndexValue = turn.turnIndex ?? turn.turn_index;
    const turnIndex = typeof turnIndexValue === 'number' ? turnIndexValue : Number(turnIndexValue || 0);
    turns.push({
      turnIndex: Number.isFinite(turnIndex) && turnIndex > 0 ? turnIndex : undefined,
      reply: nullableStringFromRecord(turn, 'reply'),
      reply_timestamp: nullableStringFromRecord(turn, 'reply_timestamp', 'replyTimestamp') ?? null,
      prompt: nullableStringFromRecord(turn, 'prompt') ?? undefined
    });
  }
  return turns;
}

function parseCaseObservation(value: unknown, index: number): LiveNlCaseObservation {
  const record = objectValue(value);
  if (!record) throw new Error(`Live NL observation ${index + 1} is not an object.`);
  const id = stringField(record, 'id');
  const verdict = stringField(record, 'verdict') as TelegramLiveQaVerdict;
  if (!id) throw new Error(`Live NL observation ${index + 1} needs id.`);
  if (!LIVE_NL_VERDICTS.has(verdict)) {
    throw new Error(`Live NL observation ${id} has unsupported verdict ${verdict || 'unknown'}.`);
  }

  const sideEffectInput = objectField(record, 'sideEffects', 'side_effects');
  const sideEffects: Partial<LiveNlSideEffects> = {};
  if (sideEffectInput) {
    for (const key of LIVE_NL_SIDE_EFFECT_KEYS) {
      const camelKey = key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
      const parsed = booleanOrNull(sideEffectInput[key] ?? sideEffectInput[camelKey]);
      if (parsed !== undefined) sideEffects[key] = parsed;
    }
  }

  const evidenceInput = objectField(record, 'evidenceRefs', 'evidence_refs');
  const evidenceRefs: Partial<LiveNlEvidenceRefs> = {};
  if (evidenceInput) {
    for (const key of LIVE_NL_EVIDENCE_REF_KEYS) {
      const camelKey = key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
      const refs = stringArray(evidenceInput[key] ?? evidenceInput[camelKey]);
      if (refs.length > 0) evidenceRefs[key] = refs;
    }
  }

  const replies = Array.isArray(record.replies)
    ? record.replies.map((reply) => typeof reply === 'string' ? reply : null)
    : undefined;

  return {
    id,
    verdict,
    actualRoute: nullableStringFromRecord(record, 'actualRoute', 'actual_route'),
    actualOutcome: nullableStringFromRecord(record, 'actualOutcome', 'actual_outcome'),
    replies,
    observedTurns: observationTurns(record),
    sideEffects,
    evidenceRefs,
    issue: nullableStringFromRecord(record, 'issue'),
    fixCommit: nullableStringFromRecord(record, 'fixCommit', 'fix_commit'),
    retestRequired: Boolean(record.retestRequired ?? record.retest_required)
  };
}

export function parseLiveNlObservationFile(value: unknown): LiveNlObservationFile {
  const record = objectValue(value);
  if (!record) throw new Error('Live NL observation file must be a JSON object.');
  const rawCases = record.cases;
  if (!Array.isArray(rawCases)) throw new Error('Live NL observation file needs a cases array.');
  const session = objectField(record, 'session', 'required_session_evidence') || undefined;
  return {
    generatedAt: stringField(record, 'generatedAt') || stringField(record, 'generated_at') || undefined,
    runId: stringField(record, 'runId') || stringField(record, 'run_id') || undefined,
    title: stringField(record, 'title') || undefined,
    session: session as LiveNlObservationFile['session'],
    cases: rawCases.map(parseCaseObservation)
  };
}

function deriveOverallVerdict(cases: LiveNlPacketCase[]): TelegramLiveQaVerdict {
  const verdicts = new Set(cases.map((entry) => entry.verdict));
  if (verdicts.has('fail')) return 'fail';
  if (verdicts.has('needs-retest')) return 'needs-retest';
  if (verdicts.has('blocked')) return 'blocked';
  if (verdicts.has('untested')) return 'untested';
  return 'pass';
}

function mergeObservation(target: LiveNlPacketCase, observation: LiveNlCaseObservation): void {
  target.verdict = observation.verdict;
  if (observation.actualRoute !== undefined) target.actual_route = observation.actualRoute;
  if (observation.actualOutcome !== undefined) target.actual_outcome = observation.actualOutcome;
  if (observation.issue !== undefined) target.issue = observation.issue;
  if (observation.fixCommit !== undefined) target.fix_commit = observation.fixCommit;
  target.retest_required = Boolean(observation.retestRequired);

  observation.replies?.forEach((reply, index) => {
    if (!target.observed_turns[index]) return;
    target.observed_turns[index].reply = reply;
  });
  observation.observedTurns?.forEach((turn, index) => {
    const targetIndex = turn.turnIndex ? turn.turnIndex - 1 : index;
    const targetTurn = target.observed_turns[targetIndex];
    if (!targetTurn) return;
    if (turn.reply !== undefined) targetTurn.reply = turn.reply;
    if (turn.reply_timestamp !== undefined) targetTurn.reply_timestamp = turn.reply_timestamp;
  });
  if (observation.sideEffects) {
    target.side_effects = { ...target.side_effects, ...observation.sideEffects };
  }
  if (observation.evidenceRefs) {
    for (const key of LIVE_NL_EVIDENCE_REF_KEYS) {
      const refs = observation.evidenceRefs[key];
      if (refs?.length) target.evidence_refs[key] = Array.from(new Set([...target.evidence_refs[key], ...refs]));
    }
  }
}

export function buildObservedLiveNlEvidencePacket(
  cases: LiveNlCommandCase[],
  observations: LiveNlObservationFile,
  options: LiveNlEvidencePacketOptions = {}
): TelegramLiveQaEvidencePacketV1 {
  const packetCases = buildLiveNlPacketCases(cases);
  const byId = new Map(packetCases.map((entry) => [entry.id, entry]));
  for (const observation of observations.cases) {
    const target = byId.get(observation.id);
    if (!target) throw new Error(`Live NL observation references unknown case ${observation.id}.`);
    mergeObservation(target, observation);
  }

  const sessionEvidence = {
    ...(options.requiredSessionEvidence || {}),
    ...(observations.session || {})
  };
  if (!sessionEvidence.overall_verdict) {
    sessionEvidence.overall_verdict = deriveOverallVerdict(packetCases);
  }

  return createTelegramLiveQaEvidencePacket({
    generated_at: observations.generatedAt || options.generatedAt?.toISOString(),
    run_id: observations.runId || options.runId,
    title: observations.title || options.title || 'Spark Telegram Live QA Evidence Packet',
    catalog: options.catalog || 'natural-language-live-commands',
    suite: options.suite?.trim() || null,
    include_risky: Boolean(options.includeRisky),
    required_session_evidence: sessionEvidence,
    cases: packetCases
  });
}

export function formatLiveNlVerdictReport(
  cases: LiveNlCommandCase[],
  options: LiveNlVerdictReportOptions = {}
): string {
  const generatedAt = (options.generatedAt || new Date()).toISOString();
  const title = options.title || 'Natural Language Live Verdict Report';
  const suiteLine = options.suite ? `Suite filter: ${options.suite}` : 'Suite filter: all selected safe cases';
  const lines = [
    `# ${title}`,
    '',
    `Generated: ${generatedAt}`,
    suiteLine,
    `Cases: ${cases.length} (${riskCounts(cases)})`,
    '',
    'Use this report after copy-pasting plain prompts from `ops/liveNlCommandSuite.ts --copy-paste`.',
    'Do not paste secrets, full raw logs, or private user text into verdict notes.',
    '',
    'Verdict values: pass, fail, blocked, needs-retest, untested.',
    '',
    '## Session Summary',
    '',
    '- Profile:',
    '- Tester:',
    '- Bot/runtime commit:',
    '- Ledger path, if enabled:',
    '- Overall verdict:',
    '- Follow-up commits/tests:',
    ''
  ];

  for (const entry of cases) {
    const turns = liveNlCaseTurns(entry);
    lines.push(
      `## ${entry.id}`,
      '',
      `- Suite: ${entry.suite}`,
      `- Risk: ${entry.risk}`,
      `- Expected route: ${entry.expectedRoute}`,
      `- Expected outcome: ${entry.expectedOutcome}`,
      '- Verdict: untested',
      '- Actual route:',
      '- Actual outcome:',
      '- Evidence:',
      '- Issue:',
      '- Fix/Test added:',
      '',
      turns.length === 1 ? 'Prompt:' : 'Prompts:',
      '',
      indentedBlock(turns.length === 1
        ? turns[0]
        : turns.map((turn, index) => `Turn ${index + 1}:\n${turn}`).join('\n\n')),
      ''
    );
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function formatLiveNlCopyPastePrompts(
  cases: LiveNlCommandCase[],
  options: LiveNlCopyPasteOptions = {}
): string {
  const title = options.title || 'Natural Language Copy/Paste Prompts';
  const lines = [
    `# ${title}`,
    '',
    'Copy only each Telegram message into Telegram, one at a time.',
    'Do not paste case ids, expected routes, or expected outcomes into Telegram.',
    'After Spark replies, paste the matching reply-capture block back into Codex.',
    ''
  ];

  cases.forEach((entry, index) => {
    const turns = liveNlCaseTurns(entry);
    lines.push(
      `## ${index + 1}. ${entry.id}`,
      ''
    );

    turns.forEach((turn, turnIndex) => {
      const suffix = turns.length > 1 ? ` ${turnIndex + 1} of ${turns.length}` : '';
      const captureCase = turns.length > 1 ? `CASE ${entry.id} TURN ${turnIndex + 1}` : `CASE ${entry.id}`;
      lines.push(
        `Telegram message${suffix}:`,
        '',
        '```text',
        turn,
        '```',
        '',
        `Reply capture${suffix}:`,
        '',
        '```text',
        captureCase,
        'REPLY:',
        '<paste Spark reply here>',
        '```',
        ''
      );
    });
  });

  return lines.join('\n').trimEnd() + '\n';
}
