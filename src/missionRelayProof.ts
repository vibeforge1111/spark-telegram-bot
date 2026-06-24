import type { DeliverableRelayEvent, MissionSubscription } from './missionRelay';
import { buildTelegramDeliveryProofCapsule } from './telegramDeliveryProof';

function traceRefFromEvent(event: DeliverableRelayEvent): string | undefined {
  const value = event.data?.traceRef ?? event.data?.trace_ref;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function buildMissionRelayTraceContext(
  subscription: MissionSubscription,
  event: DeliverableRelayEvent,
  replyKind: string
): Record<string, unknown> {
  if (replyKind !== 'mission_completion') {
    return {
      route: 'mission_relay',
      command: 'mission_relay',
      replyKind,
      requestId: subscription.requestId,
      traceRef: subscription.traceRef || traceRefFromEvent(event),
      missionId: event.missionId
    };
  }
  const proofCapsule = buildTelegramDeliveryProofCapsule({
    turnRef: subscription.traceRef || subscription.requestId || event.missionId,
    route: 'spawner.run',
    owner: 'spark-telegram-bot',
    tool: 'spawner.run',
    mutationClass: 'launches_mission',
    executionStatus: 'completed',
    replyDelivered: true,
    replyShape: 'natural',
    authorityDecision: 'allowed',
    governorDecision: 'allow',
    reasonSummary: 'Telegram delivered the final mission completion relay with redacted Spawner proof continuity.',
    joins: {
      telegram: 'joined',
      spawner: 'joined'
    }
  });
  return {
    route: proofCapsule.route,
    command: 'spawner.run',
    replyKind,
    requestId: subscription.requestId,
    traceRef: subscription.traceRef || traceRefFromEvent(event),
    missionId: event.missionId,
    proofCapsule
  };
}
