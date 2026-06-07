import { randomUUID } from 'node:crypto';
import type { NaturalRouteOwnerSystem } from './naturalRouteDecision';
import type { TelegramIntentDecisionV2 } from './intentContract';

export type SparkHarnessSchema = 'spark.turn_intent.v1';
export type SparkHarnessSurface = 'telegram' | 'builder' | 'spawner' | 'swarm' | 'cli' | 'gateway' | 'voice';
export type SparkHarnessConversationKind = 'dm' | 'group' | 'channel' | 'command' | 'mission' | 'worker' | 'unknown';
export type SparkHarnessDirectiveMode =
  | 'execute'
  | 'answer'
  | 'plan'
  | 'inspect'
  | 'remember'
  | 'schedule'
  | 'clarify'
  | 'deny';
export type SparkHarnessConfidence = 'explicit' | 'contextual' | 'ambiguous' | 'blocked';
export type SparkHarnessMutationClass =
  | 'none'
  | 'read_only'
  | 'writes_memory'
  | 'writes_files'
  | 'launches_mission'
  | 'creates_schedule'
  | 'deletes_schedule'
  | 'creates_chip'
  | 'publishes'
  | 'external_network';
export type SparkHarnessNetworkPolicy = 'none' | 'local_only' | 'external_allowed';
export type SparkHarnessToolVerdict = 'allowed' | 'blocked';

export interface SparkHarnessUserRef {
  userRef: string;
  chatRef?: string;
  accessProfile: string;
}

export interface SparkHarnessTextRef {
  raw: string;
  normalized: string;
  language?: string;
}

export interface SparkHarnessDirective {
  mode: SparkHarnessDirectiveMode;
  noExecution: boolean;
  noPublish: boolean;
  localOnly: boolean;
  explanationOnly: boolean;
  quotedOrMetaLanguage: boolean;
}

export interface SparkHarnessIntentRef {
  kind: string;
  ownerSystem: NaturalRouteOwnerSystem | string;
  action: string | null;
  confidence: SparkHarnessConfidence;
  requiresConfirmation: boolean;
  source: 'slash' | 'explicit' | 'contextual' | 'pending' | 'memory' | 'arbiter';
}

export interface SparkHarnessIntentCandidate {
  kind: string;
  route: string;
  ownerSystem: NaturalRouteOwnerSystem | string;
  reason: string;
}

export interface SparkHarnessContextRefs {
  recentTurns: string[];
  pendingState: string | null;
  memoryRefs: string[];
  runtimeTruthRefs: string[];
  startupOperatorRefs: string[];
}

export interface RuntimeOwnershipV1 {
  runtimeId: string;
  channelOwner: string;
  modelLoopOwner: string;
  canonicalStateOwner: string;
  toolExecutionOwner: string;
  replyComposerOwner: string;
  handoffAllowedTo: string[];
  fallbackPolicy: 'answer_only' | 'clarify' | 'deny';
}

export interface SessionScopeV1 {
  sessionKey: string;
  surface: SparkHarnessSurface;
  conversationKind: SparkHarnessConversationKind;
  userRef: string;
  chatRef?: string;
  parentSessionKey?: string | null;
  childSessionKeys: string[];
  freshnessPolicy: 'fresh_turn_required' | 'session_continuity_allowed';
  memoryLoadPolicy: 'evidence_only' | 'disabled';
  pendingStateScope: 'same_session_only' | 'explicit_import_only';
}

export interface ToolPolicyV1 {
  allowedTools: string[];
  deniedTools: string[];
  enabledToolsets: string[];
  sandboxClass: 'none' | 'local' | 'workspace' | 'external';
  networkPolicy: SparkHarnessNetworkPolicy;
  elevatedAllowed: boolean;
  mutationClassesAllowed: SparkHarnessMutationClass[];
  requiresApprovalFor: SparkHarnessMutationClass[];
}

export interface LaneContractV1 {
  laneId: string;
  purpose: string;
  nonGoals: string[];
  owner: string;
  toolRiskClass: 'read_only' | 'local_mutation' | 'external_mutation';
  contextBudget: number;
  handoffRule: string;
  verifierRule: string;
  stopRule: string;
}

export interface ThreatDefenseV1 {
  userText: 'trusted';
  recalledMemory: 'trusted' | 'evidence_only' | 'blocked';
  toolOutput: 'trusted' | 'untrusted_but_usable' | 'blocked';
  webResearch: 'trusted' | 'untrusted_but_usable' | 'blocked';
  storedSkills: 'trusted' | 'evidence_only' | 'blocked';
  startupArtifacts: 'trusted' | 'evidence_only' | 'blocked';
  reasonCodes: string[];
}

export interface SparkHarnessExecutionPolicy {
  canMutateFiles: boolean;
  canLaunchMission: boolean;
  canWriteMemory: boolean;
  canCreateSchedule: boolean;
  canDeleteSchedule: boolean;
  canCreateChip: boolean;
  canPublish: boolean;
  canUseExternalNetwork: boolean;
}

export interface TurnIntentEnvelopeV1 {
  schema: SparkHarnessSchema;
  turnId: string;
  traceId: string;
  surface: SparkHarnessSurface;
  user: SparkHarnessUserRef;
  text: SparkHarnessTextRef;
  directive: SparkHarnessDirective;
  selectedIntent: SparkHarnessIntentRef;
  candidates: SparkHarnessIntentCandidate[];
  blockedCandidates: SparkHarnessIntentCandidate[];
  contextRefs: SparkHarnessContextRefs;
  runtimeOwnership: RuntimeOwnershipV1;
  sessionScope: SessionScopeV1;
  toolPolicy: ToolPolicyV1;
  laneContract?: LaneContractV1;
  threatDefense: ThreatDefenseV1;
  executionPolicy: SparkHarnessExecutionPolicy;
  consumedBy: string[];
}

export interface BuildTelegramTurnEnvelopeInput {
  text: string;
  decision: TelegramIntentDecisionV2;
  userRef: string;
  chatRef?: string;
  accessProfile?: string;
  conversationKind?: SparkHarnessConversationKind;
  recentTurns?: string[];
  pendingState?: string | null;
  memoryRefs?: string[];
  runtimeTruthRefs?: string[];
  startupOperatorRefs?: string[];
  turnId?: string;
  traceId?: string;
}

export interface ToolAuthorizationInput {
  toolName: string;
  ownerSystem: string;
  mutationClass: SparkHarnessMutationClass;
  publishes?: boolean;
  externalNetwork?: boolean;
}

export interface ToolAuthorizationResult {
  verdict: SparkHarnessToolVerdict;
  reasonCodes: string[];
}

function makeId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function confidence(decision: TelegramIntentDecisionV2): SparkHarnessConfidence {
  if (decision.confidence === 'weak') return 'ambiguous';
  return decision.confidence;
}

function sourceForDecision(decision: TelegramIntentDecisionV2): SparkHarnessIntentRef['source'] {
  if (decision.kind === 'slash_command') return 'slash';
  if (decision.kind === 'memory_recall' || decision.kind === 'memory_write') return 'memory';
  if (decision.confidence === 'contextual') return 'contextual';
  return 'explicit';
}

function routeLooksExternal(route: string): boolean {
  return /(?:research|web|publish|deploy|ship|external|x_post|media\.|voice\.command)/i.test(route);
}

function routeLooksMetaLanguage(decision: TelegramIntentDecisionV2, normalizedText = ''): boolean {
  const structuredMeta =
    decision.matched_signals.some((signal) => /meta|quoted|no_execution_boundary/i.test(signal)) ||
    decision.blocked_candidates.some((candidate) => /quoted|meta|\bword\b|\bwords\b/i.test(candidate.reason));
  if (structuredMeta) return true;
  if (decision.route === 'spawner.build' && decision.confidence === 'explicit') return false;
  return /\b(?:mentioning|just mentioning|only mentioning|thinking\s+about|keywords?|the\s+word|words?\s+alone|word\s+here|words\s+here|phrases?|quoted|qa\s+fixture|sample\s+text|old\s+mission\s+context|stale\s+context\s+trigger|route\s+history|pending\s+state|voice\s+(?:transcript|note)|transcripts?\s+must\s+become\s+fresh\s+intent|diagnostic\s+only|do\s+not\s+route|do\s+not\s+use\s+external\s+network|what\s+policy\s+would\s+be\s+required|no\s+tool\s+call|not a request|not an instruction|not a command)\b/i.test(normalizedText);
}

function modeForDecision(
  decision: TelegramIntentDecisionV2,
  options: { noExecution?: boolean } = {}
): SparkHarnessDirectiveMode {
  const noExecution = options.noExecution ?? decision.constraints.noExecution;
  if (decision.confidence === 'blocked' || decision.enforcement === 'blocked') return 'deny';
  if (noExecution) return 'answer';
  if (decision.action === 'answer' || decision.action === 'plain_chat' || decision.route === 'plain_chat') return 'answer';
  if (decision.route === 'memory.doctor') return 'inspect';
  if (/memory\.write/.test(decision.route)) return 'remember';
  if (/schedule/.test(decision.route)) return 'schedule';
  if (/diagnostic|status|proof|inventory|query|recall/.test(decision.route)) return 'inspect';
  if (/ideation|advisor|advice|plan/.test(decision.route)) return 'plan';
  return 'execute';
}

function executionPolicyForDecision(
  decision: TelegramIntentDecisionV2,
  options: { noExecutionBoundary?: boolean } = {}
): SparkHarnessExecutionPolicy {
  const noExecutionBoundary = options.noExecutionBoundary ?? false;
  const noExecution = (options.noExecutionBoundary ?? decision.constraints.noExecution) || decision.enforcement === 'blocked';
  const route = decision.route;
  const canPublish = !decision.constraints.noPublish && !decision.constraints.localOnly;
  const localMutationRoute = /(?:build|spawner|creator|domain_chip|canvas|prd|operator\.safe_action|diagnostics\.scan|spark\.self_improvement|spark\.process|spark\.reflect|spark_wiki\.promote|spark\.wiki|access\.change|mission_updates\.preference|model\.switch|voice\.command|sparkqa\.|recursive\.)/.test(route);
  const fileMutationBlocked = decision.payload?.noFileMutation === true ||
    decision.matched_signals.includes('explicit_spawner_no_edit_mission');
  const routeProbeExternalNetwork = route === 'route.probe' && decision.payload?.externalNetwork === true;

  return {
    canMutateFiles: !noExecution && !fileMutationBlocked && localMutationRoute,
    canLaunchMission: !noExecution && /(?:spawner|mission|creator|domain_chip|recursive\.start|startup\.answer_improvement_canary|natural_run|external_research)/.test(route),
    canWriteMemory: !noExecution && (route === 'memory.write' || route === 'memory.delete' || route === 'spark_wiki.promote' || route === 'spark.wiki' || route === 'spark.process' || route === 'spark.reflect' || route === 'route.probe'),
    canCreateSchedule: !noExecution && /schedule\.create/.test(route),
    canDeleteSchedule: !noExecution && /schedule\.delete/.test(route),
    canCreateChip: !noExecution && /(?:domain_chip|creator)/.test(route),
    canPublish: !noExecution && canPublish && /(?:publish|deploy|ship)/.test(route),
    canUseExternalNetwork: !noExecution && !decision.constraints.localOnly && (routeLooksExternal(route) || routeProbeExternalNetwork || route === 'natural_run')
  };
}

function mutationClassesForPolicy(policy: SparkHarnessExecutionPolicy): SparkHarnessMutationClass[] {
  const classes: SparkHarnessMutationClass[] = ['none', 'read_only'];
  if (policy.canWriteMemory) classes.push('writes_memory');
  if (policy.canMutateFiles) classes.push('writes_files');
  if (policy.canLaunchMission) classes.push('launches_mission');
  if (policy.canCreateSchedule) classes.push('creates_schedule');
  if (policy.canDeleteSchedule) classes.push('deletes_schedule');
  if (policy.canCreateChip) classes.push('creates_chip');
  if (policy.canPublish) classes.push('publishes');
  if (policy.canUseExternalNetwork) classes.push('external_network');
  return classes;
}

function allowedToolsForDecision(decision: TelegramIntentDecisionV2, policy: SparkHarnessExecutionPolicy): string[] {
  const tools = ['answer.compose'];
  if (policy.canWriteMemory) tools.push('memory.write');
  if (decision.route === 'memory.delete') tools.push('memory.delete');
  if (decision.route === 'memory.recall') tools.push('memory.recall');
  if (decision.route === 'memory.doctor') tools.push('memory.diagnose', 'builder.telegram_bridge');
  if (/spark_wiki/.test(decision.route)) tools.push('spark_wiki.query');
  if (decision.route === 'spark_wiki.promote' || decision.route === 'spark.wiki') tools.push('spark_wiki.promote');
  if (/access/.test(decision.route)) tools.push('access.status');
  if (decision.route === 'access.help') tools.push('access.help');
  if (decision.route === 'access.change') tools.push('access.change');
  if (decision.route === 'operator.safe_action') tools.push('operator.safe_action');
  if (decision.route === 'route.probe') tools.push('route.probe', 'builder.telegram_bridge');
  if (decision.route === 'diagnostics.scan') tools.push('diagnostics.scan');
  if (decision.route === 'diagnostics.followup_test') tools.push('diagnostics.followup_test');
  if (decision.route === 'spark.read_only_state') tools.push('spark.read_only_state');
  if (decision.route === 'spark.self_improvement') tools.push('spark.self_improvement');
  if (decision.route === 'spark.process') tools.push('spark.process_queue');
  if (decision.route === 'spark.reflect') tools.push('spark.reflect');
  if (decision.route === 'mission_updates.preference') tools.push('mission_updates.preference');
  if (decision.route === 'model.switch') tools.push('model.switch', 'model.status');
  if (decision.route === 'media.image') tools.push('telegram.media.image', 'builder.telegram_bridge');
  if (decision.route === 'media.voice') tools.push('telegram.media.voice', 'builder.telegram_bridge');
  if (decision.route === 'voice.command') {
    tools.push(
      'voice.command',
      'voice.status',
      'voice.speak',
      'voice.onboard',
      'voice.install',
      'voice.transcribe',
      'builder.telegram_bridge'
    );
  }
  if (/^sparkqa\./.test(decision.route)) tools.push(decision.route);
  if (decision.route === 'creator.mission') {
    tools.push(
      'creator.mission.create',
      'spawner.dispatch',
      'spawner.creator_mission',
      'spawner.creator_mission.status',
      'spawner.creator_mission.validate',
      'spawner.creator_mission.run'
    );
  }
  if (/^recursive\./.test(decision.route)) {
    tools.push(
      'recursive.loop',
      'recursive.propose',
      'recursive.sync',
      'recursive.package',
      'recursive.promote',
      'recursive.canvas',
      'recursive.decision',
      'recursive.sessions',
      'recursive.paths',
      'recursive.session',
      'recursive.status',
      'recursive.benchmark',
      'recursive.compare',
      'recursive.evidence',
      'recursive.report',
      'recursive.review',
      'recursive.trace'
    );
  }
  if (decision.action === 'spawner.board_read' || decision.route === 'spawner.board') tools.push('spawner.board');
  if (/^local_service\./.test(decision.route) || decision.route === 'spawner.local_service') tools.push('spawner.local_service');
  if (decision.route === 'local_workspace.inspect') tools.push('local_workspace.inspect');
  if (decision.route === 'spawner.mission_control') tools.push('spawner.mission_control');
  if (policy.canLaunchMission) tools.push('spawner.run');
  if (decision.route === 'natural_run') tools.push('provider.run');
  if (decision.route === 'pending_task.recovery') tools.push('pending_task.recovery');
  if (policy.canMutateFiles) tools.push('spawner.files');
  if (policy.canCreateChip) tools.push('domain_chip.create');
  if (policy.canCreateSchedule) tools.push('schedule.create');
  if (policy.canDeleteSchedule) tools.push('schedule.delete');
  if (policy.canPublish) tools.push('publish.run');
  if (policy.canUseExternalNetwork) tools.push('external.fetch');
  return Array.from(new Set(tools));
}

function deniedToolsForDecision(
  decision: TelegramIntentDecisionV2,
  policy: SparkHarnessExecutionPolicy,
  options: { noExecutionBoundary?: boolean } = {}
): string[] {
  const denied = new Set<string>();
  const noExecutionBoundary = options.noExecutionBoundary ?? decision.constraints.noExecution;
  if (noExecutionBoundary || decision.enforcement === 'blocked') {
    [
      'spawner.run',
      'spawner.files',
      'spawner.mission_control',
      'domain_chip.create',
      'schedule.create',
      'schedule.delete',
      'publish.run',
      'external.fetch',
      'provider.run',
      'memory.write',
      'memory.delete',
      'access.change',
      'operator.safe_action',
      'route.probe',
      'browser.use',
      'computer.use',
      'diagnostics.scan',
      'spark.self_improvement',
      'spark.process_queue',
      'spark.reflect',
      'spark_wiki.promote',
      'model.switch',
      'telegram.media.image',
      'telegram.media.voice',
      'voice.command',
      'voice.status',
      'voice.speak',
      'voice.onboard',
      'voice.install',
      'voice.transcribe',
      'builder.telegram_bridge',
      'mission_updates.preference',
      'sparkqa.run',
      'sparkqa.benchmark',
      'sparkqa.pause',
      'creator.mission.create',
      'spawner.dispatch',
      'spawner.creator_mission',
      'spawner.creator_mission.validate',
      'spawner.creator_mission.run',
      'recursive.loop',
      'recursive.propose',
      'recursive.sync',
      'recursive.package',
      'recursive.promote',
      'recursive.canvas',
      'recursive.decision'
    ].forEach((tool) => denied.add(tool));
  }
  if (!policy.canPublish) denied.add('publish.run');
  if (!policy.canUseExternalNetwork) denied.add('external.fetch');
  if (!policy.canUseExternalNetwork) denied.add('provider.run');
  if (!policy.canCreateSchedule) denied.add('schedule.create');
  if (!policy.canDeleteSchedule) denied.add('schedule.delete');
  return Array.from(denied);
}

function candidateFromDecision(decision: TelegramIntentDecisionV2): SparkHarnessIntentCandidate {
  return {
    kind: decision.kind,
    route: decision.route,
    ownerSystem: decision.owner_system,
    reason: decision.matched_signals.join(', ') || 'selected telegram intent'
  };
}

function defaultRuntimeOwnership(): RuntimeOwnershipV1 {
  return {
    runtimeId: 'spark-harness.telegram.v1',
    channelOwner: 'spark-telegram-bot',
    modelLoopOwner: 'spark-telegram-bot',
    canonicalStateOwner: 'spark-telegram-bot',
    toolExecutionOwner: 'selected-owner',
    replyComposerOwner: 'spark-telegram-bot',
    handoffAllowedTo: ['spark-intelligence-builder', 'spawner-ui', 'domain-chip-memory', 'spark-cli'],
    fallbackPolicy: 'answer_only'
  };
}

function defaultThreatDefense(
  decision: TelegramIntentDecisionV2,
  options: { noExecutionBoundary?: boolean; scopedNoExecutionBoundary?: boolean } = {}
): ThreatDefenseV1 {
  const reasonCodes = ['fresh_user_turn_is_authority'];
  const noExecutionBoundary = options.noExecutionBoundary ?? decision.constraints.noExecution;
  if (noExecutionBoundary) reasonCodes.push('no_execution_boundary');
  if (options.scopedNoExecutionBoundary) reasonCodes.push('scoped_no_execution_boundary');
  if (decision.constraints.localOnly) reasonCodes.push('local_only_boundary');
  if (routeLooksMetaLanguage(decision)) reasonCodes.push('meta_language_boundary');
  return {
    userText: 'trusted',
    recalledMemory: 'evidence_only',
    toolOutput: 'untrusted_but_usable',
    webResearch: 'untrusted_but_usable',
    storedSkills: 'evidence_only',
    startupArtifacts: 'evidence_only',
    reasonCodes
  };
}

function isScopedMemoryWriteWithNegativeConstraints(decision: TelegramIntentDecisionV2, normalizedText: string): boolean {
  if (!decision.constraints.noExecution) return false;
  if (decision.enforcement === 'blocked') return false;
  if (decision.kind !== 'memory_write' && decision.route !== 'memory.write' && decision.route !== 'spark_wiki.promote' && decision.route !== 'spark.wiki') {
    return false;
  }
  if (routeLooksMetaLanguage(decision)) return false;
  const hasExplicitWrite = /\b(?:owner\s+approves|approved|approve)\b.{0,80}\b(?:memory\s+write|kb\s+note|memory\s+note|save|store|remember)\b/.test(normalizedText) ||
    /\bexactly\s+one\s+(?:memory\s+write|kb\s+note|memory\s+note)\b/.test(normalizedText) ||
    /\b(?:save|store|remember)\s+this\s+exact\s+(?:kb\s+)?(?:memory\s+)?note\b/.test(normalizedText);
  const hasScopedNegative = /\b(?:do\s+not|don't|dont|no\s+need\s+to)\s+(?:start|run|launch|create|change|publish|merge|ship|deploy|use|open|record|send)\b/.test(normalizedText);
  return hasExplicitWrite && hasScopedNegative;
}

export function buildTelegramTurnIntentEnvelope(input: BuildTelegramTurnEnvelopeInput): TurnIntentEnvelopeV1 {
  const normalized = normalizeText(input.text);
  const quotedOrMetaLanguage = routeLooksMetaLanguage(input.decision, normalized);
  const scopedNoExecutionBoundary = isScopedMemoryWriteWithNegativeConstraints(input.decision, normalized);
  const noExecution = (input.decision.constraints.noExecution && !scopedNoExecutionBoundary) || quotedOrMetaLanguage;
  const executionPolicy = executionPolicyForDecision(input.decision, { noExecutionBoundary: noExecution });
  const mutationClassesAllowed = mutationClassesForPolicy(executionPolicy);
  const sessionKey = [
    'telegram',
    input.conversationKind || 'unknown',
    input.chatRef || 'chat:unknown',
    input.userRef || 'user:unknown'
  ].join(':');

  return {
    schema: 'spark.turn_intent.v1',
    turnId: input.turnId || makeId('turn'),
    traceId: input.traceId || makeId('trace'),
    surface: 'telegram',
    user: {
      userRef: input.userRef,
      chatRef: input.chatRef,
      accessProfile: input.accessProfile || 'unknown'
    },
    text: {
      raw: input.text,
      normalized
    },
    directive: {
      mode: modeForDecision(input.decision, { noExecution }),
      noExecution,
      noPublish: input.decision.constraints.noPublish,
      localOnly: input.decision.constraints.localOnly,
      explanationOnly: noExecution || /(?:explain only|just explain|answer only)/i.test(normalized),
      quotedOrMetaLanguage
    },
    selectedIntent: {
      kind: input.decision.kind,
      ownerSystem: input.decision.owner_system,
      action: input.decision.action || null,
      confidence: confidence(input.decision),
      requiresConfirmation: Boolean(input.decision.natural_route?.requires_confirmation),
      source: sourceForDecision(input.decision)
    },
    candidates: [candidateFromDecision(input.decision)],
    blockedCandidates: input.decision.blocked_candidates.map((blocked) => ({
      kind: blocked.kind,
      route: blocked.route,
      ownerSystem: blocked.owner_system,
      reason: blocked.reason
    })),
    contextRefs: {
      recentTurns: input.recentTurns || [],
      pendingState: input.pendingState || null,
      memoryRefs: input.memoryRefs || [],
      runtimeTruthRefs: input.runtimeTruthRefs || [],
      startupOperatorRefs: input.startupOperatorRefs || []
    },
    runtimeOwnership: defaultRuntimeOwnership(),
    sessionScope: {
      sessionKey,
      surface: 'telegram',
      conversationKind: input.conversationKind || 'unknown',
      userRef: input.userRef,
      chatRef: input.chatRef,
      parentSessionKey: null,
      childSessionKeys: [],
      freshnessPolicy: 'fresh_turn_required',
      memoryLoadPolicy: 'evidence_only',
      pendingStateScope: 'same_session_only'
    },
    toolPolicy: {
      allowedTools: allowedToolsForDecision(input.decision, executionPolicy),
      deniedTools: deniedToolsForDecision(input.decision, executionPolicy, { noExecutionBoundary: noExecution }),
      enabledToolsets: ['telegram.reply', input.decision.owner_system].filter((value, index, arr) => value !== 'none' && arr.indexOf(value) === index),
      sandboxClass: 'local',
      networkPolicy: executionPolicy.canUseExternalNetwork ? 'external_allowed' : input.decision.constraints.localOnly ? 'local_only' : 'none',
      elevatedAllowed: false,
      mutationClassesAllowed,
      requiresApprovalFor: mutationClassesAllowed.filter((mutationClass) => !['none', 'read_only'].includes(mutationClass))
    },
    laneContract: input.decision.route.startsWith('startup.')
      ? {
          laneId: 'startup-operator',
          purpose: 'Benchmark-led startup operator improvement and advisory work.',
          nonGoals: ['publish without approval', 'treat memory as command authority'],
          owner: 'spark-intelligence-builder',
          toolRiskClass: executionPolicy.canLaunchMission ? 'local_mutation' : 'read_only',
          contextBudget: 16000,
          handoffRule: 'Only consume this lane when selected by the turn envelope.',
          verifierRule: 'Benchmark evidence must approve any promoted improvement.',
          stopRule: 'Stop on no-execution, local-only conflict, or failed promotion gate.'
        }
      : undefined,
    threatDefense: defaultThreatDefense(input.decision, { noExecutionBoundary: noExecution, scopedNoExecutionBoundary }),
    executionPolicy,
    consumedBy: []
  };
}

export function validateTurnIntentEnvelopeV1(value: unknown): value is TurnIntentEnvelopeV1 {
  const envelope = value as Partial<TurnIntentEnvelopeV1> | null;
  return Boolean(
    envelope &&
    envelope.schema === 'spark.turn_intent.v1' &&
    typeof envelope.turnId === 'string' &&
    typeof envelope.traceId === 'string' &&
    typeof envelope.surface === 'string' &&
    typeof envelope.user?.userRef === 'string' &&
    typeof envelope.text?.raw === 'string' &&
    typeof envelope.text?.normalized === 'string' &&
    typeof envelope.directive?.mode === 'string' &&
    typeof envelope.selectedIntent?.kind === 'string' &&
    typeof envelope.selectedIntent?.ownerSystem === 'string' &&
    Array.isArray(envelope.candidates) &&
    Array.isArray(envelope.blockedCandidates) &&
    typeof envelope.runtimeOwnership?.runtimeId === 'string' &&
    typeof envelope.sessionScope?.sessionKey === 'string' &&
    Array.isArray(envelope.toolPolicy?.allowedTools) &&
    Array.isArray(envelope.toolPolicy?.deniedTools) &&
    Array.isArray(envelope.toolPolicy?.mutationClassesAllowed) &&
    Array.isArray(envelope.threatDefense?.reasonCodes) &&
    Array.isArray(envelope.consumedBy)
  );
}

export function authorizeToolCallFromEnvelope(
  envelope: TurnIntentEnvelopeV1 | null | undefined,
  input: ToolAuthorizationInput
): ToolAuthorizationResult {
  const reasonCodes: string[] = [];
  if (!envelope || !validateTurnIntentEnvelopeV1(envelope)) {
    return { verdict: 'blocked', reasonCodes: ['missing_or_invalid_envelope'] };
  }
  if (envelope.directive.noExecution && input.mutationClass !== 'none' && input.mutationClass !== 'read_only') {
    reasonCodes.push('no_execution_boundary');
  }
  if (envelope.directive.noPublish && input.publishes) {
    reasonCodes.push('no_publish_boundary');
  }
  if (input.externalNetwork && !envelope.executionPolicy.canUseExternalNetwork) {
    reasonCodes.push('external_network_not_authorized');
  }
  if (envelope.toolPolicy.deniedTools.includes(input.toolName)) {
    reasonCodes.push('tool_denied_by_policy');
  }
  if (!envelope.toolPolicy.allowedTools.includes(input.toolName)) {
    reasonCodes.push('tool_not_allowed_by_policy');
  }
  if (!envelope.toolPolicy.mutationClassesAllowed.includes(input.mutationClass)) {
    reasonCodes.push('mutation_class_not_authorized');
  }
  if (input.ownerSystem !== envelope.selectedIntent.ownerSystem && input.ownerSystem !== envelope.runtimeOwnership.replyComposerOwner) {
    reasonCodes.push('owner_mismatch');
  }
  return {
    verdict: reasonCodes.length ? 'blocked' : 'allowed',
    reasonCodes
  };
}
