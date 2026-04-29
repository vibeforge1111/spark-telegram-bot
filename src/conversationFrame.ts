export type ConversationRole = 'user' | 'assistant' | 'system' | 'tool';
export type ConversationFocusKind = 'access_level' | 'list';
export type ReferenceResolutionKind = 'none' | 'access_level' | 'list_item';

export interface ConversationTurn {
  role: ConversationRole;
  text: string;
  turnId?: string;
  createdAt?: string;
}

export interface ConversationArtifact {
  kind: ConversationFocusKind;
  key: string;
  title: string;
  items: string[];
  sourceIndex: number;
  confidence: number;
}

export interface ConversationFocus {
  kind: ConversationFocusKind;
  label: string;
  confidence: number;
  source: string;
}

export interface ReferenceResolution {
  kind: ReferenceResolutionKind;
  value: string | null;
  confidence: number;
  sourceArtifactKey?: string;
  reason: string;
}

export interface ContextBudgetPolicy {
  modelContextWindowTokens: number;
  targetEffectiveContextTokens: number;
  reliableFraction: number;
  outputReserveTokens: number;
  toolReserveTokens: number;
  hotTargetTokens: number;
  hotMinTurns: number;
  compactTriggerFraction: number;
}

export interface ConversationFrame {
  currentMessage: string;
  generatedAt: string;
  hotTurns: ConversationTurn[];
  warmSummary: string;
  artifacts: ConversationArtifact[];
  focusStack: ConversationFocus[];
  referenceResolution: ReferenceResolution;
  budget: Record<string, number | boolean>;
  sourceLedger: Array<Record<string, string | number>>;
}

export interface ConversationCompactionEvent {
  createdAt: string;
  olderTurnCount: number;
  warmSummaryTokens: number;
  hotTurnTokens: number;
  artifactCount: number;
  reason: string;
}

export interface RollingConversationFrameState {
  version: 1;
  hotTurns: ConversationTurn[];
  warmSummary: string;
  artifacts: ConversationArtifact[];
  lastBudget: Record<string, number | boolean>;
  compactionEvents: ConversationCompactionEvent[];
  updatedAt: string;
}

const DEFAULT_POLICY: ContextBudgetPolicy = {
  modelContextWindowTokens: 400_000,
  targetEffectiveContextTokens: 200_000,
  reliableFraction: 0.65,
  outputReserveTokens: 24_000,
  toolReserveTokens: 16_000,
  hotTargetTokens: 24_000,
  hotMinTurns: 12,
  compactTriggerFraction: 0.65
};

const NUMBER_WORDS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4' };
const OPTION_NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};
const ORDINALS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10
};

export function estimateTokens(text: string): number {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export function buildConversationFrame(
  currentMessage: string,
  turns: ConversationTurn[],
  policy: Partial<ContextBudgetPolicy> = {}
): ConversationFrame {
  const activePolicy = { ...DEFAULT_POLICY, ...policy };
  const { hotTurns, olderTurns } = selectHotTurns(turns, activePolicy);
  const artifacts = extractArtifacts(turns);
  const focusStack = inferFocusStack(currentMessage, turns, artifacts);
  const referenceResolution = resolveReference(currentMessage, focusStack, artifacts);
  const warmSummary = compactOlderTurns(olderTurns, artifacts);
  const hotTurnTokens = hotTurns.reduce((sum, turn) => sum + estimateTokens(renderTurn(turn)), 0);
  const warmSummaryTokens = estimateTokens(warmSummary);
  const artifactTokens = artifacts.reduce((sum, artifact) => sum + estimateTokens(renderArtifact(artifact)), 0);
  const reliableTokens = Math.floor(activePolicy.modelContextWindowTokens * activePolicy.reliableFraction);
  const safeInputBudgetTokens = Math.max(
    8000,
    Math.min(
      activePolicy.targetEffectiveContextTokens,
      reliableTokens - activePolicy.outputReserveTokens - activePolicy.toolReserveTokens
    )
  );

  return {
    currentMessage,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    hotTurns,
    warmSummary,
    artifacts,
    focusStack,
    referenceResolution,
    budget: {
      modelContextWindowTokens: activePolicy.modelContextWindowTokens,
      targetEffectiveContextTokens: activePolicy.targetEffectiveContextTokens,
      reliableFraction: activePolicy.reliableFraction,
      safeInputBudgetTokens,
      outputReserveTokens: activePolicy.outputReserveTokens,
      toolReserveTokens: activePolicy.toolReserveTokens,
      hotTargetTokens: activePolicy.hotTargetTokens,
      hotMinTurns: activePolicy.hotMinTurns,
      compactTriggerFraction: activePolicy.compactTriggerFraction,
      compactionTriggerTokens: Math.floor(activePolicy.modelContextWindowTokens * activePolicy.compactTriggerFraction),
      requiresLargerModelForFullTarget: safeInputBudgetTokens < activePolicy.targetEffectiveContextTokens,
      hotTurnTokens,
      warmSummaryTokens,
      artifactTokens,
      assembledEstimatedTokens: hotTurnTokens + warmSummaryTokens + artifactTokens
    },
    sourceLedger: [
      { source: 'hot_turns', role: 'verbatim_recent_context', count: hotTurns.length, priority: 1 },
      { source: 'active_artifacts', role: 'exact_reference_support', count: artifacts.length, priority: 2 },
      { source: 'warm_summary', role: 'compacted_older_context', count: olderTurns.length, priority: 3 }
    ]
  };
}

export function emptyRollingConversationFrameState(): RollingConversationFrameState {
  return {
    version: 1,
    hotTurns: [],
    warmSummary: '',
    artifacts: [],
    lastBudget: {},
    compactionEvents: [],
    updatedAt: new Date().toISOString()
  };
}

export function updateRollingConversationFrameState(
  state: RollingConversationFrameState | null | undefined,
  turn: ConversationTurn,
  policy: Partial<ContextBudgetPolicy> = {}
): RollingConversationFrameState {
  const previous = normalizeRollingConversationFrameState(state);
  const frame = buildConversationFrame(turn.text, [...previous.hotTurns, turn], policy);
  const mergedArtifacts = mergeArtifacts(previous.artifacts, frame.artifacts);
  const newWarmSummary = mergeWarmSummaries(previous.warmSummary, frame.warmSummary);
  const olderTurnCount = Math.max(0, previous.hotTurns.length + 1 - frame.hotTurns.length);
  const compactionEvents = [...previous.compactionEvents];
  if (olderTurnCount > 0 || frame.warmSummary) {
    compactionEvents.push({
      createdAt: frame.generatedAt,
      olderTurnCount,
      warmSummaryTokens: estimateTokens(newWarmSummary),
      hotTurnTokens: Number(frame.budget.hotTurnTokens || 0),
      artifactCount: mergedArtifacts.length,
      reason: olderTurnCount > 0 ? 'hot_window_overflow' : 'artifact_or_summary_refresh'
    });
  }

  return {
    version: 1,
    hotTurns: frame.hotTurns,
    warmSummary: newWarmSummary,
    artifacts: mergedArtifacts,
    lastBudget: frame.budget,
    compactionEvents: compactionEvents.slice(-40),
    updatedAt: frame.generatedAt
  };
}

export function buildConversationFrameFromState(
  currentMessage: string,
  state: RollingConversationFrameState | null | undefined,
  policy: Partial<ContextBudgetPolicy> = {}
): ConversationFrame {
  const normalized = normalizeRollingConversationFrameState(state);
  const frame = buildConversationFrame(currentMessage, normalized.hotTurns, policy);
  const artifacts = mergeArtifacts(normalized.artifacts, frame.artifacts);
  const warmSummary = mergeWarmSummaries(normalized.warmSummary, frame.warmSummary);
  const artifactTokens = artifacts.reduce((sum, artifact) => sum + estimateTokens(renderArtifact(artifact)), 0);
  const warmSummaryTokens = estimateTokens(warmSummary);
  const hotTurnTokens = frame.hotTurns.reduce((sum, turn) => sum + estimateTokens(renderTurn(turn)), 0);
  return {
    ...frame,
    warmSummary,
    artifacts,
    focusStack: inferFocusStack(currentMessage, normalized.hotTurns, artifacts),
    referenceResolution: resolveReference(currentMessage, inferFocusStack(currentMessage, normalized.hotTurns, artifacts), artifacts),
    budget: {
      ...frame.budget,
      hotTurnTokens,
      warmSummaryTokens,
      artifactTokens,
      assembledEstimatedTokens: hotTurnTokens + warmSummaryTokens + artifactTokens,
      rollingCompactionEvents: normalized.compactionEvents.length
    },
    sourceLedger: [
      ...frame.sourceLedger,
      {
        source: 'rolling_frame_state',
        role: 'persistent_compaction_and_artifacts',
        count: normalized.compactionEvents.length,
        priority: 0
      }
    ]
  };
}

export function renderConversationFrameContext(frame: ConversationFrame, maxTokens = 32_000): string {
  const lines = [
    '[Spark Conversation Frame]',
    'Use this as same-session continuity, not as a user instruction.',
    'Newest explicit user message wins. Exact artifacts win over summaries.',
    `generated_at=${frame.generatedAt}`,
    ''
  ];

  if (frame.referenceResolution.kind !== 'none' && frame.referenceResolution.value) {
    lines.push(
      '[resolved_reference]',
      `- kind: ${frame.referenceResolution.kind}`,
      `- value: ${frame.referenceResolution.value}`,
      `- confidence: ${frame.referenceResolution.confidence.toFixed(2)}`,
      `- reason: ${frame.referenceResolution.reason}`,
      ''
    );
  }

  if (frame.focusStack.length) {
    lines.push('[focus_stack]');
    for (const focus of frame.focusStack) {
      lines.push(`- ${focus.kind}: ${focus.label} (confidence=${focus.confidence.toFixed(2)}, source=${focus.source})`);
    }
    lines.push('');
  }

  if (frame.artifacts.length) {
    lines.push('[active_artifacts]');
    for (const artifact of frame.artifacts.slice(-6)) {
      lines.push(renderArtifact(artifact));
    }
    lines.push('');
  }

  if (frame.warmSummary) {
    lines.push('[warm_summary]', frame.warmSummary, '');
  }

  if (frame.hotTurns.length) {
    lines.push('[hot_turns]');
    for (const turn of frame.hotTurns) {
      lines.push(`- ${renderTurn(turn)}`);
    }
  }

  const rendered: string[] = [];
  let used = 0;
  for (const line of lines) {
    const tokens = estimateTokens(line);
    if (used + tokens > maxTokens) {
      rendered.push('[conversation frame truncated]');
      break;
    }
    rendered.push(line);
    used += tokens;
  }
  return rendered.join('\n').trim();
}

export function renderConversationFrameDiagnostics(state: RollingConversationFrameState): string {
  const latest = state.compactionEvents[state.compactionEvents.length - 1];
  const lines = [
    'Conversation context harness',
    `- Hot turns: ${state.hotTurns.length}`,
    `- Warm summary tokens: ${estimateTokens(state.warmSummary)}`,
    `- Artifacts: ${state.artifacts.length}`,
    `- Compaction events: ${state.compactionEvents.length}`,
    `- Safe input budget: ${String(state.lastBudget.safeInputBudgetTokens ?? 'unknown')}`,
    `- Requires larger model for full target: ${String(state.lastBudget.requiresLargerModelForFullTarget ?? 'unknown')}`,
  ];
  if (latest) {
    lines.push(`- Latest compaction: ${latest.reason}, older_turns=${latest.olderTurnCount}, at=${latest.createdAt}`);
  }
  return lines.join('\n');
}

function selectHotTurns(turns: ConversationTurn[], policy: ContextBudgetPolicy): {
  hotTurns: ConversationTurn[];
  olderTurns: ConversationTurn[];
} {
  const selected: ConversationTurn[] = [];
  let used = 0;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    const turnTokens = estimateTokens(renderTurn(turn));
    const mustKeep = selected.length < policy.hotMinTurns;
    if (!mustKeep && used + turnTokens > policy.hotTargetTokens) {
      break;
    }
    selected.unshift(turn);
    used += turnTokens;
  }
  return {
    hotTurns: selected,
    olderTurns: turns.slice(0, Math.max(0, turns.length - selected.length))
  };
}

function extractArtifacts(turns: ConversationTurn[]): ConversationArtifact[] {
  const artifacts: ConversationArtifact[] = [];
  turns.forEach((turn, sourceIndex) => {
    const items = extractNumberedItems(turn.text);
    if (items.length >= 2) {
      artifacts.push({
        kind: 'list',
        key: `list:${turn.turnId ?? sourceIndex}`,
        title: artifactTitleFromText(turn.text),
        items,
        sourceIndex,
        confidence: turn.role === 'assistant' ? 0.9 : 0.75
      });
    }

    const accessValue = extractAccessValue(turn.text);
    if (accessValue && /\b(?:spark\s+)?access(?:\s+level)?\b|\blevel\s+[1-4]\b|\bfull\s+access\b/i.test(turn.text)) {
      artifacts.push({
        kind: 'access_level',
        key: `access:${turn.turnId ?? sourceIndex}`,
        title: `Spark access level ${accessValue}`,
        items: [accessValue],
        sourceIndex,
        confidence: 0.95
      });
    }
  });
  return artifacts.slice(-12);
}

function inferFocusStack(
  currentMessage: string,
  turns: ConversationTurn[],
  artifacts: ConversationArtifact[]
): ConversationFocus[] {
  const recentText = [...turns.slice(-8).map((turn) => turn.text), currentMessage].join('\n');
  const focus: ConversationFocus[] = [];
  if (/\b(?:spark\s+)?access(?:\s+level)?\b|\blevel\s+[1-4]\b|\bfull\s+access\b/i.test(recentText)) {
    focus.push({ kind: 'access_level', label: 'Spark access level', confidence: 0.92, source: 'recent_turns' });
  }
  const latestList = [...artifacts].reverse().find((artifact) => artifact.kind === 'list');
  if (latestList) {
    focus.push({ kind: 'list', label: latestList.title, confidence: 0.82, source: latestList.key });
  }
  return focus.slice(0, 4);
}

function resolveReference(
  currentMessage: string,
  focusStack: ConversationFocus[],
  artifacts: ConversationArtifact[]
): ReferenceResolution {
  const optionMatch = currentMessage.match(
    /\b(?:no\.?|number|option|#)\s*(\d{1,2})\b|\b(?:the\s+)?(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:one|option|idea|direction|item)\b/i
  );
  if (optionMatch) {
    const index = optionMatch[1] ? Number(optionMatch[1]) : ORDINALS[optionMatch[2].toLowerCase()];
    const latestList = [...artifacts].reverse().find((artifact) => artifact.kind === 'list');
    if (latestList && index >= 1 && index <= latestList.items.length) {
      return {
        kind: 'list_item',
        value: latestList.items[index - 1],
        confidence: 0.86,
        sourceArtifactKey: latestList.key,
        reason: `resolved option ${index} against most recent list artifact`
      };
    }
  }

  const bareOptionIndex = extractBareOptionReferenceIndex(currentMessage);
  if (bareOptionIndex) {
    const latestList = latestArtifactOfKind(artifacts, 'list');
    const latestAccess = latestArtifactOfKind(artifacts, 'access_level');
    const listIsCurrentFocus = latestList && (!latestAccess || latestList.sourceIndex >= latestAccess.sourceIndex);
    if (listIsCurrentFocus && bareOptionIndex >= 1 && bareOptionIndex <= latestList.items.length) {
      return {
        kind: 'list_item',
        value: latestList.items[bareOptionIndex - 1],
        confidence: 0.78,
        sourceArtifactKey: latestList.key,
        reason: `resolved short option ${bareOptionIndex} against newer list artifact`
      };
    }
  }

  const accessFocus = focusStack.some((focus) => focus.kind === 'access_level');
  if (accessFocus) {
    const accessValue = extractAccessValue(currentMessage);
    const hasChangeShape = /\b(?:change|set|switch|make|do|go\s+to|go\s+with|actually|instead)\b/i.test(currentMessage);
    const shortLevelOnly = /^\s*(?:level\s*)?(?:[1-4]|one|two|three|four)\s*[.!?]?\s*$/i.test(currentMessage);
    if (accessValue && (hasChangeShape || shortLevelOnly)) {
      return {
        kind: 'access_level',
        value: accessValue,
        confidence: 0.9,
        reason: 'recent access focus plus short level reference'
      };
    }
  }

  return { kind: 'none', value: null, confidence: 0, reason: 'no reliable local reference' };
}

function latestArtifactOfKind(
  artifacts: ConversationArtifact[],
  kind: ConversationFocusKind
): ConversationArtifact | null {
  return [...artifacts].reverse().find((artifact) => artifact.kind === kind) || null;
}

function extractBareOptionReferenceIndex(text: string): number | null {
  const match = text.match(
    /^(?:let'?s\s+|please\s+|actually\s+|no[, ]*|instead\s+)*(?:do|pick|choose|select|use|go\s+with)\s+(?:the\s+)?(?:option\s+|idea\s+|direction\s+|item\s+)?([1-9]|10|one|two|three|four|five|six|seven|eight|nine|ten)\b/i
  );
  if (!match) return null;
  const value = match[1].toLowerCase();
  return OPTION_NUMBER_WORDS[value] || Number(value) || null;
}

function compactOlderTurns(turns: ConversationTurn[], artifacts: ConversationArtifact[]): string {
  const lines: string[] = [];
  if (turns.length) {
    const userGoals = turns
      .filter((turn) => turn.role === 'user' && turn.text.trim())
      .map((turn) => turn.text.trim())
      .slice(-6);
    const decisions = turns
      .filter((turn) => turn.role === 'assistant' && /\b(?:done|changed|decided|plan|next|options?|level|mission)\b/i.test(turn.text))
      .map((turn) => turn.text.trim())
      .slice(-4);
    if (userGoals.length) lines.push(`Older user goals: ${userGoals.join(' | ')}`);
    if (decisions.length) lines.push(`Older assistant decisions: ${decisions.join(' | ')}`);
  }
  const exactArtifacts = artifacts.filter((artifact) => artifact.kind === 'list' || artifact.kind === 'access_level');
  if (exactArtifacts.length) {
    lines.push(`Exact artifacts preserved: ${exactArtifacts.slice(-6).map((artifact) => `${artifact.kind}:${artifact.title}`).join('; ')}`);
  }
  return lines.join('\n');
}

function normalizeRollingConversationFrameState(
  state: RollingConversationFrameState | null | undefined
): RollingConversationFrameState {
  if (!state || state.version !== 1) {
    return emptyRollingConversationFrameState();
  }
  return {
    version: 1,
    hotTurns: Array.isArray(state.hotTurns) ? state.hotTurns.filter(isConversationTurn).slice(-80) : [],
    warmSummary: typeof state.warmSummary === 'string' ? state.warmSummary : '',
    artifacts: Array.isArray(state.artifacts) ? state.artifacts.filter(isConversationArtifact).slice(-40) : [],
    lastBudget: state.lastBudget && typeof state.lastBudget === 'object' ? state.lastBudget : {},
    compactionEvents: Array.isArray(state.compactionEvents) ? state.compactionEvents.slice(-40) : [],
    updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : new Date().toISOString()
  };
}

function isConversationTurn(value: unknown): value is ConversationTurn {
  if (!value || typeof value !== 'object') return false;
  const turn = value as Partial<ConversationTurn>;
  return (
    (turn.role === 'user' || turn.role === 'assistant' || turn.role === 'system' || turn.role === 'tool') &&
    typeof turn.text === 'string' &&
    turn.text.trim().length > 0
  );
}

function isConversationArtifact(value: unknown): value is ConversationArtifact {
  if (!value || typeof value !== 'object') return false;
  const artifact = value as Partial<ConversationArtifact>;
  return (
    (artifact.kind === 'access_level' || artifact.kind === 'list') &&
    typeof artifact.key === 'string' &&
    typeof artifact.title === 'string' &&
    Array.isArray(artifact.items)
  );
}

function mergeArtifacts(
  previous: ConversationArtifact[],
  current: ConversationArtifact[]
): ConversationArtifact[] {
  const byKey = new Map<string, ConversationArtifact>();
  for (const artifact of [...previous, ...current]) {
    const semanticKey = `${artifact.kind}:${artifact.title.toLowerCase()}:${artifact.items.join('|').toLowerCase()}`;
    byKey.set(semanticKey, artifact);
  }
  return Array.from(byKey.values()).slice(-40);
}

function mergeWarmSummaries(previous: string, current: string): string {
  const parts = [previous.trim(), current.trim()].filter(Boolean);
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const part of parts) {
    for (const line of part.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(line);
    }
  }
  const maxTokens = 8000;
  const kept: string[] = [];
  let used = 0;
  for (const line of lines.reverse()) {
    const tokens = estimateTokens(line);
    if (used + tokens > maxTokens) break;
    kept.unshift(line);
    used += tokens;
  }
  return kept.join('\n');
}

function extractNumberedItems(text: string): string[] {
  const items: Array<{ number: number; value: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]\s*)?(?:#|no\.?|option\s*)?(\d{1,2})[\).:-]\s+(.+?)\s*$/i);
    if (!match) continue;
    items.push({ number: Number(match[1]), value: match[2].trim() });
  }
  if (items.length < 2) {
    const inline = [...text.matchAll(/(?:^|\s)([1-9])[\).:-]\s+([^0-9\n]+?)(?=\s+[1-9][\).:-]\s+|$)/g)];
    for (const match of inline) {
      const value = match[2].trim().replace(/[.;]+$/g, '').trim();
      if (value) items.push({ number: Number(match[1]), value });
    }
  }
  if (items.length < 2) return [];
  return items.sort((a, b) => a.number - b.number).map((item) => item.value).slice(0, 20);
}

function extractAccessValue(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\bfull\s+access\b/.test(lower)) return '4';
  const match = text.match(/\b(?:level\s*)?([1-4]|one|two|three|four)\b/i);
  if (!match) return null;
  return NUMBER_WORDS[match[1].toLowerCase()] || match[1];
}

function artifactTitleFromText(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim().replace(/[: -]+$/g, ''))
    .find((item) => item && !/^\s*(?:[-*]\s*)?(?:#|no\.?|option\s*)?\d{1,2}[\).:-]\s+/i.test(item));
  return (line || 'recent numbered list').slice(0, 120);
}

function renderTurn(turn: ConversationTurn): string {
  return `${turn.role[0].toUpperCase()}${turn.role.slice(1)}: ${turn.text.trim()}`;
}

function renderArtifact(artifact: ConversationArtifact): string {
  if (!artifact.items.length) return `${artifact.kind}:${artifact.title}`;
  return [`${artifact.kind}:${artifact.title}`, ...artifact.items.map((item, index) => `${index + 1}. ${item}`)].join('\n');
}
