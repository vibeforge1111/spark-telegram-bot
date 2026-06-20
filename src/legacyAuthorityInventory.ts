import {
  createHarnessCoreEvidenceRef,
  createHarnessCoreLegacyAuthorityInventory,
  createHarnessCoreLegacyAuthorityPlane,
  createHarnessCoreTraceRef,
  type HarnessCoreEvidenceKind,
  type LegacyAuthorityInventoryV1,
  type LegacyAuthorityPlaneType,
  type LegacyAuthorityPlaneV1,
  type LegacyAuthorityRisk
} from '@spark/harness-core';

const OWNER_REPO = 'spark-telegram-bot';

function evidence(id: string, kind: HarnessCoreEvidenceKind, summary: string, confidence = 0.95) {
  return createHarnessCoreEvidenceRef({
    id,
    kind,
    source: OWNER_REPO,
    summary,
    confidence,
    trace_refs: [
      createHarnessCoreTraceRef({
        id: `${id}:trace`,
        summary
      })
    ]
  });
}

function evidenceOnlyPlane(input: {
  id: string;
  plane_type: LegacyAuthorityPlaneType;
  source_path: string;
  summary: string;
  kind?: HarnessCoreEvidenceKind;
}): LegacyAuthorityPlaneV1 {
  return createHarnessCoreLegacyAuthorityPlane({
    id: input.id,
    owner_repo: OWNER_REPO,
    surface: 'telegram',
    plane_type: input.plane_type,
    source_path: input.source_path,
    summary: input.summary,
    authority_risk: {},
    disposition: 'evidence_adapter',
    evidence_only: true,
    evidence: [evidence(`${input.id}:evidence`, input.kind || 'route_candidate', input.summary)]
  });
}

function consumerPlane(input: {
  id: string;
  plane_type: LegacyAuthorityPlaneType;
  source_path: string;
  summary: string;
  authority_risk: Partial<LegacyAuthorityRisk>;
  kind?: HarnessCoreEvidenceKind;
}): LegacyAuthorityPlaneV1 {
  return createHarnessCoreLegacyAuthorityPlane({
    id: input.id,
    owner_repo: OWNER_REPO,
    surface: 'telegram',
    plane_type: input.plane_type,
    source_path: input.source_path,
    summary: input.summary,
    authority_risk: input.authority_risk,
    disposition: 'canonical_consumer',
    governor_required: true,
    consumer_of_governor: true,
    ledger_required: true,
    evidence: [evidence(`${input.id}:consumer`, input.kind || 'policy', input.summary)]
  });
}

function quarantinedPlane(input: {
  id: string;
  plane_type: LegacyAuthorityPlaneType;
  source_path: string;
  summary: string;
  kind?: HarnessCoreEvidenceKind;
}): LegacyAuthorityPlaneV1 {
  return createHarnessCoreLegacyAuthorityPlane({
    id: input.id,
    owner_repo: OWNER_REPO,
    surface: 'telegram',
    plane_type: input.plane_type,
    source_path: input.source_path,
    summary: input.summary,
    authority_risk: {},
    disposition: 'quarantined',
    evidence: [evidence(`${input.id}:quarantined`, input.kind || 'surface_signal', input.summary, 0.8)]
  });
}

export function buildTelegramLegacyAuthorityPlanes(): LegacyAuthorityPlaneV1[] {
  return [
    evidenceOnlyPlane({
      id: 'telegram-intent-gate-v2',
      plane_type: 'keyword_detector',
      source_path: 'src/telegramIntentGate.ts',
      summary: 'Intent Gate V2 parses constraints and candidate routes only; it does not execute actions without Harness Core authority.'
    }),
    evidenceOnlyPlane({
      id: 'telegram-natural-route-decision',
      plane_type: 'regex_router',
      source_path: 'src/naturalRouteDecision.ts',
      summary: 'Natural route decision helpers are demoted to route evidence and blocked candidates for the TurnIntent envelope.'
    }),
    evidenceOnlyPlane({
      id: 'telegram-build-intent-parser',
      plane_type: 'keyword_detector',
      source_path: 'src/buildIntent.ts',
      summary: 'Build intent parsing produces structured evidence for candidate project requests, not local launch authority.'
    }),
    evidenceOnlyPlane({
      id: 'telegram-conversation-intent-extractors',
      plane_type: 'keyword_detector',
      source_path: 'src/conversationIntent.ts',
      summary: 'Conversation intent extractors supply memory, wiki, startup, schedule, and creator signals as evidence for the canonical envelope.'
    }),
    consumerPlane({
      id: 'telegram-turn-intent-v1-envelope',
      plane_type: 'machine_origin_policy',
      source_path: 'src/harnessContract.ts',
      summary: 'The older Telegram TurnIntent envelope and tool policy are retained only as inputs to VNext envelope and Harness Core authorization.',
      authority_risk: { can_route_turns: true }
    }),
    consumerPlane({
      id: 'telegram-action-authority',
      plane_type: 'local_dispatcher',
      source_path: 'src/telegramActionAuthority.ts',
      summary: 'Telegram action authority is the single consumer wrapper that submits route evidence to the canonical Harness Core package, consumes Governor decisions, verifies the consumer binding, and records the ledger.',
      authority_risk: {
        can_execute: true,
        can_mutate_state: true,
        can_route_turns: true,
        can_write_memory: true,
        can_launch_mission: true,
        can_call_network: true,
        can_publish: true,
        can_schedule: true
      }
    }),
    consumerPlane({
      id: 'telegram-command-authority',
      plane_type: 'local_dispatcher',
      source_path: 'src/telegramCommandAuthority.ts',
      summary: 'Slash-command action routing is converted to a Harness Core consumer and must pass through the same Governor wrapper.',
      authority_risk: {
        can_execute: true,
        can_mutate_state: true,
        can_route_turns: true,
        can_write_memory: true,
        can_launch_mission: true,
        can_call_network: true,
        can_publish: true,
        can_schedule: true
      }
    }),
    consumerPlane({
      id: 'telegram-media-authority',
      plane_type: 'tool_launcher',
      source_path: 'src/telegramMediaAuthority.ts',
      summary: 'Image and voice ingestion are converted to Harness Core consumers before analysis, transcription, or external model/tool use.',
      authority_risk: {
        can_execute: true,
        can_route_turns: true,
        can_call_network: true
      }
    }),
    consumerPlane({
      id: 'telegram-index-natural-dispatch',
      plane_type: 'local_dispatcher',
      source_path: 'src/index.ts',
      summary: 'Top-level Telegram natural-language dispatch paths are required to use telegramActionAuthorityDecision or telegramBranchActionAuthorityDecision before side effects.',
      authority_risk: {
        can_execute: true,
        can_mutate_state: true,
        can_route_turns: true,
        can_write_memory: true,
        can_launch_mission: true,
        can_call_network: true,
        can_publish: true,
        can_schedule: true
      }
    }),
    consumerPlane({
      id: 'telegram-spawner-creator-bridge',
      plane_type: 'mission_helper',
      source_path: 'src/spawner.ts',
      summary: 'Spawner, creator mission, validation, and execution API calls accept/preserve Governor executionAuthority and ledger evidence.',
      authority_risk: {
        can_execute: true,
        can_mutate_state: true,
        can_launch_mission: true,
        can_call_network: true,
        can_publish: true
      }
    }),
    consumerPlane({
      id: 'telegram-builder-bridge',
      plane_type: 'tool_launcher',
      source_path: 'src/builderBridge.ts',
      summary: 'Builder bridge calls are downstream tool consumers; current-state memory and build/PRD bridges remain subordinate to fresh Telegram authority.',
      authority_risk: {
        can_execute: true,
        can_mutate_state: true,
        can_call_network: true
      }
    }),
    consumerPlane({
      id: 'telegram-memory-wiki-bridge',
      plane_type: 'memory_override',
      source_path: 'src/index.ts',
      summary: 'Memory write/delete and Spark Wiki promote/query paths are bound behind Telegram authority so memory cannot become fresh-turn instruction authority.',
      authority_risk: {
        can_execute: true,
        can_mutate_state: true,
        can_write_memory: true,
        can_route_turns: true
      }
    }),
    consumerPlane({
      id: 'telegram-schedule-access-operator',
      plane_type: 'schedule_trigger',
      source_path: 'src/index.ts',
      summary: 'Schedule, access, and bounded operator actions are command or branch consumers of Harness Core authorization and ledger evidence.',
      authority_risk: {
        can_execute: true,
        can_mutate_state: true,
        can_route_turns: true,
        can_schedule: true
      }
    }),
    consumerPlane({
      id: 'telegram-recursive-sparkqa-startup',
      plane_type: 'tool_launcher',
      source_path: 'src/index.ts',
      summary: 'Recursive, Spark QA, startup canary, and self-improvement routes can propose work but must execute only as Harness Core consumers.',
      authority_risk: {
        can_execute: true,
        can_mutate_state: true,
        can_route_turns: true,
        can_launch_mission: true,
        can_call_network: true
      }
    }),
    consumerPlane({
      id: 'telegram-mission-relay-webhook',
      plane_type: 'machine_origin_policy',
      source_path: 'src/missionRelay.ts',
      summary: 'The /spawner-events mission relay webhook accepts machine-origin Spawner callbacks only when they bind to a mission registered by a governed dispatch (missionId plus registered requestId/traceRef when present); unbound events are refused fail-closed and each accepted notification is recorded in the Harness Core tool ledger against the dispatch Governor decision.',
      authority_risk: {
        can_execute: true,
        can_call_network: true
      },
      kind: 'policy'
    }),
    consumerPlane({
      id: 'telegram-pending-state-followups',
      plane_type: 'pending_state_helper',
      source_path: 'src/index.ts',
      summary: 'Pending build/domain-chip follow-ups are session-scoped evidence and can continue work only after branch authority creates a fresh envelope.',
      authority_risk: {
        can_execute: true,
        can_route_turns: true,
        can_launch_mission: true
      },
      kind: 'pending_state'
    }),
    quarantinedPlane({
      id: 'telegram-llm-surface-instructions',
      plane_type: 'template_reply',
      source_path: 'src/llm.ts',
      summary: 'LLM instructions describe conversational behavior and available routes, but do not grant tool or mutation authority.'
    })
  ];
}

export function buildTelegramLegacyAuthorityInventory(): LegacyAuthorityInventoryV1 {
  return createHarnessCoreLegacyAuthorityInventory({
    id: 'telegram-authority-inventory',
    owner_repo: OWNER_REPO,
    surfaces: ['telegram'],
    planes: buildTelegramLegacyAuthorityPlanes()
  });
}
