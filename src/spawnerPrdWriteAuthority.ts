import {
  createHarnessCoreActionEnvelopeVNext,
  createHarnessCoreAuthorizedGovernorDecision,
  type GovernorDecisionV1
} from '@spark/harness-core';
import { harnessExecutionAuthorityFailureReason } from './harnessExecutionAuthority';
import { signGovernorDecisionIfConfigured } from './governorSignature';

const TELEGRAM_BUILD_AUTHORITY = {
  toolName: 'spawner.run',
  ownerSystem: 'spawner-ui',
  actionType: 'launch_mission' as const
};

const SPAWNER_PRD_WRITE_AUTHORITY = {
  toolName: 'spawner.prd.write',
  ownerSystem: 'spawner-ui',
  actionType: 'edit_file' as const
};

const SPAWNER_DISPATCH_AUTHORITY = {
  toolName: 'spawner.dispatch',
  ownerSystem: 'spawner-ui',
  actionType: 'launch_mission' as const
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function actorIdRefFromGovernorDecision(value: unknown): string {
  if (!isRecord(value)) return 'telegram-human';
  const envelope = isRecord(value.envelope) ? value.envelope : {};
  const actor = isRecord(envelope.actor) ? envelope.actor : {};
  return stringField(actor.id_ref) || 'telegram-human';
}

function confidenceFromGovernorDecision(value: unknown): number {
  if (!isRecord(value)) return 0.95;
  const envelope = isRecord(value.envelope) ? value.envelope : {};
  const actionAuthority = isRecord(envelope.action_authority) ? envelope.action_authority : {};
  const confidence = actionAuthority.confidence;
  return typeof confidence === 'number' && confidence >= 0 && confidence <= 1 ? confidence : 0.95;
}

function traceIdFromGovernorDecision(value: unknown): string {
  if (!isRecord(value)) return '';
  const envelope = isRecord(value.envelope) ? value.envelope : {};
  const trace = isRecord(envelope.trace) ? envelope.trace : {};
  const rawTurnRef = isRecord(envelope.raw_turn_ref) ? envelope.raw_turn_ref : {};
  return stringField(trace.id) || stringField(rawTurnRef.id) || stringField(value.turn_id);
}

export function telegramBuildAuthorityFailureReason(value: unknown): string | null {
  return harnessExecutionAuthorityFailureReason(value, TELEGRAM_BUILD_AUTHORITY);
}

export function spawnerPrdWriteAuthorityFailureReason(value: unknown): string | null {
  return harnessExecutionAuthorityFailureReason(value, SPAWNER_PRD_WRITE_AUTHORITY);
}

export function spawnerDispatchAuthorityFailureReason(value: unknown): string | null {
  return harnessExecutionAuthorityFailureReason(value, SPAWNER_DISPATCH_AUTHORITY);
}

function requestIdBoundToAuthority(value: unknown, requestId: string): boolean {
  if (!isRecord(value)) return false;
  const envelope = isRecord(value.envelope) ? value.envelope : {};
  const proposedActions = Array.isArray(envelope.proposed_actions) ? envelope.proposed_actions : [];
  const expected = requestId.trim();
  if (!expected) return false;
  return proposedActions.some((action) => {
    if (!isRecord(action)) return false;
    const argsRef = isRecord(action.args_ref) ? action.args_ref : {};
    const pathOrUri = stringField(argsRef.path_or_uri);
    if (!pathOrUri) return false;
    const last = pathOrUri.split(/[\\/]/).pop() || '';
    try {
      return decodeURIComponent(last) === expected;
    } catch {
      return last === expected;
    }
  });
}

function authorityMentionsTarget(value: unknown, target: string): boolean {
  const expected = target.trim();
  if (!expected) return false;
  const seen = new Set<unknown>();
  const visit = (current: unknown): boolean => {
    if (typeof current === 'string') return current.includes(expected);
    if (!current || typeof current !== 'object' || seen.has(current)) return false;
    seen.add(current);
    if (Array.isArray(current)) return current.some(visit);
    return Object.values(current as Record<string, unknown>).some(visit);
  };
  return visit(value);
}

export function spawnerDispatchAuthorityBindingFailureReason(input: {
  authority: unknown;
  requestId: string;
  missionId: string;
}): string | null {
  const authorityReason = spawnerDispatchAuthorityFailureReason(input.authority);
  if (authorityReason) return authorityReason;
  if (!requestIdBoundToAuthority(input.authority, input.requestId)) {
    return 'dispatch_authority_request_id_mismatch';
  }
  if (!authorityMentionsTarget(input.authority, input.missionId)) {
    return 'dispatch_authority_mission_id_mismatch';
  }
  return null;
}

export function buildSpawnerPrdWriteExecutionAuthority(input: {
  telegramExecutionAuthority: unknown;
  requestId: string;
  projectName?: string | null;
  traceRef?: string | null;
}): GovernorDecisionV1 {
  const upstreamReason = telegramBuildAuthorityFailureReason(input.telegramExecutionAuthority);
  if (upstreamReason) {
    throw new Error(`Cannot derive Spawner PRD write authority from invalid Telegram build authority: ${upstreamReason}`);
  }

  const requestId = input.requestId.trim();
  const projectName = input.projectName?.trim();
  const upstreamTraceId = traceIdFromGovernorDecision(input.telegramExecutionAuthority);
  const envelope = createHarnessCoreActionEnvelopeVNext({
    surface: 'telegram',
    ownerSystem: 'spawner-ui',
    toolName: 'spawner.prd.write',
    mutationClass: 'writes_files',
    source: 'spark-telegram-bot/prd-bridge-consumer-binding',
    reason: [
      `Telegram build dispatch ${requestId} was authorized by fresh Harness Core user intent.`,
      'This downstream authority is scoped only to writing the matching Spawner PRD bridge request.',
      projectName ? `Project: ${projectName}.` : '',
      upstreamTraceId ? `Upstream Telegram Governor trace: ${upstreamTraceId}.` : ''
    ].filter(Boolean).join(' '),
    requestId,
    actorKind: 'human',
    actorIdRef: actorIdRefFromGovernorDecision(input.telegramExecutionAuthority),
    target: requestId,
    confidence: confidenceFromGovernorDecision(input.telegramExecutionAuthority),
    riskTier: 'medium'
  });

  const decision = signGovernorDecisionIfConfigured(createHarnessCoreAuthorizedGovernorDecision({
    envelope,
    tool_name: 'spawner.prd.write',
    restrictions: {
      network_allowed: false,
      write_allowed: true,
      publish_allowed: false
    },
    reply_instruction: 'Authorize only the matching Spawner PRD bridge write; do not grant mission execution, publication, registry movement, or memory writes.'
  }));
  const downstreamReason = spawnerPrdWriteAuthorityFailureReason(decision);
  if (downstreamReason) {
    throw new Error(`Derived Spawner PRD write authority failed consumer verification: ${downstreamReason}`);
  }
  return decision;
}

export function buildSpawnerDispatchExecutionAuthority(input: {
  telegramExecutionAuthority: unknown;
  requestId: string;
  missionId: string;
  projectName?: string | null;
  traceRef?: string | null;
}): GovernorDecisionV1 {
  const upstreamReason = telegramBuildAuthorityFailureReason(input.telegramExecutionAuthority);
  if (upstreamReason) {
    throw new Error(`Cannot derive Spawner dispatch authority from invalid Telegram build authority: ${upstreamReason}`);
  }

  const requestId = input.requestId.trim();
  const missionId = input.missionId.trim();
  const projectName = input.projectName?.trim();
  const upstreamTraceId = traceIdFromGovernorDecision(input.telegramExecutionAuthority);
  const envelope = createHarnessCoreActionEnvelopeVNext({
    surface: 'telegram',
    ownerSystem: 'spawner-ui',
    toolName: 'spawner.dispatch',
    mutationClass: 'launches_mission',
    source: 'spark-telegram-bot/prd-bridge-dispatch-consumer-binding',
    reason: [
      `Telegram build dispatch ${requestId} was authorized by fresh Harness Core user intent.`,
      'This downstream authority is scoped only to launching the matching Spawner mission after PRD/canvas validation.',
      projectName ? `Project: ${projectName}.` : '',
      upstreamTraceId ? `Upstream Telegram Governor trace: ${upstreamTraceId}.` : ''
    ].filter(Boolean).join(' '),
    requestId,
    actorKind: 'human',
    actorIdRef: actorIdRefFromGovernorDecision(input.telegramExecutionAuthority),
    target: missionId || requestId,
    confidence: confidenceFromGovernorDecision(input.telegramExecutionAuthority),
    riskTier: 'medium'
  });

  const decision = signGovernorDecisionIfConfigured(createHarnessCoreAuthorizedGovernorDecision({
    envelope,
    tool_name: 'spawner.dispatch',
    restrictions: {
      network_allowed: true,
      write_allowed: true,
      publish_allowed: false
    },
    reply_instruction: 'Authorize only the matching local Spawner mission dispatch; do not grant publication, registry movement, installer changes, or memory writes.'
  }));
  const downstreamReason = spawnerDispatchAuthorityFailureReason(decision);
  if (downstreamReason) {
    throw new Error(`Derived Spawner dispatch authority failed consumer verification: ${downstreamReason}`);
  }
  return decision;
}
