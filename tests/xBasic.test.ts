import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  extractXStatusIds,
  fetchBasicXPosts,
  renderBasicXConfigReply,
  resolveBasicXConfig,
  shouldUseBasicXFetch
} from '../src/xBasic';

function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok - ${name}`))
    .catch((error) => {
      console.error(`not ok - ${name}`);
      throw error;
    });
}

async function run(): Promise<void> {
  await test('loads basic X bearer token from Spark agent env', () => {
    const root = path.join(os.tmpdir(), `spark-x-basic-${Date.now()}`);
    mkdirSync(path.join(root, 'config', 'agents'), { recursive: true });
    writeFileSync(
      path.join(root, 'config', 'agents', 'spark-telegram-bot.env'),
      'SPARK_X_BEARER_TOKEN=test-x-token\n'
    );
    const env: NodeJS.ProcessEnv = { SPARK_HOME: root };
    try {
      const config = resolveBasicXConfig(env);
      assert.equal(config.status, 'configured');
      assert.equal(config.tokenSource, 'SPARK_X_BEARER_TOKEN');
      assert.equal(env.SPARK_X_BEARER_TOKEN, 'test-x-token');
      assert.match(renderBasicXConfigReply(config), /basic X API key configured/);
      assert.match(renderBasicXConfigReply(config), /XContent is still the premium/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  await test('extracts X status links and recognizes basic fetch intent', () => {
    const text = [
      'review these',
      'https://x.com/meta_alchemist/status/2060300738040082786',
      'https://twitter.com/Spark_coded/status/2060349528503726357'
    ].join('\n');
    assert.deepEqual(extractXStatusIds(text), ['2060300738040082786', '2060349528503726357']);
    assert.equal(shouldUseBasicXFetch(text), true);
  });

  await test('fetches posts with Spark-owned X token without exposing it', async () => {
    const env: NodeJS.ProcessEnv = { SPARK_X_BEARER_TOKEN: 'secret-basic-x-token' };
    const calls: any[] = [];
    const fakeFetch = async (url: string, init?: any) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: '2060300738040082786', text: 'Spark update text', author_id: '1' }],
          includes: { users: [{ id: '1', username: 'meta_alchemist' }] }
        })
      } as Response;
    };

    const result = await fetchBasicXPosts(['2060300738040082786'], env, fakeFetch as any);

    assert.equal(result.ok, true);
    assert.equal(result.configured, true);
    assert.equal(result.posts[0].text, 'Spark update text');
    assert.equal(result.posts[0].authorUsername, 'meta_alchemist');
    assert.match(calls[0].url, /api\.x\.com\/2\/tweets/);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-basic-x-token');
    assert.doesNotMatch(result.message, /secret-basic-x-token/);
  });
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
