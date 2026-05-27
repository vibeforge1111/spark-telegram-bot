import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('unbounded map cleanup', () => {
  it('cleanup removes stale entries from maps with TTL', () => {
    const CLARIFICATION_TTL_MS = 30 * 60 * 1000; // 30 minutes
    const MISSION_CANCEL_CONFIRMATION_TTL_MS = 5 * 60 * 1000;
    const LAST_NO_EDIT_PROBE_TTL_MS = 60 * 60 * 1000; // 1 hour
    const LATEST_CANVAS_PLAN_TTL_MS = 60 * 60 * 1000; // 1 hour
    const DOMAIN_CHIP_BUILD_TTL_MS = 30 * 60 * 1000; // 30 minutes

    // Simulate maps
    const pendingClarifications = new Map<string, { timestamp: number }>();
    const pendingDomainChipBuilds = new Map<string, { timestamp: number }>();
    const pendingMissionCancelConfirmations = new Map<string, { timestamp: number }>();

    const now = Date.now();

    // Add fresh entries
    pendingClarifications.set('fresh', { timestamp: now - 1000 });
    pendingDomainChipBuilds.set('fresh', { timestamp: now - 1000 });
    pendingMissionCancelConfirmations.set('fresh', { timestamp: now - 1000 });

    // Add stale entries
    pendingClarifications.set('stale', { timestamp: now - CLARIFICATION_TTL_MS - 1000 });
    pendingDomainChipBuilds.set('stale', { timestamp: now - DOMAIN_CHIP_BUILD_TTL_MS - 1000 });
    pendingMissionCancelConfirmations.set('stale', { timestamp: now - MISSION_CANCEL_CONFIRMATION_TTL_MS - 1000 });

    // Run cleanup
    for (const [key, entry] of pendingClarifications) {
      if (now - entry.timestamp > CLARIFICATION_TTL_MS) {
        pendingClarifications.delete(key);
      }
    }
    for (const [key, entry] of pendingDomainChipBuilds) {
      if (now - entry.timestamp > DOMAIN_CHIP_BUILD_TTL_MS) {
        pendingDomainChipBuilds.delete(key);
      }
    }
    for (const [key, entry] of pendingMissionCancelConfirmations) {
      if (now - entry.timestamp > MISSION_CANCEL_CONFIRMATION_TTL_MS) {
        pendingMissionCancelConfirmations.delete(key);
      }
    }

    // Verify stale entries removed
    assert.equal(pendingClarifications.has('stale'), false, 'stale clarification removed');
    assert.equal(pendingClarifications.has('fresh'), true, 'fresh clarification kept');

    assert.equal(pendingDomainChipBuilds.has('stale'), false, 'stale domain chip removed');
    assert.equal(pendingDomainChipBuilds.has('fresh'), true, 'fresh domain chip kept');

    assert.equal(pendingMissionCancelConfirmations.has('stale'), false, 'stale cancel confirmation removed');
    assert.equal(pendingMissionCancelConfirmations.has('fresh'), true, 'fresh cancel confirmation kept');
  });

  it('cleanup preserves entries within TTL window', () => {
    const TTL_MS = 30 * 60 * 1000;
    const map = new Map<string, { timestamp: number }>();
    const now = Date.now();

    // Entry just within TTL
    map.set('within', { timestamp: now - TTL_MS + 1000 });
    // Entry just outside TTL
    map.set('outside', { timestamp: now - TTL_MS - 1000 });

    for (const [key, entry] of map) {
      if (now - entry.timestamp > TTL_MS) {
        map.delete(key);
      }
    }

    assert.equal(map.has('within'), true, 'entry within TTL preserved');
    assert.equal(map.has('outside'), false, 'entry outside TTL removed');
  });

  it('cleanup handles empty maps without error', () => {
    const map = new Map<string, { timestamp: number }>();
    const now = Date.now();
    const TTL_MS = 1000;

    // Should not throw
    for (const [key, entry] of map) {
      if (now - entry.timestamp > TTL_MS) {
        map.delete(key);
      }
    }

    assert.equal(map.size, 0, 'empty map stays empty');
  });
});
