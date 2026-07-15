import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  probePreviewReachability,
  type PreviewLookup,
  type PreviewRequester,
} from '../src/previewFetchPolicy';

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const publicLookup: PreviewLookup = async () => [{ address: '93.184.216.34', family: 4 }];

async function main(): Promise<void> {
  await test('does not send the Spawner UI key to an external public preview', async () => {
    let observedHeaders: Record<string, string> | undefined;
    const request: PreviewRequester = async (_target, _address, headers) => {
      observedHeaders = headers;
      return { status: 200 };
    };
    const ok = await probePreviewReachability('https://attacker.example/preview', {
      env: {
        SPARK_PROJECT_PREVIEW_URL: 'https://preview.spark.example',
        SPARK_UI_API_KEY: 'ui-secret-for-tests',
      },
      lookup: publicLookup,
      request,
    });
    assert.equal(ok, true);
    assert.equal(observedHeaders, undefined);
  });

  await test('sends the UI key only to the configured origin preview path', async () => {
    const observed: Array<{ url: string; headers: Record<string, string> | undefined }> = [];
    const request: PreviewRequester = async (target, _address, headers) => {
      observed.push({ url: target.toString(), headers });
      return { status: 200 };
    };
    const env = {
      SPARK_PROJECT_PREVIEW_URL: 'https://preview.spark.example/base',
      SPARK_UI_API_KEY: 'ui-secret-for-tests',
    };
    assert.equal(await probePreviewReachability(
      'https://preview.spark.example/base/preview/project/index.html',
      { env, lookup: publicLookup, request }
    ), true);
    assert.equal(await probePreviewReachability(
      'https://preview.spark.example/api/admin',
      { env, lookup: publicLookup, request }
    ), true);
    assert.deepEqual(observed, [
      {
        url: 'https://preview.spark.example/base/preview/project/index.html',
        headers: { 'x-spawner-ui-key': 'ui-secret-for-tests' },
      },
      {
        url: 'https://preview.spark.example/api/admin',
        headers: undefined,
      },
    ]);
  });

  await test('drops the UI key when a configured preview redirects off origin', async () => {
    const observed: Array<{ url: string; headers: Record<string, string> | undefined }> = [];
    const request: PreviewRequester = async (target, _address, headers) => {
      observed.push({ url: target.toString(), headers });
      return observed.length === 1
        ? { status: 302, location: 'https://external.example/result' }
        : { status: 200 };
    };
    const ok = await probePreviewReachability(
      'https://preview.spark.example/preview/project/index.html',
      {
        env: {
          SPARK_PROJECT_PREVIEW_URL: 'https://preview.spark.example',
          SPARK_UI_API_KEY: 'ui-secret-for-tests',
        },
        lookup: publicLookup,
        request,
      }
    );
    assert.equal(ok, true);
    assert.deepEqual(observed.map((entry) => entry.headers), [
      { 'x-spawner-ui-key': 'ui-secret-for-tests' },
      undefined,
    ]);
  });

  await test('keeps explicitly configured local preview links working', async () => {
    const observed: Array<{ address: string; headers: Record<string, string> | undefined }> = [];
    const request: PreviewRequester = async (_target, address, headers) => {
      observed.push({ address: address.address, headers });
      return { status: 200 };
    };
    const ok = await probePreviewReachability('http://127.0.0.1:3333/preview/project/index.html', {
      env: {
        SPARK_PROJECT_PREVIEW_URL: 'http://127.0.0.1:3333',
        SPARK_UI_API_KEY: 'ui-secret-for-tests',
      },
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      request,
    });
    assert.equal(ok, true);
    assert.deepEqual(observed, [{
      address: '127.0.0.1',
      headers: { 'x-spawner-ui-key': 'ui-secret-for-tests' },
    }]);
  });

  await test('pins and probes the configured local preview with the production requester', async () => {
    let observedKey: string | undefined;
    const server = createServer((request, response) => {
      observedKey = typeof request.headers['x-spawner-ui-key'] === 'string'
        ? request.headers['x-spawner-ui-key']
        : undefined;
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('ok');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      assert.equal(await probePreviewReachability(`${origin}/preview/project/index.html`, {
        env: {
          SPARK_PROJECT_PREVIEW_URL: origin,
          SPARK_UI_API_KEY: 'ui-secret-for-tests',
        },
      }), true);
      assert.equal(observedKey, 'ui-secret-for-tests');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
