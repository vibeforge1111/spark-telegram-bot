import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  describeSparkAccessProfile,
  getSparkAccessProfile,
  normalizeSparkAccessProfile,
  renderSparkAccessDenial,
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
    assert.equal(normalizeSparkAccessProfile('unknown'), null);
  });

  await test('stores access profile per chat', async () => {
    resetJsonStateForTests();
    process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-access-test-'));

    assert.equal(await getSparkAccessProfile(123), 'agent');
    await setSparkAccessProfile(123, 'agent');

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
    assert.equal(sparkAccessAllowsExternalResearch('builder'), false);
    assert.equal(sparkAccessAllowsExternalResearch('agent'), true);
    assert.equal(sparkAccessAllowsWorkspaceBuilds('agent'), false);
    assert.equal(sparkAccessAllowsWorkspaceBuilds('developer'), true);
    assert.equal(sparkAccessAllowsSpawnerBuilds('chat'), false);
    assert.equal(sparkAccessAllowsSpawnerBuilds('builder'), true);
    assert.equal(sparkAccessAllowsOperatingSystemWork('agent'), false);
    assert.equal(sparkAccessAllowsOperatingSystemWork('developer'), true);
    assert.equal(sparkAccessAllows('chat', 'spawner_build'), false);
    assert.equal(sparkAccessAllows('builder', 'spawner_build'), true);
    assert.equal(sparkAccessAllows('builder', 'external_research'), false);
    assert.equal(sparkAccessAllows('agent', 'external_research'), true);
    assert.equal(sparkAccessAllows('agent', 'operating_system'), false);
    assert.equal(sparkAccessAllows('developer', 'operating_system'), true);
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
