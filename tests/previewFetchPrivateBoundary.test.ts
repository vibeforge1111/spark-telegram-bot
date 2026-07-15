import assert from 'node:assert/strict';
import {
  probePreviewReachability,
  resolvePreviewTarget,
  type PreviewAddress,
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
  await test('rejects literal private and metadata preview targets', async () => {
    for (const url of [
      'http://127.0.0.1/admin',
      'http://10.0.0.1/internal',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/internal',
      'http://[fc00::1]/internal',
      'http://[::ffff:7f00:1]/internal',
      'http://[64:ff9b::7f00:1]/internal',
    ]) {
      const decision = await resolvePreviewTarget(url, {}, async (hostname) => {
        const cleaned = hostname.replace(/^\[|\]$/g, '');
        return [{ address: cleaned, family: cleaned.includes(':') ? 6 : 4 } as PreviewAddress];
      });
      assert.equal(decision.allowed, false, url);
      assert.equal(decision.reason, 'private_or_reserved_address', url);
    }
  });

  await test('rejects a public hostname when any resolved address is private', async () => {
    const decision = await resolvePreviewTarget('https://preview.example/app', {}, async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.8', family: 4 },
    ]);
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'private_or_reserved_address');
  });

  await test('validates every redirect before issuing the next request', async () => {
    const requested: string[] = [];
    const requester: PreviewRequester = async (target) => {
      requested.push(target.toString());
      return { status: 302, location: 'http://169.254.169.254/latest/meta-data' };
    };
    const ok = await probePreviewReachability('https://preview.example/app', {
      env: {},
      lookup: async (hostname) => hostname === 'preview.example'
        ? publicLookup(hostname)
        : [{ address: hostname, family: 4 }],
      request: requester,
    });
    assert.equal(ok, false);
    assert.deepEqual(requested, ['https://preview.example/app']);
  });

  await test('rejects non-http schemes and embedded URL credentials', async () => {
    assert.equal((await resolvePreviewTarget('file:///etc/passwd', {}, publicLookup)).reason, 'unsupported_protocol');
    assert.equal((await resolvePreviewTarget('https://user:secret@preview.example/app', {}, publicLookup)).reason, 'embedded_credentials');
  });

  await test('aborts a preview probe at the total timeout boundary', async () => {
    const request: PreviewRequester = async (_target, _address, _headers, signal) => (
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      })
    );
    const started = Date.now();
    assert.equal(await probePreviewReachability('https://preview.example/app', {
      env: {},
      lookup: publicLookup,
      request,
      timeoutMs: 20,
    }), false);
    assert.ok(Date.now() - started < 500);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
