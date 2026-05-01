export const CREATOR_MISSION_STATUS_SCHEMA_VERSION = 'adaptive_creator_loop.creator_mission_status.v1';

export type CreatorMissionVerdict =
  | 'prototype'
  | 'ready_for_baseline'
  | 'ready_for_swarm_packet'
  | 'blocked';

export type CreatorMissionStageStatus =
  | 'prototype'
  | 'ready_for_baseline'
  | 'review_required'
  | 'blocked'
  | 'unknown';

export type CreatorMissionEvidenceTier = 'local_only' | 'candidate_review' | 'transfer_supported';
export type CreatorMissionPublishMode = 'local_only' | 'github_pr' | 'swarm_shared';

export interface CreatorMissionStatusPacket {
  schema_version: typeof CREATOR_MISSION_STATUS_SCHEMA_VERSION;
  mission_id: string;
  read_only: true;
  claim_boundary: string;
  canonical: {
    verdict: CreatorMissionVerdict;
    stage_status: CreatorMissionStageStatus;
    evidence_tier: CreatorMissionEvidenceTier;
    recommended_next_command?: string | null;
  };
  publication: {
    publish_mode: CreatorMissionPublishMode;
    swarm_shared_allowed: boolean;
    network_absorbable: boolean;
    missing_gates: string[];
  };
  blockers: Array<Record<string, unknown>>;
  next_actions?: string[];
  surface_adapters: {
    telegram: {
      text?: string;
      show_publication_warning?: boolean;
      may_request_secret_paste: false;
      [key: string]: unknown;
    };
    builder: Record<string, unknown>;
    spawner: Record<string, unknown>;
    canvas: Record<string, unknown>;
    kanban: Record<string, unknown>;
  };
}

export function validateCreatorMissionStatusForTelegram(value: unknown): CreatorMissionStatusPacket {
  const packet = requireRecord(value, 'creator mission status');
  if (packet.schema_version !== CREATOR_MISSION_STATUS_SCHEMA_VERSION) {
    throw new Error(`Unexpected creator mission status schema: ${String(packet.schema_version)}`);
  }
  if (packet.read_only !== true) {
    throw new Error('Creator mission status must be read-only');
  }
  if (!nonEmptyString(packet.mission_id)) {
    throw new Error('Creator mission status missing mission_id');
  }

  const canonical = requireRecord(packet.canonical, 'creator mission canonical');
  requireAllowed(canonical.verdict, ['prototype', 'ready_for_baseline', 'ready_for_swarm_packet', 'blocked'], 'verdict');
  requireAllowed(canonical.stage_status, ['prototype', 'ready_for_baseline', 'review_required', 'blocked', 'unknown'], 'stage status');
  requireAllowed(canonical.evidence_tier, ['local_only', 'candidate_review', 'transfer_supported'], 'evidence tier');

  const publication = requireRecord(packet.publication, 'creator mission publication');
  requireAllowed(publication.publish_mode, ['local_only', 'github_pr', 'swarm_shared'], 'publish mode');
  if (typeof publication.swarm_shared_allowed !== 'boolean') {
    throw new Error('Creator mission publication missing swarm_shared_allowed boolean');
  }
  if (publication.network_absorbable !== false) {
    throw new Error('Telegram must not accept network absorption from read-only creator mission packets');
  }
  if (!Array.isArray(publication.missing_gates)) {
    throw new Error('Creator mission publication missing gate blockers');
  }

  if (!Array.isArray(packet.blockers)) {
    throw new Error('Creator mission status missing blockers array');
  }
  const adapters = requireRecord(packet.surface_adapters, 'creator mission surface adapters');
  for (const surface of ['builder', 'telegram', 'spawner', 'canvas', 'kanban']) {
    requireRecord(adapters[surface], `${surface} surface adapter`);
  }
  const telegram = adapters.telegram as Record<string, unknown>;
  if (telegram.may_request_secret_paste !== false) {
    throw new Error('Telegram creator mission adapter must not request secret paste');
  }

  return packet as unknown as CreatorMissionStatusPacket;
}

export function formatCreatorMissionStatusForTelegram(value: unknown): string {
  const packet = validateCreatorMissionStatusForTelegram(value);
  const adapterText = packet.surface_adapters.telegram.text;
  const lines = [
    adapterText && adapterText.trim() ? adapterText.trim() : `Creator mission ${packet.mission_id} is ${packet.canonical.stage_status}.`,
    `Verdict: ${packet.canonical.verdict}.`,
    `Evidence tier: ${packet.canonical.evidence_tier}.`,
    publicationLine(packet),
  ];
  if (packet.blockers.length > 0) {
    lines.push(`Blockers: ${packet.blockers.map(blockerLabel).join(', ')}.`);
  }
  const next = packet.next_actions?.filter((action) => action.trim()).slice(0, 3) || [];
  if (next.length > 0) {
    lines.push('Next:', ...next.map((action) => `- ${action}`));
  }
  return lines.filter(Boolean).join('\n');
}

function publicationLine(packet: CreatorMissionStatusPacket): string {
  const publication = packet.publication;
  if (publication.publish_mode === 'swarm_shared' || publication.missing_gates.length > 0) {
    return 'Publication: network sharing is not approved yet.';
  }
  if (publication.publish_mode === 'github_pr') {
    return 'Publication: GitHub PR review path.';
  }
  return 'Publication: local only.';
}

function blockerLabel(blocker: Record<string, unknown>): string {
  const source = blocker.source;
  if (typeof source === 'string' && source.trim()) return source.trim();
  const message = blocker.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  return 'creator mission gate';
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireAllowed(value: unknown, allowed: string[], label: string): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`Unsupported ${label}: ${String(value)}`);
  }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
