import {
  extractPlainChatMemoryDirective,
  extractSparkWikiAnswerQuestion,
  extractSparkWikiPromotionIntent,
  extractSparkWikiQuery,
  classifyStaleContextAuthorityBoundary,
  isActionWordMetaDiscussion,
  isAccessHelpQuestion,
  isAccessStatusQuestion,
  isBrowserComputerUseAuthorizationBoundaryQuestion,
  isMissionRoutingFailureClassQuestion,
  isNoExecutionBoundary,
  isPublicationApprovalBoundaryQuestion,
  isQuotedDraftedExampleBoundary,
  isSparkIntentAuthorityBoundaryQuestion,
  isSparkWikiInventoryQuestion,
  isSparkWikiStatusQuestion,
  isStartupFounderAdvisoryQuestion,
  isStartupReleaseBoundaryQuestion,
  isStartupSelfImprovementCanaryRequest,
  isUserMemoryRecallQuestion,
  shouldPreferConversationalIdeation
} from './conversationIntent';
import { parseBuildIntent } from './buildIntent';
import { decideNaturalRoute, type NaturalRouteDecision, type NaturalRouteDecisionContext } from './naturalRouteDecision';
import { isLiveSparkHealthQuestion } from './runtimeRouteGuards';
import type {
  TelegramIntentCandidateV2,
  TelegramIntentConstraintsV2,
  TelegramIntentDecisionV2,
  TelegramIntentKindV2
} from './intentContract';

export type TelegramIntentGateV2Mode = 'off' | 'shadow' | 'enforce_safe';

export interface TelegramIntentGateV2Context extends NaturalRouteDecisionContext {
  naturalRouteDecision?: NaturalRouteDecision | null;
}

function emptyConstraints(): TelegramIntentConstraintsV2 {
  return {
    noExecution: false,
    noPublish: false,
    noMerge: false,
    noPublicClaim: false,
    noNetworkAbsorptionClaim: false,
    localOnly: false
  };
}

export function parseTelegramIntentConstraintsV2(text: string): TelegramIntentConstraintsV2 {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const constraints = emptyConstraints();
  if (!normalized) return constraints;

  if (isPublicationApprovalBoundaryQuestion(normalized)) {
    constraints.noExecution = isPublicationApprovalConstraintBoundary(normalized);
    constraints.noPublish = true;
    constraints.noMerge = true;
    constraints.noPublicClaim = true;
    constraints.noNetworkAbsorptionClaim = true;
    constraints.localOnly = true;
    return constraints;
  }

  if (isQuotedDraftedExampleBoundary(normalized)) {
    constraints.noExecution = true;
    constraints.noNetworkAbsorptionClaim = true;
    constraints.localOnly = true;
    return constraints;
  }

  if (isBrowserComputerUseAuthorizationBoundaryQuestion(normalized)) {
    constraints.noExecution = true;
    constraints.noNetworkAbsorptionClaim = true;
    constraints.localOnly = true;
    return constraints;
  }

  if (isMissionRoutingFailureClassQuestion(normalized)) {
    constraints.noExecution = true;
    constraints.noNetworkAbsorptionClaim = true;
    constraints.localOnly = true;
    return constraints;
  }

  if (isSparkIntentAuthorityBoundaryQuestion(normalized)) {
    constraints.noExecution = true;
    constraints.noNetworkAbsorptionClaim = true;
    constraints.localOnly = true;
    return constraints;
  }

  if (classifyStaleContextAuthorityBoundary(normalized)) {
    constraints.noExecution = true;
    constraints.noNetworkAbsorptionClaim = true;
    constraints.localOnly = true;
    return constraints;
  }

  const hasMetaLanguageBoundary =
    isActionWordMetaDiscussion(normalized) ||
    /\b(?:mentioning|just mentioning|only mentioning|keyword|keywords|word here|words here|word alone|words alone|phrase|phrases|term|terms|example|quoted example|quoted text|quoted bug[-\s]*report term|bug\s+report|qa\s+case|meta[-\s]*language|just quoted|only quoted|not a request|not an instruction|not a command|not asking for|does not mean|doesn't mean|not mean|talking about the (?:word|phrase)|discussing the (?:word|phrase))\b/.test(normalized);
  const hasExecutionKeyword =
    /\b(?:build|create|make|scaffold|generate|start|run|launch|execute|dispatch|mission|spawner|codex|provider|schedule|loop|chip|publish|deploy|ship|save|store|remember|route|memory|wiki|access|draft|canvas)\b/.test(normalized);

  constraints.noExecution = [
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:build|create|make|scaffold|generate|start|run|launch|execute|dispatch|mission|spawner|codex|provider|schedule|loop|chip|save|store|remember|route|memory|wiki|access|draft|canvas)\b(?:\s+(?:it|this|that|anything|something|yet|for\s+now|now))?/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:start|run|launch|execute|dispatch|kick\s+off)\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:build|create|make|scaffold|generate|save|store|remember)\s+(?:it|this|that|anything|something|a\s+mission|a\s+build|a\s+project|a\s+domain[-\s]*chip|a\s+chip|the\s+mission|the\s+build|the\s+project|the\s+domain[-\s]*chip|the\s+chip|yet|for\s+now)?\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:do|act\s+on|execute)\s+(?:it|this|that|the\s+example)\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:cancel|pause|resume|stop|kill)\b/,
    /\b(?:do not|don't|dont|please don't|please dont)\s+(?:start|run|launch|execute|kick\s+off)\s+(?:anything|something|new\s+work|work|tasks?|missions?|builds?)\b/,
    /\b(?:no|without)\s+(?:execution|running|launching|mission|build(?!\s+(?:step|steps|system|tool(?:ing)?|pipeline|script|scripts|command|commands)\b))\b/,
    /\b(?:hold off|not now|not for now|later)\s+on\s+(?:running|launching|executing|starting|building|creating|making|build|create|make)\b/,
    /\bno\s+tool\s+call\b/,
    /\bno[-\s]*store\b/,
    /\bnot\s+a?\s*tool\s+call\b/,
    /\b(?:keep|stay)\s+(?:this|it)?\s*(?:(?:local|private)\s+and\s+)?(?:in\s+)?(?:chat|conversation|conversational)\b/,
    /\b(?:just explain|explain only|only explain|we can talk here|talk here|stay in chat)\b/
  ].some((pattern) => pattern.test(normalized)) || (hasMetaLanguageBoundary && hasExecutionKeyword);

  if (constraints.noExecution && isExplicitSpawnerNoEditMissionRequest(normalized)) {
    constraints.noExecution = false;
  }

  constraints.noPublish = [
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+(?:publish|share|deploy|ship)\b/,
    /\bno\s+(?:publish|publication|sharing|deployment|shipping)\b/,
    /\bpublish\s+nothing\b/,
    /\bprivate(?:ly)?\s+first\b/
  ].some((pattern) => pattern.test(normalized));

  constraints.noMerge = [
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+merge\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+[^.?!]{0,80}\bmerge\b/,
    /\bno\s+merge\b/
  ].some((pattern) => pattern.test(normalized));

  constraints.noPublicClaim = [
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+claim\b.{0,60}\bpublic\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+[^.?!]{0,120}\bclaim\b.{0,60}\bpublic\b/,
    /\bpublic[-\s]*ready\s*(?:false|no|not|=)\b/,
    /\bdo\s+not\s+claim\s+(?:public|release)\s+readiness\b/
  ].some((pattern) => pattern.test(normalized));

  constraints.noNetworkAbsorptionClaim = [
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+claim\b.{0,80}\bnetwork[-\s]*(?:absorbable|absorption)\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+[^.?!]{0,140}\bclaim\b.{0,80}\bnetwork[-\s]*(?:absorbable|absorption)\b/,
    /\b(?:do not|don't|dont|please don't|please dont|no need to)\s+[^.?!]{0,140}\bclaim\b.{0,80}\b(?:public\s*\/\s*network|network)\s+readiness\b/,
    /\bnetwork[-\s]*(?:absorbable|absorption)\s*(?:false|no|not|=)\b/
  ].some((pattern) => pattern.test(normalized));

  constraints.localOnly = constraints.noPublish ||
    /\blocal[-\s]*only\b/.test(normalized) ||
    /\bprivate(?:ly)?\s+(?:first|only)\b/.test(normalized);

  return constraints;
}

function isPublicationApprovalConstraintBoundary(normalized: string): boolean {
  return (
    isNoExecutionBoundary(normalized) ||
    /\b(?:right\s+now|for\s+now|currently|here)\b.{0,50}\b(?:just|only|list|show|tell|explain|outline)\b/.test(normalized) ||
    /\b(?:just|only)\b.{0,40}\b(?:list|show|tell|explain|outline)\b/.test(normalized) ||
    /\b(?:do\s+not|don't|dont|no|not|without)\b.{0,50}\b(?:publish|deploy|release|ship|merge|open\s+(?:a\s+)?pr|push\s+to\s+main)\b/.test(normalized)
  );
}

function candidate(
  kind: TelegramIntentKindV2,
  route: string,
  owner_system: TelegramIntentCandidateV2['owner_system'],
  reason: string
): TelegramIntentCandidateV2 {
  return { kind, route, owner_system, reason };
}

function makeDecision(input: Omit<TelegramIntentDecisionV2, 'schema_version'>): TelegramIntentDecisionV2 {
  return {
    schema_version: 'spark.telegram.intent_decision.v2',
    ...input
  };
}

function supportingRoutes(naturalRoute: NaturalRouteDecision | null): string[] {
  return naturalRoute?.route ? [naturalRoute.route] : [];
}

function basePayload(naturalRoute: NaturalRouteDecision | null): Record<string, unknown> {
  return naturalRoute ? { naturalRoute: naturalRoute.route } : {};
}

function isScheduleDeleteRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return /\b(?:delete|cancel|remove|kill|stop|drop|disable|turn\s+off)\b.{0,80}\b(?:schedule|scheduled|reminder|job|automation|routine|recurring\s+task|sched-[a-z0-9]+)\b/.test(normalized) ||
    /\b(?:schedule|scheduled|reminder|job|automation|routine|recurring\s+task|sched-[a-z0-9]+)\b.{0,80}\b(?:delete|cancel|remove|kill|stop|drop|disable|turn\s+off)\b/.test(normalized);
}

function isDomainChipCreateRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return /\b(?:build|create|make|scaffold|generate)\b.{0,80}\b(?:domain[-\s]*chip|chip)\b/.test(normalized) ||
    /^(?:please\s+)?(?:domain[-\s]*chip|chip)\s+(?:for|that|which|to)\b/.test(normalized);
}

function isBuildReadoutOrStatusQuestion(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const asksForMutation =
    /\b(?:make|create|ship|scaffold|generate|develop|start|run|launch|execute|dispatch|deploy)\b/.test(normalized) ||
    /\bbuild\s+(?!(?:steps?|plan|artifact|context|evidence|status|progress|state|going|coming\s+along|running|working|queued|done|finished|complete|completed)\b)(?:it|this|that|a|an|the|[a-z0-9])/.test(normalized);
  if (asksForMutation) return false;
  return (
    /\b(?:what\s+changed|what\s+did\s+(?:you|we|it)\s+change|what\s+is\s+different|what'?s\s+new|where\s+did\s+(?:we|it)\s+land|how\s+did\s+(?:it|that)\s+go|readout|status|progress|summary|what\s+would\s+you\s+polish|what\s+should\s+(?:we|you)\s+polish|next\s+polish|polish\s+direction|what'?s\s+next)\b/.test(normalized) ||
    /\bhow(?:'s|\s+is|\s+are)\s+(?:(?:it|that|this|the)\s+)?(?:(?:current|latest|recent)\s+)?(?:[a-z0-9][a-z0-9 '&.-]{0,80}\s+)?(?:build|mission|project|app|tool|board|canvas|artifact|preview)\s+(?:going|coming\s+along|progressing|doing)\b/.test(normalized) ||
    /\b(?:is|are)\s+(?:(?:it|that|this|the)\s+)?(?:(?:current|latest|recent)\s+)?(?:[a-z0-9][a-z0-9 '&.-]{0,80}\s+)?(?:build|mission|project|app|tool|board|canvas|artifact|preview)\s+(?:still\s+)?(?:running|progressing|working|queued|done|finished|complete|completed)\b/.test(normalized)
  );
}

function isExplicitSpawnerBuildRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const explicitNoEditMission = isExplicitSpawnerNoEditMissionRequest(normalized);
  const domainChipCreateRequest = isDomainChipCreateRequest(normalized);
  const buildIntent = parseBuildIntent(text);
  if (
    !normalized ||
    (isNoExecutionBoundary(normalized) && !explicitNoEditMission) ||
    isScheduleDeleteRequest(normalized) ||
    isCreatorBenchmarkPackRequest(normalized) ||
    isBuildReadoutOrStatusQuestion(normalized)
  ) return false;
  if (
    (shouldPreferConversationalIdeation(normalized) && !explicitNoEditMission) ||
    domainChipCreateRequest
  ) return false;
  if (buildIntent && !domainChipCreateRequest) return true;
  if (explicitNoEditMission) return true;
  const buildVerb = /\b(?:build|create|make|scaffold|generate)\b/.test(normalized);
  const productNoun = /\b(?:project|app|website|dashboard|tool|game|canvas|kanban|workflow|product|prototype|platform|board)\b/.test(normalized);
  return (
    (buildVerb && productNoun) ||
    /\b(?:let'?s|lets|please)\s+build\b/.test(normalized) ||
    /\bbuild\s+it\s+at\b/.test(normalized) ||
    (/\badvanced\s+prd\s+planning\b/.test(normalized) && buildVerb)
  );
}

function isExplicitSpawnerNoEditMissionRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\b(?:do\s+not|don't|dont|no\s+need\s+to|without)\s+(?:start|run|launch|queue|dispatch|execute)\b/.test(normalized)) return false;
  const missionLike = /\bmission\b/.test(normalized) ||
    /\bmission\s+control\b/.test(normalized) ||
    /\bdiagnostic\b/.test(normalized) ||
    /\bprobe\b/.test(normalized) ||
    /\bproof\b/.test(normalized);
  return /\bspawner\b/.test(normalized) &&
    /\b(?:run|start|launch|queue|execute)\b/.test(normalized) &&
    missionLike &&
    (/\bno[-\s]*edit\b/.test(normalized) || /\brepl(?:y|ies)\s+with\b/.test(normalized) || /\bspark_[a-z0-9_]{4,}\b/.test(normalized));
}

function isExplicitSparkQaRunRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (isCreatorBenchmarkPackRequest(normalized)) return false;
  return /\bspark\s+qa\s+operator\b/.test(normalized) &&
    /\b(?:benchmark|autoloop|proof|score|scores)\b/.test(normalized) &&
    /\b(?:run|start|execute|perform|show|check|report|score|scores|what(?:'s| is)|where)\b/.test(normalized);
}

function isExplicitSparkQaPauseRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return /\b(?:pause|stop|hold)\b/.test(normalized) &&
    /\bspark\s+qa\s+operator\b/.test(normalized) &&
    /\b(?:loop|autoloop|rounds?)\b/.test(normalized);
}

function isCreatorBenchmarkPackRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    /\b(?:create|build|make|plan|stage|scaffold|generate)\b/.test(normalized) &&
    /\b(?:benchmark pack|eval pack|evaluation pack|test suite|benchmarks?)\b/.test(normalized) &&
    /\b(?:spark\s+qa\s+operator|specialization|path|operator)\b/.test(normalized)
  );
}

function isFreshCreatorMissionNaturalSelection(text: string, naturalRoute: NaturalRouteDecision | null): boolean {
  if (!naturalRoute || naturalRoute.route !== 'creator.mission') return false;
  if (naturalRoute.confidence !== 'explicit' && naturalRoute.confidence !== 'contextual') return false;
  if (!['latest_message', 'hot_recent_turns', 'visible_exact_artifact'].includes(naturalRoute.context_source)) return false;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const hasFreshMutationVerb = /\b(?:create|build|make|plan|stage|scaffold|generate|set up|spin up|prepare|add|attach|update|package|link|turn)\b/.test(normalized);
  const hasCreatorArtifact = /\b(?:creator mission|creator system|creator run|domain[-\s]*chip|benchmark pack|eval pack|evaluation pack|test suite|speciali[sz]ation path|autoloop|auto loop|shareable insight packet|insight packet|review packet|swarm contribution packet|reusable template|loop template|speciali[sz]ation template)\b/.test(normalized);
  return hasFreshMutationVerb && hasCreatorArtifact;
}

function plainDecision(
  text: string,
  constraints: TelegramIntentConstraintsV2,
  naturalRoute: NaturalRouteDecision | null,
  blockedCandidates: TelegramIntentCandidateV2[] = []
): TelegramIntentDecisionV2 {
  return makeDecision({
    kind: text.trim() ? 'plain_conversation' : 'unknown',
    route: text.trim() ? 'plain_chat' : 'none',
    owner_system: text.trim() ? 'none' : 'none',
    action: text.trim() ? 'plain_chat' : 'ignore',
    confidence: text.trim() ? 'weak' : 'blocked',
    constraints,
    payload: basePayload(naturalRoute),
    matched_signals: [],
    blocked_candidates: blockedCandidates,
    supporting_routes: supportingRoutes(naturalRoute),
    enforcement: 'observe',
    natural_route: naturalRoute
  });
}

function kindForNaturalRoute(route: string): TelegramIntentKindV2 {
  if (/^(?:spawner\.|project\.|build_context\.)/.test(route)) return 'build_or_spawner';
  if (/^recursive\./.test(route)) return 'recursive_or_swarm';
  if (/^spark_wiki\./.test(route)) return 'wiki_or_knowledge';
  if (/^(?:diagnostics\.|memory\.doctor|spark\.self_|spark\.chip_status_probe)/.test(route)) return 'diagnostic_or_self_awareness';
  if (/^(?:creator\.|domain_chip\.)/.test(route)) return 'creator_or_domain_chip';
  if (/^(?:access\.|operator\.)/.test(route)) return 'runtime_truth_or_operator';
  if (/^memory\.recall$/.test(route)) return 'memory_recall';
  if (/^memory\.write$/.test(route)) return 'memory_write';
  if (/^schedule\./.test(route)) return 'schedule_mutation';
  if (/^conversation\.ideation$/.test(route)) return 'conversation_ideation';
  return 'plain_conversation';
}

function observedNaturalRouteDecision(
  constraints: TelegramIntentConstraintsV2,
  naturalRoute: NaturalRouteDecision
): TelegramIntentDecisionV2 {
  return makeDecision({
    kind: kindForNaturalRoute(naturalRoute.route),
    route: naturalRoute.route,
    owner_system: naturalRoute.owner_system,
    action: naturalRoute.action,
    confidence: naturalRoute.confidence === 'blocked' ? 'blocked' : naturalRoute.confidence,
    constraints,
    payload: {
      ...basePayload(naturalRoute),
      naturalAction: naturalRoute.action
    },
    matched_signals: naturalRoute.matched_signals,
    blocked_candidates: [],
    supporting_routes: supportingRoutes(naturalRoute),
    enforcement: 'observe',
    natural_route: naturalRoute
  });
}

function observedDecision(input: {
  kind: TelegramIntentKindV2;
  route: string;
  owner: TelegramIntentDecisionV2['owner_system'];
  action: string;
  constraints: TelegramIntentConstraintsV2;
  naturalRoute: NaturalRouteDecision | null;
  matchedSignals: string[];
  payload?: Record<string, unknown>;
}): TelegramIntentDecisionV2 {
  return makeDecision({
    kind: input.kind,
    route: input.route,
    owner_system: input.owner,
    action: input.action,
    confidence: 'explicit',
    constraints: input.constraints,
    payload: { ...basePayload(input.naturalRoute), ...(input.payload || {}) },
    matched_signals: input.matchedSignals,
    blocked_candidates: [],
    supporting_routes: supportingRoutes(input.naturalRoute),
    enforcement: 'observe',
    natural_route: input.naturalRoute
  });
}

export function classifyTelegramIntentV2(text: string, context: TelegramIntentGateV2Context = {}): TelegramIntentDecisionV2 {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const constraints = parseTelegramIntentConstraintsV2(normalized);
  const naturalRoute = context.naturalRouteDecision ?? decideNaturalRoute(normalized, context);
  const memoryDirective = extractPlainChatMemoryDirective(normalized);

  if (!normalized) {
    return plainDecision(normalized, constraints, naturalRoute, []);
  }

  if (normalized.startsWith('/')) {
    return makeDecision({
      kind: 'slash_command',
      route: 'slash_command',
      owner_system: 'spark-telegram-bot',
      action: 'telegram_command',
      confidence: 'explicit',
      constraints,
      payload: { text: normalized },
      matched_signals: ['slash_command'],
      blocked_candidates: [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  if (memoryDirective) {
    return makeDecision({
      kind: 'memory_write',
      route: 'memory.write',
      owner_system: 'domain-chip-memory',
      action: 'memory.write',
      confidence: 'explicit',
      constraints,
      payload: { ...basePayload(naturalRoute), directive: memoryDirective },
      matched_signals: ['explicit_memory_directive'],
      blocked_candidates: [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'enforce_safe',
      natural_route: naturalRoute
    });
  }

  if (isSparkIntentAuthorityBoundaryQuestion(normalized)) {
    return makeDecision({
      kind: 'plain_conversation',
      route: 'plain_chat',
      owner_system: 'spark-telegram-bot',
      action: 'plain_chat.qa_boundary',
      confidence: 'explicit',
      constraints,
      payload: { ...basePayload(naturalRoute), naturalAction: naturalRoute?.action },
      matched_signals: ['spark_intent_authority_boundary'],
      blocked_candidates: naturalRoute && naturalRoute.route !== 'plain_chat'
        ? [candidate(kindForNaturalRoute(naturalRoute.route), naturalRoute.route, naturalRoute.owner_system, 'Spark intent-authority QA owns the turn over incidental runtime, build, restart, or mission wording.')]
        : [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  if (isExplicitSparkQaRunRequest(normalized)) {
    return observedDecision({
      kind: 'diagnostic_or_self_awareness',
      route: 'sparkqa.run',
      owner: 'spark-telegram-bot',
      action: 'sparkqa.run',
      constraints,
      naturalRoute,
      matchedSignals: ['explicit_sparkqa_run']
    });
  }

  if (isExplicitSparkQaPauseRequest(normalized)) {
    return observedDecision({
      kind: 'diagnostic_or_self_awareness',
      route: 'sparkqa.pause',
      owner: 'spark-telegram-bot',
      action: 'sparkqa.pause',
      constraints,
      naturalRoute,
      matchedSignals: ['explicit_sparkqa_pause']
    });
  }

  if (isQuotedDraftedExampleBoundary(normalized)) {
    return makeDecision({
      kind: 'plain_conversation',
      route: 'conversation.quoted_drafted_example_boundary',
      owner_system: 'spark-telegram-bot',
      action: 'plain_chat.quoted_example_boundary',
      confidence: 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['quoted_drafted_example_boundary'],
      blocked_candidates: naturalRoute && naturalRoute.route !== 'conversation.quoted_drafted_example_boundary'
        ? [candidate(kindForNaturalRoute(naturalRoute.route), naturalRoute.route, naturalRoute.owner_system, 'Quoted or drafted high-agency wording is evidence only and cannot own execution.')]
        : [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'enforce_safe',
      natural_route: naturalRoute
    });
  }

  const staleContextAuthorityBoundary = classifyStaleContextAuthorityBoundary(normalized);
  if (staleContextAuthorityBoundary) {
    return makeDecision({
      kind: 'plain_conversation',
      route: 'conversation.stale_context_authority_boundary',
      owner_system: 'spark-telegram-bot',
      action: 'plain_chat.stale_context_authority_boundary',
      confidence: 'explicit',
      constraints,
      payload: { ...basePayload(naturalRoute), kind: staleContextAuthorityBoundary },
      matched_signals: ['stale_context_authority_boundary', staleContextAuthorityBoundary],
      blocked_candidates: naturalRoute && naturalRoute.route !== 'conversation.stale_context_authority_boundary'
        ? [candidate(kindForNaturalRoute(naturalRoute.route), naturalRoute.route, naturalRoute.owner_system, 'Stale context is evidence only and cannot own execution.')]
        : [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'enforce_safe',
      natural_route: naturalRoute
    });
  }

  if (naturalRoute && isFreshCreatorMissionNaturalSelection(normalized, naturalRoute)) {
    return observedNaturalRouteDecision(constraints, naturalRoute);
  }

  if (naturalRoute?.route === 'plain_chat' && naturalRoute.action === 'plain_chat.harness_architecture') {
    return observedNaturalRouteDecision(constraints, naturalRoute);
  }

  if (naturalRoute?.route === 'plain_chat' && naturalRoute.action === 'plain_chat.qa_boundary' && isSparkIntentAuthorityBoundaryQuestion(normalized)) {
    return observedNaturalRouteDecision(constraints, naturalRoute);
  }

  if (naturalRoute?.route.startsWith('spark.read_only_state.')) {
    return makeDecision({
      kind: 'runtime_truth_or_operator',
      route: 'spark.read_only_state',
      owner_system: 'spark-telegram-bot',
      action: naturalRoute.route,
      confidence: naturalRoute.confidence === 'blocked' ? 'blocked' : 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['natural_read_only_state_question', ...naturalRoute.matched_signals],
      blocked_candidates: [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  if (naturalRoute?.route === 'spawner.mission_control') {
    return observedNaturalRouteDecision(constraints, naturalRoute);
  }

  const explicitSpawnerNoEditMission = isExplicitSpawnerNoEditMissionRequest(normalized);
  if (naturalRoute?.route === 'project.iteration' && naturalRoute.context_source === 'visible_exact_artifact') {
    return observedNaturalRouteDecision(constraints, naturalRoute);
  }

  if (isExplicitSpawnerBuildRequest(normalized)) {
    return makeDecision({
      kind: 'build_or_spawner',
      route: 'spawner.build',
      owner_system: 'spawner-ui',
      action: 'spawner.build',
      confidence: constraints.noExecution ? 'blocked' : 'explicit',
      constraints,
      payload: {
        ...basePayload(naturalRoute),
        ...(explicitSpawnerNoEditMission ? { noFileMutation: true } : {})
      },
      matched_signals: [explicitSpawnerNoEditMission ? 'explicit_spawner_no_edit_mission' : 'explicit_spawner_build'],
      blocked_candidates: naturalRoute && naturalRoute.route !== 'spawner.build'
        ? [candidate(kindForNaturalRoute(naturalRoute.route), naturalRoute.route, naturalRoute.owner_system, 'Explicit project build request owns the turn over incidental routing signals.')]
        : [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  if (isLiveSparkHealthQuestion(normalized)) {
    return makeDecision({
      kind: 'runtime_truth_or_operator',
      route: 'spark.read_only_state',
      owner_system: 'spark-telegram-bot',
      action: 'spark.read_only_state.live_status',
      confidence: constraints.noExecution ? 'blocked' : 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['explicit_live_spark_health_question'],
      blocked_candidates: naturalRoute && naturalRoute.route !== 'spark.read_only_state'
        ? [candidate(kindForNaturalRoute(naturalRoute.route), naturalRoute.route, naturalRoute.owner_system, 'Explicit live Spark health request owns the turn over incidental routing signals.')]
        : [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  if (isCreatorBenchmarkPackRequest(normalized)) {
    return makeDecision({
      kind: 'creator_or_domain_chip',
      route: 'creator.mission',
      owner_system: 'spawner-ui',
      action: 'creator.mission',
      confidence: constraints.noExecution ? 'blocked' : 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['explicit_benchmark_pack_creator'],
      blocked_candidates: naturalRoute && naturalRoute.route !== 'creator.mission'
        ? [candidate(kindForNaturalRoute(naturalRoute.route), naturalRoute.route, naturalRoute.owner_system, 'Explicit benchmark-pack creation owns the turn over advisory chat routing.')]
        : [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  if (isScheduleDeleteRequest(normalized)) {
    return makeDecision({
      kind: 'schedule_mutation',
      route: 'schedule.delete',
      owner_system: 'spark-intelligence-builder',
      action: 'schedule.delete',
      confidence: constraints.noExecution ? 'blocked' : 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['explicit_schedule_delete'],
      blocked_candidates: [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  if (isDomainChipCreateRequest(normalized)) {
    return makeDecision({
      kind: 'creator_or_domain_chip',
      route: 'domain_chip.create',
      owner_system: 'domain-chip',
      action: 'domain_chip.create',
      confidence: constraints.noExecution ? 'blocked' : 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['explicit_domain_chip_create'],
      blocked_candidates: [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  if (isStartupSelfImprovementCanaryRequest(normalized)) {
    const blockedCandidates = [
      candidate(
        'status_or_proof_readout',
        'startup.proof_readout',
        'spark-telegram-bot',
        'The canary wording may mention proof/public/network boundaries, but the requested artifact is a before/after startup answer test.'
      ),
      candidate(
        'answer_improvement_canary',
        'spark.self_improvement',
        'spark-intelligence-builder',
        'The broad self-improvement route is too generic for this startup answer canary subtype.'
      )
    ];

    if (constraints.noExecution) {
      return makeDecision({
        kind: 'status_or_proof_readout',
        route: 'startup.proof_readout',
        owner_system: 'spark-telegram-bot',
        action: 'answer',
        confidence: 'explicit',
        constraints,
        payload: { ...basePayload(naturalRoute), blockedRoute: 'startup.answer_improvement_canary' },
        matched_signals: ['startup_self_improvement_canary', 'no_execution_boundary'],
        blocked_candidates: [
          candidate(
            'answer_improvement_canary',
            'startup.answer_improvement_canary',
            'spark-intelligence-builder',
            'The user explicitly blocked running/executing the canary.'
          )
        ],
        supporting_routes: supportingRoutes(naturalRoute),
        enforcement: 'enforce_safe',
        natural_route: naturalRoute
      });
    }

    return makeDecision({
      kind: 'answer_improvement_canary',
      route: 'startup.answer_improvement_canary',
      owner_system: 'spark-intelligence-builder',
      action: 'startup.answer_canary',
      confidence: 'explicit',
      constraints,
      payload: { ...basePayload(naturalRoute), localOnly: constraints.localOnly },
      matched_signals: ['startup_self_improvement_canary'],
      blocked_candidates: blockedCandidates,
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'enforce_safe',
      natural_route: naturalRoute
    });
  }

  const naturalRecursiveStatusOwnsTurn =
    naturalRoute?.route === 'recursive.status' &&
    /\b(?:startup\s+yc|path:|specialization\s+path|recursive\s+(?:path|loop)|autoloop)\b/i.test(normalized);

  if (isStartupReleaseBoundaryQuestion(normalized) && !naturalRecursiveStatusOwnsTurn) {
    return makeDecision({
      kind: 'status_or_proof_readout',
      route: 'startup.proof_readout',
      owner_system: 'spark-telegram-bot',
      action: 'answer',
      confidence: 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['startup_release_boundary_question'],
      blocked_candidates: [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'enforce_safe',
      natural_route: naturalRoute
    });
  }

  if (isStartupFounderAdvisoryQuestion(normalized)) {
    return makeDecision({
      kind: 'advisor_answer',
      route: 'startup.founder_advice',
      owner_system: 'spark-intelligence-builder',
      action: 'startup.operator_answer',
      confidence: 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['startup_founder_advice_question'],
      blocked_candidates: [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'enforce_safe',
      natural_route: naturalRoute
    });
  }

  if (/\bapprove\b.{0,40}\brecursive\b.{0,40}\b(?:review\s+)?item\b/i.test(normalized)) {
    return observedDecision({
      kind: 'recursive_or_swarm',
      route: 'recursive.approve',
      owner: 'spark-telegram-bot',
      action: 'recursive.approve',
      constraints,
      naturalRoute,
      matchedSignals: ['recursive_approval_phrase']
    });
  }

  if (/\bpropose\b.{0,60}\brecursive\b.{0,80}\b(?:network|packet|proposal)\b/i.test(normalized)) {
    return observedDecision({
      kind: 'recursive_or_swarm',
      route: 'recursive.propose',
      owner: 'spark-telegram-bot',
      action: 'recursive.propose',
      constraints,
      naturalRoute,
      matchedSignals: ['recursive_proposal_phrase']
    });
  }

  if (/\bwhere\s+did\b.{0,80}\b(?:spark\s+qa\s+operator|startup[-\s]+yc|domain[-\s]+chip[-\s]+creator)\b.{0,80}\b(?:loop|round|run)\b.{0,40}\bland\b/i.test(normalized)) {
    return observedDecision({
      kind: 'recursive_or_swarm',
      route: 'recursive.report',
      owner: 'spark-telegram-bot',
      action: 'recursive.report',
      constraints,
      naturalRoute,
      matchedSignals: ['recursive_named_loop_landing_question']
    });
  }

  if (
    /\breview\b.{0,80}\bquality\b.{0,80}\b(?:\/?[\w-]+\s+)?build\b/i.test(normalized) &&
    /\b(?:spawner-ui|spark-telegram-bot|spark-intelligence-builder|startup-operator|startup\s+operator|spark\s+builder)\b/i.test(normalized)
  ) {
    return makeDecision({
      kind: 'diagnostic_or_self_awareness',
      route: 'builder.build_quality_review',
      owner_system: 'spark-intelligence-builder',
      action: 'builder.build_quality_review',
      confidence: 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['builder_build_quality_review'],
      blocked_candidates: naturalRoute && naturalRoute.route !== 'plain_chat'
        ? [candidate(kindForNaturalRoute(naturalRoute.route), naturalRoute.route, naturalRoute.owner_system, 'A quality review of an existing Spark build should not become a new app build.')]
        : [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  if (
    /\bwhat\s+do\s+you\s+know\s+about\s+your\s+memory\s+system\b/i.test(normalized) &&
    /\boutranks?\s+(?:the\s+)?wiki\b/i.test(normalized)
  ) {
    return observedDecision({
      kind: 'diagnostic_or_self_awareness',
      route: 'spark.self_diagnostic',
      owner: 'spark-intelligence-builder',
      action: 'spark.self_diagnostic',
      constraints,
      naturalRoute,
      matchedSignals: ['builder_memory_cognition_boundary']
    });
  }

  if (/^why\s+did\s+you\s+answer\s+that\s+way\??$/i.test(normalized)) {
    return observedDecision({
      kind: 'diagnostic_or_self_awareness',
      route: 'builder.context_source_debug',
      owner: 'spark-intelligence-builder',
      action: 'builder.context_source_debug',
      constraints,
      naturalRoute,
      matchedSignals: ['builder_context_source_debug']
    });
  }

  const wikiPromotion = extractSparkWikiPromotionIntent(normalized);
  const wikiAnswer = extractSparkWikiAnswerQuestion(normalized);
  const looseWikiQuery =
    normalized.match(/\b(?:search|query|look\s+up|check)\s+(?:(?:your|the|spark)\s+)*(?:llm\s+)?wiki\s+(?:for|about|on)\s+(.+)$/i)?.[1]?.replace(/[?.!]+$/, '').trim() ||
    normalized.match(/\b(?:search|query|look\s+up|check)\s+(?:(?:your|the|spark)\s+)*(?:llm\s+)?wiki\s+(?:and|then)\s+(.+)$/i)?.[1]?.replace(/[?.!]+$/, '').trim() ||
    normalized.match(/\b(?:what|which)\s+candidate\s+wiki\s+learnings?\b.{0,60}\b(?:need|needs|require|requires)\s+(.+)$/i)?.[0]?.replace(/[?.!]+$/, '').trim() ||
    normalized.match(/\bscan\s+(?:your\s+)?wiki\s+candidates?\s+(?:for|about|on)\s+(.+)$/i)?.[1]?.replace(/[?.!]+$/, '').trim() ||
    null;
  const wikiQuery = extractSparkWikiQuery(normalized) || looseWikiQuery;
  if (isSparkWikiInventoryQuestion(normalized)) {
    return observedDecision({
      kind: 'wiki_or_knowledge',
      route: 'spark_wiki.inventory',
      owner: 'spark-intelligence-builder',
      action: 'spark_wiki.inventory',
      constraints,
      naturalRoute,
      matchedSignals: ['spark_wiki_inventory_question']
    });
  }
  if (isSparkWikiStatusQuestion(normalized)) {
    return observedDecision({
      kind: 'wiki_or_knowledge',
      route: 'spark_wiki.status',
      owner: 'spark-intelligence-builder',
      action: 'spark_wiki.status',
      constraints,
      naturalRoute,
      matchedSignals: ['spark_wiki_status_question']
    });
  }
  if (wikiPromotion) {
    return observedDecision({
      kind: 'wiki_or_knowledge',
      route: 'spark_wiki.promote',
      owner: 'spark-intelligence-builder',
      action: 'spark_wiki.promote',
      constraints,
      naturalRoute,
      matchedSignals: ['spark_wiki_promotion_intent'],
      payload: { title: wikiPromotion.title, status: wikiPromotion.status }
    });
  }
  if (wikiAnswer) {
    return observedDecision({
      kind: 'wiki_or_knowledge',
      route: 'spark_wiki.answer',
      owner: 'spark-intelligence-builder',
      action: 'spark_wiki.answer',
      constraints,
      naturalRoute,
      matchedSignals: ['spark_wiki_answer_question'],
      payload: { question: wikiAnswer }
    });
  }
  if (wikiQuery) {
    return observedDecision({
      kind: 'wiki_or_knowledge',
      route: 'spark_wiki.query',
      owner: 'spark-intelligence-builder',
      action: 'spark_wiki.query',
      constraints,
      naturalRoute,
      matchedSignals: ['spark_wiki_query'],
      payload: { query: wikiQuery }
    });
  }

  if (naturalRoute && naturalRoute.route === 'access.change') {
    return observedNaturalRouteDecision(constraints, naturalRoute);
  }

  if (isAccessStatusQuestion(normalized)) {
    return makeDecision({
      kind: 'access_status',
      route: 'access.status',
      owner_system: 'spark-telegram-bot',
      action: 'answer',
      confidence: 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['access_status_question'],
      blocked_candidates: [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'enforce_safe',
      natural_route: naturalRoute
    });
  }

  if (isAccessHelpQuestion(normalized)) {
    return makeDecision({
      kind: 'access_help',
      route: 'access.help',
      owner_system: 'spark-telegram-bot',
      action: 'answer',
      confidence: 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['access_help_question'],
      blocked_candidates: [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'enforce_safe',
      natural_route: naturalRoute
    });
  }

  if (isUserMemoryRecallQuestion(normalized)) {
    return makeDecision({
      kind: 'memory_recall',
      route: 'memory.recall',
      owner_system: 'domain-chip-memory',
      action: 'memory.recall',
      confidence: 'explicit',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['memory_recall_question'],
      blocked_candidates: [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  if (/\bmaybe\s+we\s+should\b/i.test(normalized) && shouldPreferConversationalIdeation(normalized)) {
    return makeDecision({
      kind: 'conversation_ideation',
      route: 'conversation.ideation',
      owner_system: 'spark-intelligence-builder',
      action: 'plain_chat.ideation',
      confidence: 'contextual',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['tentative_conversational_ideation'],
      blocked_candidates: naturalRoute && naturalRoute.route !== 'plain_chat'
        ? [candidate(kindForNaturalRoute(naturalRoute.route), naturalRoute.route, naturalRoute.owner_system, 'Tentative "maybe we should" wording asks for shaping before ownership by a build/creator route.')]
        : [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  if (naturalRoute && naturalRoute.route !== 'plain_chat') {
    return observedNaturalRouteDecision(constraints, naturalRoute);
  }

  if (shouldPreferConversationalIdeation(normalized)) {
    return makeDecision({
      kind: 'conversation_ideation',
      route: 'conversation.ideation',
      owner_system: 'spark-intelligence-builder',
      action: 'plain_chat.ideation',
      confidence: 'contextual',
      constraints,
      payload: basePayload(naturalRoute),
      matched_signals: ['conversational_ideation'],
      blocked_candidates: [],
      supporting_routes: supportingRoutes(naturalRoute),
      enforcement: 'observe',
      natural_route: naturalRoute
    });
  }

  return plainDecision(normalized, constraints, naturalRoute, []);
}

export function telegramIntentGateV2Mode(env: NodeJS.ProcessEnv = process.env): TelegramIntentGateV2Mode {
  const raw = (env.SPARK_TELEGRAM_INTENT_GATE_V2 || env.SPARK_INTENT_GATE_V2 || '').trim().toLowerCase();
  if (raw === 'off') return 'off';
  if (raw === 'shadow') return 'shadow';
  return 'enforce_safe';
}

export function isTelegramIntentGateV2SafeRoute(decision: TelegramIntentDecisionV2): boolean {
  return decision.enforcement === 'enforce_safe' && [
    'startup.answer_improvement_canary',
    'startup.proof_readout',
    'startup.founder_advice',
    'access.status',
    'access.help',
    'conversation.quoted_drafted_example_boundary'
  ].includes(decision.route);
}

export function shouldEnforceTelegramIntentGateV2(
  decision: TelegramIntentDecisionV2,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return telegramIntentGateV2Mode(env) === 'enforce_safe' && isTelegramIntentGateV2SafeRoute(decision);
}
