import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  describeSparkAccessProfile,
  getSparkAccessProfile,
  normalizeSparkAccessProfile,
  renderSparkAccessStatus,
  setSparkAccessProfile,
  sparkAccessAllowsExternalResearch,
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
    assert.equal(normalizeSparkAccessProfile('chat'), 'chat');
    assert.equal(normalizeSparkAccessProfile('mission'), 'builder');
    assert.equal(normalizeSparkAccessProfile('github'), 'agent');
    assert.equal(normalizeSparkAccessProfile('full'), 'developer');
    assert.equal(normalizeSparkAccessProfile('unknown'), null);
  });

  await test('stores access profile per chat', async () => {
    resetJsonStateForTests();
    process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-access-test-'));

    assert.equal(await getSparkAccessProfile(123), 'builder');
    await setSparkAccessProfile(123, 'agent');

    assert.equal(await getSparkAccessProfile(123), 'agent');
    assert.equal(await getSparkAccessProfile(456), 'builder');
  });

  await test('describes tool boundaries by access profile', () => {
    assert.equal(sparkAccessAllowsExternalResearch('builder'), false);
    assert.equal(sparkAccessAllowsExternalResearch('agent'), true);
    assert.equal(sparkAccessAllowsWorkspaceBuilds('agent'), false);
    assert.equal(sparkAccessAllowsWorkspaceBuilds('developer'), true);
    assert.match(describeSparkAccessProfile('developer'), /must not reveal secrets/);
    assert.match(renderSparkAccessStatus('agent'), /\/access developer/);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
