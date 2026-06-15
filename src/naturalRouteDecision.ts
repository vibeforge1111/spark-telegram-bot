import {
  parseBuildIntent,
  type BuildIntent
} from './buildIntent';
import {
  buildExternalResearchGoal,
  buildProjectImprovementGoal,
  classifySparkReadOnlyStateQuestion,
  extractAgentDoctrinePreference,
  extractPlainChatMemoryDirective,
  extractSparkSelfImprovementGoal,
  extractSparkWikiAnswerQuestion,
  extractSparkWikiPromotionIntent,
  extractSparkWikiQuery,
  inferDefaultBuildFromRecentScoping,
  inferMissionFromRecentContext,
  isAccessHelpQuestion,
  isAccessStatusQuestion,
  isBrowserComputerUseAuthorizationBoundaryQuestion,
  classifyStaleContextAuthorityBoundary,
  isAgentDoctrinePreferenceStatusQuestion,
  isAmbiguousLocalSparkServiceRequest,
  isBuildContextRecallQuestion,
  isDiagnosticFollowupTestQuestion,
  isDiagnosticsScanRequest,
  isExternalResearchRequest,
  isGlobalAgentDoctrineRequest,
  isLocalSparkServiceRequest,
  isMemoryDoctorRequest,
  isMissionRoutingFailureClassQuestion,
  isNoExecutionBoundary,
  isNoExecutionExplanationPrompt,
  isPublicationApprovalBoundaryQuestion,
  isQuotedDraftedExampleBoundary,
  isProjectImprovementRequest,
  isSparkChipStatusOverclaimQuestion,
  isSparkSelfMemoryDiagnosticQuestion,
  isSparkWikiInventoryQuestion,
  isSparkWikiStatusQuestion,
  isStandaloneAgentDoctrinePreference,
  isUserMemoryRecallQuestion,
  parseContextualAccessChangeIntent,
  parseMissionUpdatePreferenceIntent,
  parseNaturalAccessChangeIntent,
  parseNaturalChipCreateIntent,
  parseNaturalCreatorMissionIntent,
  parseNaturalRecursiveCommandIntent,
  parseSpawnerBoardNaturalIntent,
  shouldAnswerRuntimeTruthPriority,
  shouldAnswerWorkspaceWikiFreshnessBoundary,
  shouldPreferConversationalIdeation
} from './conversationIntent';
import type {
  NaturalRecursiveCommandTarget
} from './conversationIntent';
import type { DeterministicRouteId } from './routeTypes';
import { parseSafeOperatorAction } from './operatorActions';
import type { ShippedProjectContext } from './shippedProjectContext';
import { isPendingClarificationFollowup as isPendingBuildClarificationFollowup } from './telegramPendingBuildEvidence';

export type NaturalRouteOwnerSystem =
  | 'spark-telegram-bot'
  | 'spark-intelligence-builder'
  | 'spark-voice-comms'
  | 'domain-chip-memory'
  | 'spark-character'
  | 'spawner-ui'
  | 'spark-cli'
  | 'domain-chip'
  | 'none';

export type NaturalRouteConfidence = 'explicit' | 'contextual' | 'weak' | 'blocked';

export type NaturalRouteContextSource =
  | 'latest_message'
  | 'hot_recent_turns'
  | 'visible_exact_artifact'
  | 'pending_state'
  | 'workspace_sessions'
  | 'cold_memory'
  | 'slash_command'
  | 'none';

export interface NaturalRouteDecision {
  schema_version: 'spark.nlp.route_decision.v1';
  route: string;
  owner_system: NaturalRouteOwnerSystem;
  confidence: NaturalRouteConfidence;
  action: string;
  payload: Record<string, unknown>;
  context_source: NaturalRouteContextSource;
  matched_signals: string[];
  blocked_by: string[];
  requires_confirmation: boolean;
  trace?: Record<string, unknown>;
}

export interface NaturalRouteDecisionContext {
  recentMessages?: string[];
  recursiveTargets?: NaturalRecursiveCommandTarget[];
  shippedProject?: ShippedProjectContext | null;
  spawnerArtifact?: SpawnerArtifactContext | null;
  localSparkContext?: string;
  pendingBuildClarification?: boolean;
  allowMissionPreferenceExecutionLanguage?: boolean;
}

export interface SpawnerArtifactContext {
  projectName: string;
  requestId: string;
  missionId: string;
  status?: string | null;
  buildMode?: string | null;
  buildLane?: string | null;
  canvasUrl?: string | null;
  boardUrl?: string | null;
  updatedAt?: string | null;
  resultAvailable?: boolean;
}

function decision(input: Omit<NaturalRouteDecision, 'schema_version'>): NaturalRouteDecision {
  return {
    schema_version: 'spark.nlp.route_decision.v1',
    ...input
  };
}

function noRoute(text: string, blockedBy: string[] = ['no_matching_route']): NaturalRouteDecision {
  return decision({
    route: 'plain_chat',
    owner_system: 'none',
    confidence: text.trim() ? 'weak' : 'blocked',
    action: 'plain_chat',
    payload: {},
    context_source: text.trim() ? 'latest_message' : 'none',
    matched_signals: [],
    blocked_by: blockedBy,
    requires_confirmation: false
  });
}

function spawnerBoardNaturalRouteDecision(
  spawnerBoard: NonNullable<ReturnType<typeof parseSpawnerBoardNaturalIntent>>
): NaturalRouteDecision {
  return decision({
    route: spawnerBoard === 'board' ? 'spawner.board' : `spawner.board/${spawnerBoard}`,
    owner_system: 'spawner-ui',
    confidence: spawnerBoard === 'latest_project_preview' ? 'contextual' : 'explicit',
    action: 'spawner.board_read',
    payload: { intent: spawnerBoard },
    context_source: spawnerBoard === 'latest_project_preview' ? 'visible_exact_artifact' : 'latest_message',
    matched_signals: ['spawner_board_natural_intent'],
    blocked_by: [],
    requires_confirmation: false
  });
}

function hasRecentContext(context: NaturalRouteDecisionContext): boolean {
  return Boolean(context.recentMessages?.some((message) => message.trim()));
}

function isAccessCapabilityRepairFollowup(text: string, recentMessages: string[]): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const recentAccessContext = recentMessages
    .slice(-8)
    .join('\n')
    .toLowerCase();
  if (!/\b(?:read[-\s]*only|runner|writab|access|capability|edit)\b/.test(recentAccessContext)) return false;
  return (
    /\b(?:beyond|past|out of|fix|repair|enable|make it|make this)\b.{0,60}\bread[-\s]*only\b/.test(normalized) ||
    /^(?:did you|did it|is it fixed|is this fixed|done|fixed)\??$/.test(normalized)
  );
}

function recursiveRouteName(rawCommand: string): string {
  const verb = rawCommand.trim().split(/\s+/)[0] || 'command';
  if (['compare', 'evidence', 'benchmark', 'status'].includes(verb.toLowerCase())) {
    return 'recursive.status';
  }
  return `recursive.${verb}`;
}

function recursiveContextSource(
  text: string,
  context: NaturalRouteDecisionContext,
  rawCommand: string
): NaturalRouteContextSource {
  if (/^(?:sessions|paths)\b/i.test(rawCommand)) return 'latest_message';
  if (/\b(?:it|this|that|same|again|another|more|current|latest|readout|receipts|land|proof|approve|pass|round)\b/i.test(text)) {
    return hasRecentContext(context) ? 'hot_recent_turns' : 'workspace_sessions';
  }
  return context.recursiveTargets?.length ? 'workspace_sessions' : 'latest_message';
}

function recursiveConfidence(
  source: NaturalRouteContextSource,
  rawCommand: string
): NaturalRouteConfidence {
  if (source === 'hot_recent_turns') return 'contextual';
  if (/^start\b/i.test(rawCommand)) return 'explicit';
  return source === 'workspace_sessions' ? 'contextual' : 'explicit';
}

const BUILD_NOUN_STATUS_WORDS = 'going|coming\\s+along|progressing|doing|running|working|queued|done|finished|complete|completed|status|progress|state';

function isAdvisoryMutationQuestion(normalized: string): boolean {
  return (
    /\b(?:what|which)\b.{0,120}\b(?:would|should|could|can)\s+(?:you|we|i)\b.{0,80}\b(?:polish|improve|change|update|fix|add|remove|cut|drop|simplify|tighten|tweak|refine|rework|redesign|clean|adjust)\b/.test(normalized) ||
    /\bhow\b.{0,120}\b(?:would|should|could)\s+(?:you|we|i)\b.{0,80}\b(?:polish|improve|change|update|fix|add|remove|cut|drop|simplify|tighten|tweak|refine|rework|redesign|clean|adjust)\b/.test(normalized) ||
    /\bwhat\b.{0,80}\b(?:one|next|concrete|specific|small|smallest|simple|simpler|thoughtful)\b.{0,80}\b(?:polish|improvement|change|fix|move|step|direction)\b/.test(normalized)
  );
}

function isReadoutStatusOrPolishQuestion(normalized: string): boolean {
  return /\b(?:what\s+changed|what\s+did\s+(?:you|we|it)\s+change|what\s+is\s+different|what'?s\s+new|where\s+did\s+(?:we|it)\s+land|how\s+did\s+(?:it|that)\s+go|summary|readout|status|progress|tell\s+me\s+about|what\s+would\s+you\s+polish|what\s+should\s+(?:we|you)\s+polish|next\s+polish|polish\s+direction|what'?s\s+next)\b/.test(normalized) ||
    isAdvisoryMutationQuestion(normalized) ||
    /\bhow(?:'s|\s+is|\s+are)\s+(?:(?:it|that|this|the)\s+)?(?:[a-z0-9][a-z0-9 '&.-]{2,80})\s+(?:going|coming\s+along|progressing|doing|running|working|queued|done|finished|complete|completed)\b/.test(normalized) ||
    /\b(?:check|verify|show|separate|give\s+me|what(?:'s|\s+is)?)\b.{0,120}\b(?:preview|canvas|board|blocker|evidence|proof|receipt)s?\b/.test(normalized) ||
    /\b(?:preview|canvas|board|blocker|evidence|proof|receipt)s?\b.{0,120}\b(?:evidence|proof|receipt|status|readout|state|summary|blocker)s?\b/.test(normalized) ||
    /\bhow(?:'s|\s+is|\s+are)\s+(?:(?:it|that|this|the)\s+)?(?:(?:current|latest|recent)\s+)?(?:[a-z0-9][a-z0-9 '&.-]{0,80}\s+)?(?:build|mission|project|app|tool|board|canvas|artifact|preview)\s+(?:going|coming\s+along|progressing|doing)\b/.test(normalized) ||
    /\b(?:is|are)\s+(?:(?:it|that|this|the)\s+)?(?:(?:current|latest|recent)\s+)?(?:[a-z0-9][a-z0-9 '&.-]{0,80}\s+)?(?:build|mission|project|app|tool|board|canvas|artifact|preview)\s+(?:still\s+)?(?:running|progressing|working|queued|done|finished|complete|completed)\b/.test(normalized);
}

function isReadoutOnlyFollowup(text: string): boolean {
  const normalized = text.toLowerCase();
  const asksForReadout = /\b(?:where\s+did\s+we\s+land|where\s+are\s+we|report)\b/.test(normalized) || isReadoutStatusOrPolishQuestion(normalized);
  const asksForAction =
    /\b(?:make|create|prepare|plan|scaffold|generate|wire|connect|standardize|improve|upgrade|expand|turn|run|start)\b/.test(normalized) ||
    new RegExp(`\\bbuild\\s+(?!(?:steps?|plan|artifact|context|evidence|${BUILD_NOUN_STATUS_WORDS})\\b)(?:it|this|that|a|an|the|[a-z0-9])`, 'i').test(normalized);
  return asksForReadout && !asksForAction;
}

function isCurrentProjectReadoutQuestion(text: string, project: ShippedProjectContext | null | undefined): boolean {
  if (!project) return false;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const asksForMutation =
    /\b(?:make|create|scaffold|generate|start|run|launch|execute|dispatch|ship|deploy|save|remember)\b/.test(normalized) ||
    new RegExp(`\\bbuild\\s+(?!(?:steps?|plan|artifact|context|evidence|${BUILD_NOUN_STATUS_WORDS})\\b)(?:it|this|that|a|an|the|[a-z0-9])`, 'i').test(normalized);
  if (asksForMutation) {
    return false;
  }
  if (!readoutTargetMatchesName(normalized, project.projectName)) {
    return false;
  }
  const projectNameWords = significantNameWords(project.projectName);
  const pointsAtProject =
    /\b(?:this|that|it|current|latest|app|site|page|screen|project|build|product|tool|preview)\b/.test(normalized) ||
    projectNameWords.some((word) => normalized.includes(word));
  if (!pointsAtProject) return false;
  return isReadoutStatusOrPolishQuestion(normalized);
}

function significantNameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !/^(?:the|and|you|your|what|when|where|why|how|would|should|could|next|changed|change|polish|readout|summary|current|latest|recent|this|that|shipped|app|project|mission|build|canvas|board|tool|site|page|screen)$/.test(word));
}

export function readoutTargetWords(text: string): string[] {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const statusTarget = normalized.match(
    /\bhow(?:'s|\s+is|\s+are)\s+(?:(?:it|that|this|the)\s+)?(?!(?:current|latest|recent|build|mission|project|app|tool|board|canvas|artifact|preview)\b)([a-z0-9][a-z0-9 '&.-]{1,80}?)\s+(?:build|mission|project|app|tool|board|canvas|artifact|preview)\s+(?:going|coming\s+along|progressing|doing)\b/
  )?.[1];
  const stateTarget = normalized.match(
    /\b(?:is|are)\s+(?:(?:it|that|this|the)\s+)?(?!(?:current|latest|recent|build|mission|project|app|tool|board|canvas|artifact|preview)\b)([a-z0-9][a-z0-9 '&.-]{1,80}?)\s+(?:build|mission|project|app|tool|board|canvas|artifact|preview)\s+(?:still\s+)?(?:running|progressing|working|queued|done|finished|complete|completed)\b/
  )?.[1];
  const prepositionTarget = normalized.match(
    /\b(?:what\s+changed|readout|status|progress|summary|tell\s+me\s+about|what\s+would\s+you\s+polish|what\s+should\s+(?:we|you)\s+polish)\b.{0,80}\b(?:in|for|on|of)\s+(?!(?:this|that|current|latest|recent)\b)([a-z0-9][a-z0-9 '&.-]{1,80}?)(?=[.,;?!]|\s+(?:build|project|app|tool|board|canvas|mission|artifact|preview|and|right\s+now|now)\b|$)/
  )?.[1];
  return significantNameWords(statusTarget || stateTarget || prepositionTarget || '');
}

export function readoutTargetMatchesName(text: string, name: string): boolean {
  const targetWords = readoutTargetWords(text);
  if (targetWords.length === 0) return true;
  const nameWords = significantNameWords(name);
  return targetWords.some((word) => nameWords.includes(word));
}

function isReadoutOrPolishQuestion(normalized: string): boolean {
  return isReadoutStatusOrPolishQuestion(normalized);
}

function isCurrentSpawnerArtifactReadoutQuestion(
  text: string,
  artifact: SpawnerArtifactContext | null | undefined
): boolean {
  if (!artifact) return false;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const asksForMutation =
    /\b(?:make|create|scaffold|generate|start|run|launch|execute|dispatch|ship|deploy|save|remember)\b/.test(normalized) ||
    new RegExp(`\\bbuild\\s+(?!(?:steps?|plan|artifact|context|evidence|${BUILD_NOUN_STATUS_WORDS})\\b)(?:it|this|that|a|an|the|[a-z0-9])`, 'i').test(normalized);
  if (asksForMutation) {
    return false;
  }
  if (!isReadoutOrPolishQuestion(normalized)) return false;
  if (!readoutTargetMatchesName(normalized, artifact.projectName)) {
    return false;
  }

  const artifactWords = significantNameWords(artifact.projectName);
  const namesArtifact = artifactWords.some((word) => normalized.includes(word));
  const pointsAtCurrentArtifact =
    /\b(?:this|that|it|current|latest|recent)\b.{0,80}\b(?:canvas|mission|build|project|plan|artifact|board|tool|app)\b/.test(normalized) ||
    /\b(?:canvas|mission|build|project|plan|artifact|board|tool|app)\b.{0,80}\b(?:this|that|current|latest|recent)\b/.test(normalized) ||
    /\b(?:preview|canvas|board|blocker|evidence|proof|receipt)s?\b/.test(normalized);
  return namesArtifact || pointsAtCurrentArtifact;
}

function hasRecentSpawnerArtifactAdvice(artifact: SpawnerArtifactContext, recentMessages: string[]): boolean {
  const artifactWords = significantNameWords(artifact.projectName);
  const recentText = recentMessages
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(-12)
    .join('\n')
    .toLowerCase()
    .replace(/\\/g, '/');
  if (!recentText) return false;
  const namesArtifact = artifactWords.some((word) => recentText.includes(word));
  const hasArtifactEvidence = namesArtifact || /\b(?:current spawner result|canvas|kanban|board|preview|result evidence|build steps?|quality)\b/.test(recentText);
  const hasAdviceSignal =
    /\b(?:i(?:['\u2019]d| would)|my call is to|i would)\s+(?:cut|remove|add|make|change|tighten|simplify|turn|move|swap|use|drop)\b/.test(recentText) ||
    /\b(?:make|keep|change|turn)\s+(?:it|this|that|the\s+(?:app|button|screen|flow))\b.{0,120}\b(?:one|single|simple|simpler|cleaner|tighter|focused|screen|tap|sentence|outcome|recommendation)\b/.test(recentText) ||
    /\b(?:one\s+screen|one\s+tap|one\s+sentence|next\s+polish|polish\s+direction|remove\s+(?:the\s+)?(?:extra|duration|parking|choices)|prove\s+one\s+thing)\b/.test(recentText);
  return hasArtifactEvidence && hasAdviceSignal;
}

function buildSpawnerArtifactImprovementGoal(
  currentText: string,
  artifact: SpawnerArtifactContext,
  recentMessages: string[]
): string | null {
  if (!hasRecentSpawnerArtifactAdvice(artifact, recentMessages)) return null;
  const recentContext = recentMessages
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(-8)
    .join('\n');
  return [
    `Create the next polish pass for the current Spawner artifact "${artifact.projectName}".`,
    '',
    'This is a continuation of the visible Spawner artifact and recent Telegram advice, not a new unrelated scaffold.',
    '',
    `User approval:\n${currentText.trim()}`,
    '',
    `Current artifact evidence:\n- requestId: ${artifact.requestId}\n- missionId: ${artifact.missionId}\n- status: ${artifact.status || 'unknown'}\n- canvas: ${artifact.canvasUrl || 'unknown'}\n- board: ${artifact.boardUrl || 'unknown'}`,
    '',
    `Recent Telegram context:\n${recentContext}`,
    '',
    'Rules:',
    '- Preserve the existing artifact scope unless the user explicitly changes it.',
    '- Implement the approved polish direction from the recent assistant advice.',
    '- Keep the pass narrow and verify the core user loop.',
    '- Do not claim a local file edit until the owner system returns completion evidence.'
  ].join('\n');
}

function isContextualSpawnerArtifactImprovementFollowup(
  normalized: string,
  artifact: SpawnerArtifactContext | null | undefined,
  recentMessages: string[]
): boolean {
  if (!artifact) return false;
  if (isNoExecutionBoundary(normalized)) return false;
  const cleaned = normalized.replace(/[.!]+$/g, '').replace(/\s+/g, ' ').trim();
  const lowInformationApproval =
    /^(?:(?:yes|yeah|yep|ok|okay|sure|nice|great|perfect|cool|sounds good|right)[,.\s]*)?(?:(?:let'?s|lets|please)\s+)?(?:do|apply|make|ship|start|run|go ahead with|continue with|implement|add|use)\s+(?:that|this|it|those|them|that polish|the polish|the changes|those changes|the update|the updates|the next step|the next polish)(?:\s+(?:now|please))?$/.test(cleaned) ||
    /^(?:yes|yeah|yep|ok|okay|sure|nice|great|perfect|cool|sounds good)[,.\s]*(?:go ahead(?:\s+and\s+(?:do|apply|ship|start|run|implement)\s+it)?|do it|apply it|ship it|start it|run it|implement it)(?:\s+(?:now|please))?$/.test(cleaned);
  return lowInformationApproval && hasRecentSpawnerArtifactAdvice(artifact, recentMessages);
}

function isCreatorLoopDomainChipPhrase(text: string, recentCreatorLoopContext: boolean): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!/\bdomain[-\s]*chip\b/.test(normalized)) return false;
  if (/\b(?:speciali[sz]ation\s+path|benchmark|autoloop|creator\s+(?:mission|system|run)|startup[-\s]+yc|path|loop|evidence)\b/.test(normalized)) {
    return true;
  }
  if (!recentCreatorLoopContext) return false;
  return (
    /\b(?:create|build|make|plan|stage|scaffold|generate|set up|spin up|prepare|add|attach|update|package|link|turn)\s+(?:or\s+\w+\s+)?(?:the|this|that|same|current|latest)\s+domain[-\s]*chip\b/.test(normalized) ||
    /\b(?:create|build|make|plan|stage|scaffold|generate|set up|spin up|prepare|add|attach|update|package|link|turn)\s+or\s+\w+\s+the\s+domain[-\s]*chip\b/.test(normalized)
  );
}

function isGlobalDoctrineLikeRequest(text: string): boolean {
  if (/^(?:score|rate|evaluate|assess|review|compare|draft|explain|describe|analy[sz]e|help\s+me\s+think|what\s+(?:is|are|would|should)|how\s+(?:would|should)|why)\b/i.test(text)) {
    return false;
  }
  return isGlobalAgentDoctrineRequest(text) || (
    /\b(?:all|every|each)\s+(?:spark\s+)?agents?\b|\bglobally\b|\bsystem-wide\b/i.test(text) &&
    /\b(?:conversational|direct|decisive|warm|casual|formal|brief|concise|detailed|curious|opinionated|proactive|style|tone|personality|persona|conversation|reply|response|talk|speak|doctrine|rule|preference|ask|clarify|clarifying|confirmation|missions?|tools?|start)\b/i.test(text)
  );
}

function hasRecentProductPlanningContext(recentMessages: string[]): boolean {
  return recentMessages.some((message) => {
    const normalized = message.toLowerCase().replace(/\s+/g, ' ').trim();
    return /\b(?:sketch(?:ing)?|scope|scoping|shape|plan|planning|first\s+(?:screen|view|version)|mvp|v1|dashboard|app|tool|product|interface|ui)\b/.test(normalized) &&
      /\b(?:dashboard|app|tool|product|interface|ui|screen|view|memory|stale[-\s]*context|freshness|quality)\b/.test(normalized);
  });
}

function isDomainChipChatPlanTurn(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!/\bdomain[-\s]*chip\b/.test(normalized)) return false;
  if (/\b(?:build|create|make|ship|scaffold|generate|start|run|launch|execute|spin\s+up)\b.{0,80}\bdomain[-\s]*chip\b/.test(normalized)) {
    return false;
  }
  if (/\bdomain[-\s]*chip\b.{0,80}\b(?:build|create|make|ship|scaffold|generate|start|run|launch|execute|spin\s+up)\b/.test(normalized)) {
    return false;
  }
  return /\b(?:proposal|option|options|compare|comparing|discuss|discussion|what\s+should|what\s+would|how\s+should|which\s+(?:proposal|option|direction)|shape|scope|plan|planning|design|first\s+version|v1|trigger|proof|playbook|activation|boundary)\b/.test(normalized);
}

function isCanonicalChatPlanTurn(text: string, recentMessages: string[]): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized || normalized.startsWith('/')) return false;
  if (/\b(?:build|create|make|ship|scaffold|generate|start|run|launch|execute)\b.{0,80}\b(?:at|in|into|now|please|for me)\b/.test(normalized)) {
    return false;
  }
  if (isDomainChipChatPlanTurn(normalized)) return true;
  const productSurface = /\b(?:dashboard|app|tool|product|interface|ui|screen|view|workflow|panel|board|planner|tracker|timer|habit|memory|stale[-\s]*context|freshness|quality)\b/.test(normalized);
  const planningLanguage =
    /\b(?:sketch(?:ing)?|scope|scoping|shape|plan|planning|write\s+(?:the\s+)?plan|what\s+should|what\s+would|first\s+(?:screen|view|version)|mvp|v1|include|layout|sections?|evaluation cases?)\b/.test(normalized);
  const contextualFollowup =
    /^(?:yes|yeah|yep|ok|okay|sure|sounds good|perfect|nice|cool)\b/.test(normalized) &&
    /\b(?:what\s+should|what\s+would|first\s+(?:screen|view|version)|include|layout|sections?|evaluation cases?)\b/.test(normalized) &&
    hasRecentProductPlanningContext(recentMessages);
  return (productSurface && planningLanguage) || contextualFollowup;
}

function buildIntentPayload(buildIntent: BuildIntent): Record<string, unknown> {
  return {
    projectName: buildIntent.projectName,
    hasProjectPath: Boolean(buildIntent.projectPath),
    hasRequestedProjectPath: Boolean(buildIntent.requestedProjectPath),
    projectPathEvidenceOnly: buildIntent.projectPathEvidenceOnly,
    projectPathRejectedReason: buildIntent.projectPathRejectedReason,
    buildMode: buildIntent.buildMode,
    buildModeReason: buildIntent.buildModeReason,
    buildLane: buildIntent.buildLane,
    buildLaneReason: buildIntent.buildLaneReason
  };
}

function parseNaturalProviderRun(text: string): { providers: string[]; goal: string } | null {
  const normalized = text.trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase();
  const providerNames = ['claude', 'codex', 'minimax', 'zai', 'glm', 'openrouter'];
  const multiProviderRun = normalized.match(/\b(?:run|ask|compare)\s+((?:(?:claude|codex|minimax|zai|glm|openrouter)(?:\s*(?:,|and|&)\s*)?){2,})\s+(?:on|for|to)\s+(.+)$/i);
  if (multiProviderRun?.[1] && multiProviderRun[2]?.trim()) {
    const providers = providerNames.filter((name) => new RegExp(`\\b${name}\\b`, 'i').test(multiProviderRun[1]));
    if (providers.length >= 2) {
      return { providers, goal: multiProviderRun[2].trim() };
    }
  }
  const provider = providerNames.find((name) => (
    lower.startsWith(`${name} `) ||
    lower.startsWith(`${name},`) ||
    lower.startsWith(`ask ${name} `)
  ));
  if (provider) {
    const goal = normalized
      .replace(new RegExp(`^ask\\s+${provider}\\s+(?:to\\s+)?`, 'i'), '')
      .replace(new RegExp(`^${provider}[,\\s:]+`, 'i'), '')
      .trim();
    return goal ? { providers: [provider], goal } : null;
  }

  const allModels = normalized.match(/^all\s+models?\s*:\s*(.+)$/i);
  if (allModels?.[1]?.trim()) {
    return { providers: ['minimax', 'zai', 'claude', 'codex'], goal: allModels[1].trim() };
  }

  return null;
}

function isHarnessArchitectureChatQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const mentionsHarness =
    /\bharness(?:\s+core)?\b/.test(normalized) ||
    /\bgovernor\b/.test(normalized) && /\b(?:envelope|ledger|authority|authorization)\b/.test(normalized);
  const asksAboutArchitecture =
    /\b(?:architecture|authority\s+path|canonical\s+path|what\s+changed|changed|how\s+(?:does|should|is)|explain|difference)\b/.test(normalized);
  return mentionsHarness && asksAboutArchitecture;
}

function isPreviousRouteNeutralSummaryChatQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  return (
    /\b(?:do not|don't|dont|stop|avoid|cancel)\b.{0,80}\b(?:continue|resume|use|follow)\b.{0,80}\b(?:previous|prior|last|old)\s+(?:route|path|thread|mode)\b/.test(normalized) &&
    (/\bneutral\s+summary\b/.test(normalized) || /\bsummary\b/.test(normalized))
  );
}

function isConcreteBuildBrief(text: string, buildIntent: BuildIntent | null): boolean {
  if (!buildIntent) return false;
  if (buildIntent.projectPath) return true;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return /\b(?:build|create|scaffold|ship)\b.{0,120}\b(?:app|dashboard|tool|project|prototype|game|site|website|system|interface|board)\b/.test(normalized);
}

export function decideNaturalRoute(
  text: string,
  context: NaturalRouteDecisionContext = {}
): NaturalRouteDecision {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const recentMessages = context.recentMessages || [];

  if (!normalized) {
    return noRoute(text, ['empty_message']);
  }

  if (normalized.startsWith('/')) {
    return decision({
      route: 'slash_command',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'slash_command',
      payload: { text: normalized },
      context_source: 'slash_command',
      matched_signals: ['leading_slash'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isQuotedDraftedExampleBoundary(normalized)) {
    return decision({
      route: 'conversation.quoted_drafted_example_boundary',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.quoted_example_boundary',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['quoted_drafted_example_boundary'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isPublicationApprovalBoundaryQuestion(normalized)) {
    return decision({
      route: 'conversation.publication_approval_boundary',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.qa_boundary',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['publication_approval_boundary'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isBrowserComputerUseAuthorizationBoundaryQuestion(normalized)) {
    return decision({
      route: 'conversation.browser_computer_use_authorization_boundary',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.qa_boundary',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['browser_computer_use_authorization_boundary'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isMissionRoutingFailureClassQuestion(normalized)) {
    return decision({
      route: 'conversation.mission_routing_failure_class',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.qa_boundary',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['mission_routing_failure_class'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isNoExecutionExplanationPrompt(normalized)) {
    return decision({
      route: 'chat_explain',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.qa_boundary',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['no_execution_explanation'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isPublicationApprovalBoundaryQuestion(normalized)) {
    return decision({
      route: 'conversation.publication_approval_boundary',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.qa_boundary',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['publication_approval_boundary'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isBrowserComputerUseAuthorizationBoundaryQuestion(normalized)) {
    return decision({
      route: 'conversation.browser_computer_use_authorization_boundary',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.qa_boundary',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['browser_computer_use_authorization_boundary'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const staleContextAuthorityBoundary = classifyStaleContextAuthorityBoundary(normalized);
  if (staleContextAuthorityBoundary) {
    return decision({
      route: 'conversation.stale_context_authority_boundary',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.stale_context_authority_boundary',
      payload: { kind: staleContextAuthorityBoundary },
      context_source: 'latest_message',
      matched_signals: ['stale_context_authority_boundary', staleContextAuthorityBoundary],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isMissionRoutingFailureClassQuestion(normalized)) {
    return decision({
      route: 'conversation.mission_routing_failure_class',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.qa_boundary',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['mission_routing_failure_class'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const parsedBuildIntent = parseBuildIntent(normalized);
  const buildIntent = parsedBuildIntent;
  const missionPreference = parseMissionUpdatePreferenceIntent(normalized, {
    allowExecutionLanguage: context.allowMissionPreferenceExecutionLanguage
  });
  const chipBrief = parseNaturalChipCreateIntent(normalized);
  const conversationalIdeation = shouldPreferConversationalIdeation(normalized);
  const earlyCreatorMission = isReadoutOnlyFollowup(normalized)
    ? null
    : parseNaturalCreatorMissionIntent(normalized, { recentMessages });
  const recentCreatorLoopContext = recentMessages.some((message) => (
    /\b(?:creator\s+(?:mission|system|run)|speciali[sz]ation\s+path|benchmark\s+pack|autoloop|startup[-\s]+yc|domain[-\s]*chip.*(?:path|benchmark|autoloop)|recursive\s+loop)\b/i.test(message)
  ));
  const contextualDomainChipArtifact =
    /\bdomain[-\s]*chip\b/i.test(normalized) &&
    isCreatorLoopDomainChipPhrase(normalized, recentCreatorLoopContext);
  const creatorArtifactBundle =
    contextualDomainChipArtifact ||
    /\b(?:benchmark\s+pack|benchmarks?|evals?|evaluation\s+pack|test\s+suite|speciali[sz]ation\s+path|autoloop(?:\s+policy)?|auto\s+loop|swarm\s+(?:review|contribution)\s+packet|shareable\s+insight\s+packet|insight\s+packet|review\s+packet|reusable\s+template|loop\s+template|specialization\s+template)\b/i.test(normalized);
  const harnessArchitectureQuestion = isHarnessArchitectureChatQuestion(normalized);
  const concreteBuildBrief = isConcreteBuildBrief(normalized, buildIntent);
  const concreteStandaloneBuildBrief = concreteBuildBrief && !chipBrief;
  if (isGlobalDoctrineLikeRequest(normalized)) {
    return decision({
      route: 'agent_doctrine.global_blocked',
      owner_system: 'spark-telegram-bot',
      confidence: 'blocked',
      action: 'clarify',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['global_agent_doctrine_request'],
      blocked_by: ['chat_cannot_change_global_agent_doctrine'],
      requires_confirmation: true
    });
  }

  if (missionPreference && !concreteBuildBrief) {
    return decision({
      route: 'mission_updates.preference',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'mission_updates.preference',
      payload: { ...missionPreference },
      context_source: 'latest_message',
      matched_signals: ['mission_update_preference'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (context.pendingBuildClarification && isPendingBuildClarificationFollowup(normalized)) {
    return decision({
      route: 'spawner.pending_clarification',
      owner_system: 'spawner-ui',
      confidence: 'contextual',
      action: 'spawner.clarification_reply',
      payload: {},
      context_source: 'pending_state',
      matched_signals: ['pending_build_clarification', 'clarification_followup'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (shouldAnswerRuntimeTruthPriority(normalized)) {
    return decision({
      route: 'spark.read_only_state.runtime_truth_priority',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'harness_core.read_only_state',
      payload: {
        question: 'runtime_truth_priority',
        mutation_class: 'read_only'
      },
      context_source: 'latest_message',
      matched_signals: ['fresh_user_intent', 'stale_memory_context', 'current_state_priority'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (shouldAnswerWorkspaceWikiFreshnessBoundary(normalized)) {
    return decision({
      route: 'spark.read_only_state.workspace_wiki_freshness_boundary',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'harness_core.read_only_state',
      payload: {
        question: 'workspace_wiki_freshness_boundary',
        mutation_class: 'read_only'
      },
      context_source: 'latest_message',
      matched_signals: ['fresh_user_intent', 'workspace_wiki_context', 'current_state_priority'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const readOnlyStateQuestion = classifySparkReadOnlyStateQuestion(normalized);
  if (readOnlyStateQuestion) {
    return decision({
      route: `spark.read_only_state.${readOnlyStateQuestion}`,
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'harness_core.read_only_state',
      payload: {
        question: readOnlyStateQuestion,
        mutation_class: 'read_only'
      },
      context_source: 'latest_message',
      matched_signals: ['fresh_user_intent', 'read_only_state_question', `read_only_state:${readOnlyStateQuestion}`],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const spawnerBoard = parseSpawnerBoardNaturalIntent(normalized);
  if (spawnerBoard && spawnerBoard !== 'latest_project_preview') {
    return spawnerBoardNaturalRouteDecision(spawnerBoard);
  }

  if (isCurrentSpawnerArtifactReadoutQuestion(normalized, context.spawnerArtifact)) {
    return decision({
      route: 'project.readout',
      owner_system: 'spark-telegram-bot',
      confidence: 'contextual',
      action: 'project.readout',
      payload: {
        artifactKind: 'spawner_artifact',
        projectName: context.spawnerArtifact?.projectName,
        requestId: context.spawnerArtifact?.requestId,
        missionId: context.spawnerArtifact?.missionId,
        status: context.spawnerArtifact?.status || null,
        buildMode: context.spawnerArtifact?.buildMode || null,
        buildLane: context.spawnerArtifact?.buildLane || null,
        canvasUrl: context.spawnerArtifact?.canvasUrl || null,
        boardUrl: context.spawnerArtifact?.boardUrl || null,
        resultAvailable: context.spawnerArtifact?.resultAvailable === true
      },
      context_source: 'visible_exact_artifact',
      matched_signals: ['spawner_artifact_context', 'project_readout_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isProjectImprovementRequest(normalized, context.shippedProject, recentMessages)) {
    return decision({
      route: 'project.iteration',
      owner_system: 'spawner-ui',
      confidence: 'contextual',
      action: 'project.iteration',
      payload: {
        projectName: context.shippedProject?.projectName,
        projectPath: context.shippedProject?.projectPath,
        goal: buildProjectImprovementGoal(normalized, context.shippedProject, recentMessages)
      },
      context_source: 'visible_exact_artifact',
      matched_signals: ['shipped_project_context', 'project_improvement_request'],
      blocked_by: [],
      requires_confirmation: true
    });
  }

  if (isCurrentProjectReadoutQuestion(normalized, context.shippedProject)) {
    return decision({
      route: 'project.readout',
      owner_system: 'spark-telegram-bot',
      confidence: 'contextual',
      action: 'project.readout',
      payload: {
        projectName: context.shippedProject?.projectName,
        projectPath: context.shippedProject?.projectPath,
        previewUrl: context.shippedProject?.previewUrl,
        missionId: context.shippedProject?.missionId,
        requestId: context.shippedProject?.requestId
      },
      context_source: 'visible_exact_artifact',
      matched_signals: ['shipped_project_context', 'project_readout_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (
    buildIntent &&
    !isNoExecutionBoundary(normalized) &&
    (!harnessArchitectureQuestion || concreteBuildBrief) &&
    ((!earlyCreatorMission && !conversationalIdeation) || concreteStandaloneBuildBrief)
  ) {
    return decision({
      route: 'spawner.build',
      owner_system: 'spawner-ui',
      confidence: 'explicit',
      action: 'spawner.build',
      payload: buildIntentPayload(buildIntent),
      context_source: buildIntent.projectPath ? 'visible_exact_artifact' : 'latest_message',
      matched_signals: ['build_intent'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (harnessArchitectureQuestion) {
    return decision({
      route: 'plain_chat',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.harness_architecture',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['harness_architecture_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isPreviousRouteNeutralSummaryChatQuestion(normalized)) {
    return decision({
      route: 'plain_chat',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.previous_route_neutral_summary',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['previous_route_neutral_summary'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const memoryDirective = extractPlainChatMemoryDirective(normalized);
  if (memoryDirective) {
    return decision({
      route: 'memory.write',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'memory.write',
      payload: { directive: memoryDirective },
      context_source: 'latest_message',
      matched_signals: ['plain_chat_memory_directive'],
      blocked_by: [],
      requires_confirmation: false
    });
  }
  if (chipBrief && (!earlyCreatorMission || !creatorArtifactBundle)) {
    return decision({
      route: 'domain_chip.create',
      owner_system: 'domain-chip',
      confidence: 'explicit',
      action: 'domain_chip.create',
      payload: { brief: chipBrief },
      context_source: 'latest_message',
      matched_signals: ['natural_domain_chip_create'],
      blocked_by: [],
      requires_confirmation: true
    });
  }
  const explicitAccessLevel = parseNaturalAccessChangeIntent(normalized);
  if (explicitAccessLevel) {
    return decision({
      route: 'access.change',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'access.change',
      payload: { level: explicitAccessLevel },
      context_source: 'latest_message',
      matched_signals: ['explicit_access_change'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const contextualAccessLevel = parseContextualAccessChangeIntent(normalized, recentMessages);
  if (contextualAccessLevel) {
    return decision({
      route: 'access.change',
      owner_system: 'spark-telegram-bot',
      confidence: 'contextual',
      action: 'access.change',
      payload: { level: contextualAccessLevel },
      context_source: 'hot_recent_turns',
      matched_signals: ['recent_access_focus', 'contextual_access_change'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isAccessCapabilityRepairFollowup(normalized, recentMessages)) {
    return decision({
      route: 'access.status',
      owner_system: 'spark-telegram-bot',
      confidence: 'contextual',
      action: 'access.status',
      payload: { reason: 'access_capability_repair' },
      context_source: 'hot_recent_turns',
      matched_signals: ['recent_access_repair_context'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isAccessStatusQuestion(normalized)) {
    return decision({
      route: 'access.status',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'access.status',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['access_status_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isAccessHelpQuestion(normalized)) {
    return decision({
      route: 'access.help',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'access.help',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['access_help_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const safeOperatorAction = parseSafeOperatorAction(normalized);
  if (safeOperatorAction) {
    return decision({
      route: 'operator.safe_action',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'operator.safe_action',
      payload: { kind: safeOperatorAction.kind },
      context_source: 'latest_message',
      matched_signals: ['bounded_operator_probe'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const agentPreference = extractAgentDoctrinePreference(normalized);
  if (agentPreference && isStandaloneAgentDoctrinePreference(normalized)) {
    return decision({
      route: 'agent_doctrine.preference',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'agent_doctrine.preference',
      payload: { preference: agentPreference },
      context_source: 'latest_message',
      matched_signals: ['standalone_agent_doctrine_preference'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isAgentDoctrinePreferenceStatusQuestion(normalized)) {
    return decision({
      route: 'agent_doctrine.status',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'agent_doctrine.status',
      payload: {},
      context_source: 'cold_memory',
      matched_signals: ['agent_doctrine_status_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isUserMemoryRecallQuestion(normalized)) {
    return decision({
      route: 'memory.recall',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'memory.recall',
      payload: {},
      context_source: 'cold_memory',
      matched_signals: ['user_memory_recall_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isMemoryDoctorRequest(normalized)) {
    const contextual = /\b(?:previous|last|recent|current|turn|reply|answer|response|request|message|what\s+happened)\b/i.test(normalized);
    return decision({
      route: 'memory.doctor',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'memory.doctor',
      payload: {},
      context_source: contextual && hasRecentContext(context) ? 'hot_recent_turns' : 'latest_message',
      matched_signals: ['memory_doctor_request'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isSparkWikiInventoryQuestion(normalized)) {
    return decision({
      route: 'spark_wiki.inventory',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'spark_wiki.inventory',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['spark_wiki_inventory_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const wikiQuestion = extractSparkWikiAnswerQuestion(normalized);
  if (wikiQuestion) {
    return decision({
      route: 'spark_wiki.answer',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'spark_wiki.answer',
      payload: { question: wikiQuestion },
      context_source: 'cold_memory',
      matched_signals: ['spark_wiki_answer_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const wikiQuery = extractSparkWikiQuery(normalized);
  if (wikiQuery) {
    return decision({
      route: 'spark_wiki.query',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'spark_wiki.query',
      payload: { query: wikiQuery },
      context_source: 'cold_memory',
      matched_signals: ['spark_wiki_query'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isSparkWikiStatusQuestion(normalized)) {
    return decision({
      route: 'spark_wiki.status',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'spark_wiki.status',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['spark_wiki_status_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const wikiPromotion = extractSparkWikiPromotionIntent(normalized);
  if (wikiPromotion) {
    return decision({
      route: 'spark_wiki.promote',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'spark_wiki.promote',
      payload: { ...wikiPromotion },
      context_source: 'latest_message',
      matched_signals: ['spark_wiki_promotion_intent'],
      blocked_by: [],
      requires_confirmation: wikiPromotion.status === 'verified'
    });
  }

  const selfImprovementGoal = extractSparkSelfImprovementGoal(normalized);
  if (selfImprovementGoal) {
    return decision({
      route: 'spark.self_improvement',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'spark.self_improvement',
      payload: { goal: selfImprovementGoal },
      context_source: 'latest_message',
      matched_signals: ['spark_self_improvement_goal'],
      blocked_by: [],
      requires_confirmation: true
    });
  }

  if (isSparkSelfMemoryDiagnosticQuestion(normalized)) {
    return decision({
      route: 'spark.self_diagnostic',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'spark.self_diagnostic',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['spark_self_memory_diagnostic_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isSparkChipStatusOverclaimQuestion(normalized)) {
    return decision({
      route: 'spark.chip_status_probe',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'spark.chip_status_probe',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['spark_chip_status_overclaim_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const recursive = parseNaturalRecursiveCommandIntent(normalized, {
    recentMessages,
    targets: context.recursiveTargets
  });
  if (recursive) {
    const source = recursiveContextSource(normalized, context, recursive.rawCommand);
    return decision({
      route: recursiveRouteName(recursive.rawCommand),
      owner_system: 'spark-telegram-bot',
      confidence: recursiveConfidence(source, recursive.rawCommand),
      action: 'recursive.command',
      payload: { rawCommand: recursive.rawCommand, reason: recursive.reason },
      context_source: source,
      matched_signals: ['natural_recursive_command'],
      blocked_by: [],
      requires_confirmation: /^start\b/i.test(recursive.rawCommand)
    });
  }

  const creatorMission = earlyCreatorMission;
  if (creatorMission) {
    return decision({
      route: 'creator.mission',
      owner_system: 'spawner-ui',
      confidence: /(?:it|this|that|these|those|current|same)\b/i.test(normalized) ? 'contextual' : 'explicit',
      action: 'creator.mission',
      payload: { ...creatorMission },
      context_source: /(?:it|this|that|these|those|current|same)\b/i.test(normalized) ? 'hot_recent_turns' : 'latest_message',
      matched_signals: ['natural_creator_mission'],
      blocked_by: [],
      requires_confirmation: creatorMission.riskLevel !== 'low'
    });
  }

  if (missionPreference) {
    return decision({
      route: 'mission_updates.preference',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'mission_updates.preference',
      payload: { ...missionPreference },
      context_source: 'latest_message',
      matched_signals: ['mission_update_preference'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (spawnerBoard) {
    return spawnerBoardNaturalRouteDecision(spawnerBoard);
  }

  if (isAmbiguousLocalSparkServiceRequest(normalized, context.localSparkContext || '')) {
    return decision({
      route: 'local_service.clarify',
      owner_system: 'spark-telegram-bot',
      confidence: 'weak',
      action: 'clarify',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['ambiguous_local_spark_service_request'],
      blocked_by: ['missing_local_surface_reference'],
      requires_confirmation: true
    });
  }

  if (isLocalSparkServiceRequest(normalized, context.localSparkContext || '')) {
    return decision({
      route: 'local_service.open',
      owner_system: 'spark-telegram-bot',
      confidence: 'contextual',
      action: 'local_service.open',
      payload: {},
      context_source: context.localSparkContext ? 'hot_recent_turns' : 'latest_message',
      matched_signals: ['local_spark_service_request'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isExternalResearchRequest(normalized)) {
    return decision({
      route: 'external_research.inspect',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'external_research.inspect',
      payload: { goal: buildExternalResearchGoal(normalized, recentMessages) },
      context_source: 'latest_message',
      matched_signals: ['external_research_request'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isDiagnosticsScanRequest(normalized)) {
    return decision({
      route: 'diagnostics.scan',
      owner_system: 'spark-cli',
      confidence: 'explicit',
      action: 'diagnostics.scan',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['diagnostics_scan_request'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  const providerRun = parseNaturalProviderRun(normalized);
  if (providerRun) {
    return decision({
      route: 'natural_run',
      owner_system: 'spawner-ui',
      confidence: 'explicit',
      action: 'natural_run',
      payload: { providers: providerRun.providers, goal: providerRun.goal },
      context_source: 'latest_message',
      matched_signals: ['natural_provider_run'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isDiagnosticFollowupTestQuestion(normalized)) {
    return decision({
      route: 'diagnostics.followup_test',
      owner_system: 'spark-intelligence-builder',
      confidence: 'contextual',
      action: 'diagnostics.followup_test',
      payload: {},
      context_source: hasRecentContext(context) ? 'hot_recent_turns' : 'latest_message',
      matched_signals: ['diagnostic_followup_test_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isBuildContextRecallQuestion(normalized)) {
    return decision({
      route: 'build_context.recall',
      owner_system: 'spark-telegram-bot',
      confidence: 'contextual',
      action: 'build_context.recall',
      payload: {},
      context_source: 'hot_recent_turns',
      matched_signals: ['build_context_recall_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (isContextualSpawnerArtifactImprovementFollowup(normalized, context.spawnerArtifact, recentMessages)) {
    const artifact = context.spawnerArtifact!;
    return decision({
      route: 'project.iteration',
      owner_system: 'spawner-ui',
      confidence: 'contextual',
      action: 'project.iteration',
      payload: {
        artifactKind: 'spawner_artifact',
        projectName: artifact.projectName,
        requestId: artifact.requestId,
        missionId: artifact.missionId,
        goal: buildSpawnerArtifactImprovementGoal(text, artifact, recentMessages)
      },
      context_source: 'visible_exact_artifact',
      matched_signals: ['spawner_artifact_context', 'project_improvement_followup'],
      blocked_by: [],
      requires_confirmation: true
    });
  }

  const inferredMission = inferMissionFromRecentContext(normalized, recentMessages);
  if (inferredMission) {
    return decision({
      route: 'spawner.contextual_mission',
      owner_system: 'spawner-ui',
      confidence: 'contextual',
      action: 'spawner.contextual_mission',
      payload: { ...inferredMission },
      context_source: 'hot_recent_turns',
      matched_signals: ['mission_execution_confirmation', 'recent_planning_context'],
      blocked_by: [],
      requires_confirmation: true
    });
  }

  const defaultBuild = inferDefaultBuildFromRecentScoping(normalized, recentMessages);
  if (defaultBuild) {
    return decision({
      route: 'spawner.default_build',
      owner_system: 'spawner-ui',
      confidence: 'contextual',
      action: 'spawner.default_build',
      payload: { ...defaultBuild },
      context_source: 'hot_recent_turns',
      matched_signals: ['default_build_from_recent_scoping'],
      blocked_by: [],
      requires_confirmation: true
    });
  }

  if (isCanonicalChatPlanTurn(normalized, recentMessages)) {
    return decision({
      route: 'chat_plan',
      owner_system: 'spark-intelligence-builder',
      confidence: hasRecentProductPlanningContext(recentMessages) ? 'contextual' : 'explicit',
      action: 'plain_chat.plan',
      payload: {},
      context_source: hasRecentProductPlanningContext(recentMessages) ? 'hot_recent_turns' : 'latest_message',
      matched_signals: ['canonical_chat_plan'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (conversationalIdeation) {
    return decision({
      route: 'conversation.ideation',
      owner_system: 'spark-intelligence-builder',
      confidence: 'explicit',
      action: 'plain_chat.ideation',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['conversational_ideation'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  return noRoute(normalized);
}
