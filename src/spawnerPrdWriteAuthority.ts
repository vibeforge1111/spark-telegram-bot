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
