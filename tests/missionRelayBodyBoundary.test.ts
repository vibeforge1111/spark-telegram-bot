import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { pruneRelayRateLimitEntries, readRelayJsonBody } from '../src/missionRelay';

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('names an oversized relay payload separately from invalid JSON', async () => {
    const stream = new PassThrough();
    const result = readRelayJsonBody(stream as unknown as IncomingMessage);
    stream.end(Buffer.alloc(64 * 1024 + 1, 97));
    assert.equal((await result).kind, 'too_large');
  });

  await test('accepts a bounded relay event payload', async () => {
    const stream = new PassThrough();
    const result = readRelayJsonBody(stream as unknown as IncomingMessage);
    stream.end(JSON.stringify({ event: { type: 'mission_started', missionId: 'mission-1' } }));
    const outcome = await result;
    assert.equal(outcome.kind, 'ok');
  });

  await test('expires stale relay rate-limit entries and enforces a hard cap', async () => {
    const entries = new Map([
      ['stale', { startedAt: 0, count: 1 }],
      ['oldest-active', { startedAt: 90_000, count: 1 }],
      ['newest-active', { startedAt: 95_000, count: 1 }],
    ]);

    pruneRelayRateLimitEntries(entries, 100_000, 2);

    assert.deepEqual([...entries.keys()], ['newest-active']);
  });

  await test('bounds a relay client that never finishes its body', async () => {
    const stream = new PassThrough();
    const keepAlive = setTimeout(() => {}, 20);
    const outcome = await readRelayJsonBody(stream as unknown as IncomingMessage, 5);
    clearTimeout(keepAlive);
    assert.equal(outcome.kind, 'timeout');
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
