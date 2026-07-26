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
        text: 'Loop Engineering mission `creator-mission-startup-yc` is `review_required`.',
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

test('formats Loop Engineering status without hiding publication blockers', () => {
  const text = formatCreatorMissionStatusForTelegram(packet());

  assert.match(text, /review_required/);
  assert.match(text, /ready_for_swarm_packet/);
  assert.match(text, /transfer_supported/);
  assert.match(text, /network sharing is not approved yet/);
  assert.match(text, /publication_gate/);
  assert.match(text, /Keep publication local/);
  assert.doesNotMatch(text, /Creator mission/);
});

test('normalizes legacy upstream adapter text before Telegram renders it', () => {
  const text = formatCreatorMissionStatusForTelegram(packet({
    surface_adapters: {
      ...packet().surface_adapters,
      telegram: {
        text: 'Creator mission `creator-mission-startup-yc` is `review_required`. Creator plan is blocked by the creator mission gate.',
        show_publication_warning: true,
        may_request_secret_paste: false
      }
    }
  }));

  assert.match(text, /Loop Engineering mission `creator-mission-startup-yc` is `review_required`/);
  assert.match(text, /Loop Engineering plan is blocked by the Loop Engineering gate/);
  assert.doesNotMatch(text, /Creator mission|Creator plan|creator mission gate/);
});

test('normalizes creator-system wording across visible status details', () => {
  const text = formatCreatorMissionStatusForTelegram(packet({
    blockers: [{ message: 'The creator-system review packet is missing.' }],
    next_actions: ['Attach the creator-system benchmark review before promotion.'],
    surface_adapters: {
      ...packet().surface_adapters,
      telegram: {
        text: 'The creator-system status is review_required.',
        show_publication_warning: true,
        may_request_secret_paste: false
      }
    }
  }));

  assert.match(text, /Loop Engineering system status is review_required/);
  assert.match(text, /Loop Engineering system review packet is missing/);
  assert.match(text, /Attach the Loop Engineering system benchmark review/);
  assert.doesNotMatch(text, /creator-system|creator system|Creator system/);
});

test('formats Loop Engineering fallback when Telegram adapter text is absent', () => {
  const withoutAdapterText = packet({
    surface_adapters: {
      ...packet().surface_adapters,
      telegram: {
        show_publication_warning: true,
        may_request_secret_paste: false
      }
    }
  });
  const text = formatCreatorMissionStatusForTelegram(withoutAdapterText);

  assert.match(text, /Loop Engineering mission creator-mission-startup-yc is review_required/);
  assert.doesNotMatch(text, /Creator mission/);
});

test('rejects Loop Engineering status packets that claim network absorption', () => {
  const unsafe = packet({
    publication: {
      ...packet().publication,
      network_absorbable: true
    }
  });

  assert.throws(() => validateCreatorMissionStatusForTelegram(unsafe), /network absorption/i);
});

test('rejects Loop Engineering status packets that request secret paste', () => {
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

test('rejects unknown allowed-value fields with the allowed choices', () => {
  const unsafe = packet({
    canonical: {
      ...packet().canonical,
      verdict: 'shipped' as never
    }
  });

  assert.throws(
    () => validateCreatorMissionStatusForTelegram(unsafe),
    /Unsupported verdict: shipped\. Allowed values: prototype, ready_for_baseline, ready_for_swarm_packet, blocked\./
  );
});
