import assert from 'node:assert/strict';
import {
  formatCreatorMissionStatusForTelegram,
  validateCreatorMissionStatusForTelegram,
  type CreatorMissionStatusPacket
} from '../src/creatorMissionStatus';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function packet(overrides: Partial<CreatorMissionStatusPacket> = {}): CreatorMissionStatusPacket {
  const base: CreatorMissionStatusPacket = {
    schema_version: 'adaptive_creator_loop.creator_mission_status.v1',
    mission_id: 'creator-mission-startup-yc',
    read_only: true,
    claim_boundary: 'read-only product adapter over canonical creator-system outputs',
    canonical: {
      verdict: 'ready_for_swarm_packet',
      stage_status: 'review_required',
      evidence_tier: 'transfer_supported',
      recommended_next_command: 'review Startup YC operator validation gates'
    },
    publication: {
      publish_mode: 'swarm_shared',
      swarm_shared_allowed: false,
      network_absorbable: false,
      missing_gates: ['multi_seed_validation', 'privacy_review']
    },
    blockers: [{ source: 'publication_gate', message: 'Network absorption is not approved.' }],
    next_actions: ['Keep publication local until network absorption gates are explicitly approved.'],
    surface_adapters: {
      builder: { may_mutate_state: false },
      telegram: {
        text: 'Creator mission `creator-mission-startup-yc` is `review_required`.',
        show_publication_warning: true,
        may_request_secret_paste: false
      },
      spawner: { may_execute: false },
      canvas: { may_edit_artifacts: false },
      kanban: { may_change_verdict: false }
    }
  };
  return { ...base, ...overrides };
}

test('formats creator mission status without hiding publication blockers', () => {
  const text = formatCreatorMissionStatusForTelegram(packet());

  assert.match(text, /review_required/);
  assert.match(text, /ready_for_swarm_packet/);
  assert.match(text, /transfer_supported/);
  assert.match(text, /network sharing is not approved yet/);
  assert.match(text, /publication_gate/);
  assert.match(text, /Keep publication local/);
});

test('rejects creator mission status packets that claim network absorption', () => {
  const unsafe = packet({
    publication: {
      ...packet().publication,
      network_absorbable: true
    }
  });

  assert.throws(() => validateCreatorMissionStatusForTelegram(unsafe), /network absorption/i);
});

test('rejects creator mission status packets that request secret paste', () => {
  const unsafe = packet({
    surface_adapters: {
      ...packet().surface_adapters,
      telegram: {
        may_request_secret_paste: true
      }
    }
  } as unknown as Partial<CreatorMissionStatusPacket>);

  assert.throws(() => validateCreatorMissionStatusForTelegram(unsafe), /secret paste/i);
});
