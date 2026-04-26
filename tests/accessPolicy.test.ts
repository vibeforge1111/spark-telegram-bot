import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  describeSparkAccessProfile,
  getConfiguredSparkAccessProfile,
  getSparkAccessProfile,
  normalizeSparkAccessProfile,
  renderSparkAccessDenial,
  renderSparkAccessOnboarding,
  renderSparkAccessStatus,
  setSparkAccessProfile,
  sparkAccessAllows,
  sparkAccessLabel,
  sparkAccessLevel,
  sparkAccessAllowsExternalResearch,
  sparkAccessAllowsOperatingSystemWork,
  sparkAccessAllowsSpawnerBuilds,
  sparkMissionNeedsOperatingSystemAccess,
  sparkAccessAllowsWorkspaceBuilds
} from '../src/accessPolicy';
import { resetJsonStateForTests } from '../src/jsonState';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('normalizes Spark access aliases', () => {
    assert.equal(normalizeSparkAccessProfile('1'), 'chat');
    assert.equal(normalizeSparkAccessProfile('level 2'), 'builder');
    assert.equal(normalizeSparkAccessProfile('L3'), 'agent');
    assert.equal(normalizeSparkAccessProfile('level-4'), 'developer');
    assert.equal(normalizeSparkAccessProfile('chat'), 'chat');
    assert.equal(normalizeSparkAccessProfile('chat only'), 'chat');
    assert.equal(normalizeSparkAccessProfile('mission'), 'builder');
    assert.equal(normalizeSparkAccessProfile('build when asked'), 'builder');
    assert.equal(normalizeSparkAccessProfile('github'), 'agent');
    assert.equal(normalizeSparkAccessProfile('research + build'), 'agent');
    assert.equal(normalizeSparkAccessProfile('research & build'), 'agent');
    assert.equal(normalizeSparkAccessProfile('full'), 'developer');
    assert.equal(normalizeSparkAccessProfile('full access'), 'developer');
    assert.equal(normalizeSparkAccessProfile('operating system'), 'developer');
    assert.equal(normalizeSparkAccessProfile('OS'), 'developer');
    assert.equal(normalizeSparkAccessProfile('local project'), 'developer');
    assert.equal(normalizeSparkAccessProfile('local repo'), 'developer');
    assert.equal(normalizeSparkAccessProfile('unknown'), null);
  });

  await test('stores access profile per chat', async () => {
    resetJsonStateForTests();
    process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-access-test-'));

    assert.equal(await getConfiguredSparkAccessProfile(123), null);
    assert.equal(await getSparkAccessProfile(123), 'agent');
    await setSparkAccessProfile(123, 'agent');

    assert.equal(await getConfiguredSparkAccessProfile(123), 'agent');
    assert.equal(await getSparkAccessProfile(123), 'agent');
    assert.equal(await getSparkAccessProfile(456), 'agent');
  });

  await test('allows environment override of default access profile', async () => {
    resetJsonStateForTests();
    process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-access-env-test-'));
    const originalDefault = process.env.SPARK_AGENT_ACCESS_PROFILE;
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'chat only';
    try {
      assert.equal(await getSparkAccessProfile(789), 'chat');
    } finally {
      if (originalDefault === undefined) {
        delete process.env.SPARK_AGENT_ACCESS_PROFILE;
      } else {
        process.env.SPARK_AGENT_ACCESS_PROFILE = originalDefault;
      }
    }
  });

  await test('describes tool boundaries by access profile', () => {
    const matrix = [
      { profile: 'chat', spawnerBuild: false, externalResearch: false, operatingSystem: false },
      { profile: 'builder', spawnerBuild: true, externalResearch: false, operatingSystem: false },
      { profile: 'agent', spawnerBuild: true, externalResearch: true, operatingSystem: false },
      { profile: 'developer', spawnerBuild: true, externalResearch: true, operatingSystem: true }
    ] as const;

    for (const row of matrix) {
      assert.equal(sparkAccessAllowsSpawnerBuilds(row.profile), row.spawnerBuild, `${row.profile} spawner`);
      assert.equal(sparkAccessAllowsExternalResearch(row.profile), row.externalResearch, `${row.profile} research`);
      assert.equal(sparkAccessAllowsOperatingSystemWork(row.profile), row.operatingSystem, `${row.profile} os`);
      assert.equal(sparkAccessAllows(row.profile, 'spawner_build'), row.spawnerBuild, `${row.profile} generic spawner`);
      assert.equal(sparkAccessAllows(row.profile, 'external_research'), row.externalResearch, `${row.profile} generic research`);
      assert.equal(sparkAccessAllows(row.profile, 'operating_system'), row.operatingSystem, `${row.profile} generic os`);
    }

    assert.equal(sparkAccessAllowsWorkspaceBuilds('agent'), false);
    assert.equal(sparkAccessAllowsWorkspaceBuilds('developer'), true);
    assert.equal(sparkAccessLevel('developer'), 4);
    assert.equal(sparkAccessLabel('agent'), 'Level 3 - Research + Build');
    assert.equal(sparkAccessLabel('developer'), 'Level 4 - Full Access');
    assert.match(describeSparkAccessProfile('developer'), /must not reveal secrets/);
    assert.match(describeSparkAccessProfile('developer'), /operating-system work/);
    assert.match(describeSparkAccessProfile('agent'), /Default/);
    assert.match(renderSparkAccessStatus('agent'), /Spark access: Level 3 - Research \+ Build/);
    assert.match(renderSparkAccessStatus('agent'), /\/access 3  Research \+ Build \(default\)/);
    assert.match(renderSparkAccessStatus('builder'), /Build When Asked/);
    assert.match(renderSparkAccessStatus('agent'), /\/access 4/);
    assert.match(renderSparkAccessOnboarding('agent'), /Choose how much access this Telegram chat has/);
    assert.match(renderSparkAccessOnboarding('agent'), /\/access 3  Research \+ Build \(recommended\)/);
    assert.match(renderSparkAccessOnboarding('agent'), /Default right now: Level 3 - Research \+ Build/);
    assert.match(renderSparkAccessOnboarding('developer'), /Default right now: Level 4 - Full Access/);
    assert.match(renderSparkAccessOnboarding('agent'), /change this later anytime by sending \/access 1/);
  });

  await test('classifies operating-system work and renders denial copy', () => {
    assert.equal(sparkMissionNeedsOperatingSystemAccess('say exactly OK'), false);
    assert.equal(sparkMissionNeedsOperatingSystemAccess('build this at C:\\Users\\USER\\Desktop\\probe'), true);
    assert.equal(sparkMissionNeedsOperatingSystemAccess('debug my local project'), true);
    assert.equal(sparkMissionNeedsOperatingSystemAccess('create a small browser app', '/Users/me/app'), true);

    assert.match(renderSparkAccessDenial('chat', 'spawner_build'), /Build When Asked/);
    assert.match(renderSparkAccessDenial('builder', 'external_research'), /Research \+ Build/);
    assert.match(renderSparkAccessDenial('agent', 'operating_system'), /operating system/);
    assert.match(renderSparkAccessDenial('agent', 'operating_system'), /\/access 4/);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
