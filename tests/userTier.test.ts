import assert from 'node:assert/strict';
import { describeTier, getTierForUser, type SkillTier } from '../src/userTier';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

test('describeTier renders human prose for each tier', () => {
  assert.match(describeTier('pro'), /pro tier/);
  assert.match(describeTier('pro'), /full Spark skill catalog/);
  assert.match(describeTier('base'), /base tier/);
  assert.match(describeTier('base'), /30-skill starter loadout/);
});

test('getTierForUser returns the default tier when userId is missing', () => {
  withEnv(
    { BOT_DEFAULT_TIER: undefined, BOT_PRO_USER_IDS: undefined, ADMIN_TELEGRAM_IDS: undefined },
    () => {
      assert.equal(getTierForUser(undefined), 'base');
      assert.equal(getTierForUser(''), 'base');
      assert.equal(getTierForUser('   '), 'base');
    }
  );
});

test('getTierForUser honours BOT_DEFAULT_TIER=pro for unknown users', () => {
  withEnv(
    { BOT_DEFAULT_TIER: 'pro', BOT_PRO_USER_IDS: undefined, ADMIN_TELEGRAM_IDS: undefined },
    () => {
      assert.equal(getTierForUser(7777), 'pro');
      assert.equal(getTierForUser(undefined), 'pro');
    }
  );
});

test('getTierForUser ignores unknown BOT_DEFAULT_TIER values and falls back to base', () => {
  withEnv(
    { BOT_DEFAULT_TIER: 'enterprise', BOT_PRO_USER_IDS: undefined, ADMIN_TELEGRAM_IDS: undefined },
    () => {
      assert.equal(getTierForUser(7777), 'base');
    }
  );
});

test('getTierForUser promotes ids listed in BOT_PRO_USER_IDS to pro', () => {
  withEnv(
    { BOT_DEFAULT_TIER: 'base', BOT_PRO_USER_IDS: '111,222 333', ADMIN_TELEGRAM_IDS: undefined },
    () => {
      assert.equal(getTierForUser(111), 'pro');
      assert.equal(getTierForUser('222'), 'pro');
      assert.equal(getTierForUser(333), 'pro');
      assert.equal(getTierForUser(444), 'base');
    }
  );
});

test('getTierForUser promotes ADMIN_TELEGRAM_IDS to pro regardless of BOT_DEFAULT_TIER', () => {
  withEnv(
    { BOT_DEFAULT_TIER: 'base', BOT_PRO_USER_IDS: undefined, ADMIN_TELEGRAM_IDS: '999' },
    () => {
      assert.equal(getTierForUser(999), 'pro');
      assert.equal(getTierForUser('999'), 'pro');
      assert.equal(getTierForUser(998), 'base');
    }
  );
});

test('getTierForUser treats BOT_PRO_USER_IDS lookup as a string-equality check', () => {
  withEnv(
    { BOT_PRO_USER_IDS: '12345', ADMIN_TELEGRAM_IDS: undefined, BOT_DEFAULT_TIER: undefined },
    () => {
      assert.equal(getTierForUser(12345), 'pro');
      // Whitespace-padded ids match because getTierForUser trims first.
      assert.equal(getTierForUser('  12345  '), 'pro');
      // Distinct numeric prefix should not match.
      assert.equal(getTierForUser(1234), 'base');
    }
  );
});

test('getTierForUser keeps SkillTier as a discriminated union', () => {
  withEnv({ BOT_DEFAULT_TIER: 'pro' }, () => {
    const tier: SkillTier = getTierForUser('1');
    assert.ok(tier === 'pro' || tier === 'base');
  });
});
