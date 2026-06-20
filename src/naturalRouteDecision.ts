import {
  parseBuildIntent,
  type BuildIntent
} from './buildIntent';
import {
  buildExternalResearchGoal,
  buildProjectImprovementGoal,
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
  parseSpawnerMissionRerunNaturalIntent,
  parseSpawnerMissionStatusNaturalIntent,
  parseSpawnerBoardNaturalIntent,
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
  | 'spark-browser'
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
  localSparkContext?: string;
  pendingBuildClarification?: boolean;
  allowMissionPreferenceExecutionLanguage?: boolean;
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

function isSourceAttributedActionReport(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const source =
    /\b(?:memory|memories|trace|log|logs|doc|document|report|ticket|screenshot|reply|message|status|board|canvas|previous\s+answer|old\s+context|prior\s+turn|route\s+history)\b/;
  const reportVerb =
    /\b(?:says|say|said|claims|claimed|mentions|mentioned|contains|contained|shows|showed|tells|told|asks|asked|instructs|instructed)\b/;
  const actionVerb =
    /\b(?:delete|cancel|remove|kill|stop|drop|disable|turn\s+off|build|create|make|run|launch|execute|dispatch|save|remember|publish|deploy|ship|change|set|switch|grant|revoke|propose|research|browse)\b/;
  return source.test(normalized) && reportVerb.test(normalized) && actionVerb.test(normalized);
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

function isReadoutOnlyFollowup(text: string): boolean {
  const normalized = text.toLowerCase();
  const asksForReadout = /\b(?:where\s+did\s+we\s+land|where\s+are\s+we|readout|status|report|summary|what\s+changed|how\s+did\s+(?:it|that)\s+go)\b/.test(normalized);
  const asksForAction = /\b(?:make|build|create|prepare|plan|scaffold|generate|wire|connect|standardize|improve|upgrade|expand|turn|run|start)\b/.test(normalized);
  return asksForReadout && !asksForAction;
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
  const productSurface = /\b(?:dashboard|app|tool|product|interface|ui|screen|view|workflow|panel|board|memory|stale[-\s]*context|freshness|quality)\b/.test(normalized);
  const planningLanguage =
    /\b(?:sketch(?:ing)?|scope|scoping|shape|plan|planning|what\s+should|what\s+would|first\s+(?:screen|view|version)|mvp|v1|include|layout|sections?|evaluation cases?)\b/.test(normalized);
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

function extractBrowserNavigateUrl(text: string): string | null {
  const match = text.match(/\bhttps?:\/\/[^\s<>()\[\]{}"']+/i);
  if (!match) return null;
  const candidate = match[0].replace(/[.,;:!?]+$/g, '');
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isBrowserNavigateRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!normalized || !extractBrowserNavigateUrl(text)) return false;
  const asksBrowser =
    /\b(?:use|open|run|call|drive|check|inspect|visit|load)\b.{0,80}\b(?:browser|browser-use|computer[-\s]*use)\b/.test(normalized) ||
    /\b(?:browser|browser-use|computer[-\s]*use)\b.{0,80}\b(?:open|visit|load|inspect|check)\b/.test(normalized);
  const asksPageFact = /\b(?:title|page|visible|text|what\s+does\s+it\s+say|tell\s+me)\b/.test(normalized);
  return asksBrowser || (/\b(?:open|visit|load)\b/.test(normalized) && asksPageFact);
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

  if (isSourceAttributedActionReport(normalized)) {
    return decision({
      route: 'conversation.source_attributed_action_boundary',
      owner_system: 'spark-telegram-bot',
      confidence: 'explicit',
      action: 'plain_chat.source_attributed_action_boundary',
      payload: {},
      context_source: 'latest_message',
      matched_signals: ['source_attributed_action_boundary'],
      blocked_by: ['source_attributed_action_report'],
      requires_confirmation: false
    });
  }

  const parsedBuildIntent = parseBuildIntent(normalized);
  const buildIntent = parsedBuildIntent;
  const buildContextRecall = isBuildContextRecallQuestion(normalized);
  const missionRerun = parseSpawnerMissionRerunNaturalIntent(normalized, recentMessages);
  const missionStatus = parseSpawnerMissionStatusNaturalIntent(normalized);
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

  if (missionRerun) {
    return decision({
      route: 'spawner.mission_control',
      owner_system: 'spawner-ui',
      confidence: missionRerun.source === 'explicit_mission_id' ? 'explicit' : 'contextual',
      action: 'spawner.mission_rerun_request',
      payload: { ...missionRerun },
      context_source: missionRerun.source === 'explicit_mission_id' ? 'latest_message' : 'hot_recent_turns',
      matched_signals: ['mission_rerun_request', missionRerun.source],
      blocked_by: ['requires_owner_dispatch_pack'],
      requires_confirmation: true
    });
  }

  if (missionStatus) {
    return decision({
      route: 'spawner.mission_control',
      owner_system: 'spawner-ui',
      confidence: 'explicit',
      action: 'spawner.mission_status',
      payload: { ...missionStatus },
      context_source: 'latest_message',
      matched_signals: ['specific_mission_status_question'],
      blocked_by: [],
      requires_confirmation: false
    });
  }

  if (buildContextRecall) {
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

  if (isProjectImprovementRequest(normalized, context.shippedProject)) {
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

  const spawnerBoard = parseSpawnerBoardNaturalIntent(normalized);
  if (spawnerBoard) {
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

  const browserUrl = extractBrowserNavigateUrl(normalized);
  if (browserUrl && isBrowserNavigateRequest(normalized)) {
    return decision({
      route: 'browser.navigate',
      owner_system: 'spark-browser',
      confidence: 'explicit',
      action: 'browser.navigate',
      payload: { url: browserUrl },
      context_source: 'latest_message',
      matched_signals: ['browser_navigate_request'],
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
