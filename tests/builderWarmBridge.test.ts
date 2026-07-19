import assert from 'node:assert/strict';
import path from 'node:path';
import { BuilderWarmBridgeClient } from '../src/builderWarmBridge';

type AsyncTest = { name: string; run: () => Promise<void> };
const tests: AsyncTest[] = [];

function test(name: string, run: () => Promise<void>): void {
  tests.push({ name, run });
}

const workerScript = String.raw`
const readline = require('node:readline');
const protocol = 'spark.gateway.stdio.v2';
const sessionId = 'session-test-1234567890';
const behavior = process.env.TEST_WARM_BEHAVIOR || 'normal';
let count = 0;
process.stdout.write(JSON.stringify({ok:true, protocol, ready:true, session_id:sessionId, max_request_bytes:1048576}) + '\n');
const lines = readline.createInterface({input: process.stdin});
lines.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.command === 'shutdown') process.exit(0);
  count += 1;
  if (behavior === 'wrong_id') {
    process.stdout.write(JSON.stringify({ok:true, protocol, request_id:'telegram:wrong', decision:'answered', detail:{}}) + '\n');
    return;
  }
  if (behavior === 'error') {
    process.stdout.write(JSON.stringify({ok:false, protocol, request_id:request.request_id, error:{code:'turn_failed', detail:'secret-token /private/path'}}) + '\n');
    return;
  }
  if (behavior === 'denied') {
    process.stdout.write(JSON.stringify({ok:false, protocol, request_id:request.request_id, decision:'refused', detail:{response_text:'Access is not authorized.'}}) + '\n');
    return;
  }
  const respond = () => process.stdout.write(JSON.stringify({
    ok:true,
    protocol,
    request_id:request.request_id,
    decision:'answered',
    detail:{
      count,
      pid:process.pid,
      token_matches:request.session_token === process.env.SPARK_GATEWAY_STDIO_TOKEN,
      session_matches:request.session_id === sessionId,
      has_simulation:Object.prototype.hasOwnProperty.call(request, 'simulation')
    }
  }) + '\n');
  if (behavior === 'delay') setTimeout(respond, 150); else respond();
});
`;

function client(behavior: string, maxPending = 8): BuilderWarmBridgeClient {
  return new BuilderWarmBridgeClient({
    command: process.execPath,
    args: ['-e', workerScript],
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, TEST_WARM_BEHAVIOR: behavior },
    readyTimeoutMs: 2000,
    maxPending,
  });
}

test('reuses one authenticated child and never sends per-message origin control', async () => {
  const bridge = client('normal');
  try {
    const first = await bridge.send({ message: { text: 'one' } }, 2000);
    const second = await bridge.send({ message: { text: 'two' } }, 2000);
    assert.equal(first.detail?.count, 1);
    assert.equal(second.detail?.count, 2);
    assert.equal(first.detail?.pid, second.detail?.pid);
    assert.equal(first.detail?.token_matches, true);
    assert.equal(first.detail?.session_matches, true);
    assert.equal(first.detail?.has_simulation, false);
  } finally {
    bridge.close();
  }
});

test('keeps Builder error details out of Telegram exceptions', async () => {
  const bridge = client('error');
  try {
    await assert.rejects(
      bridge.send({ message: { text: 'status' } }, 2000),
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        assert.match(message, /turn_failed/);
        assert.doesNotMatch(message, /secret-token|private\/path/);
        return true;
      }
    );
  } finally {
    bridge.close();
  }
});

test('preserves governed application refusals as replies rather than transport failures', async () => {
  const bridge = client('denied');
  try {
    const response = await bridge.send({ message: { text: 'status' } }, 2000);
    assert.equal(response.ok, false);
    assert.equal(response.decision, 'refused');
    assert.equal(response.detail?.response_text, 'Access is not authorized.');
  } finally {
    bridge.close();
  }
});

test('bounds queued work instead of growing pending requests without limit', async () => {
  const bridge = client('delay', 1);
  try {
    const first = bridge.send({ message: { text: 'one' } }, 2000);
    await assert.rejects(bridge.send({ message: { text: 'two' } }, 2000), /\(busy\)/);
    await first;
  } finally {
    bridge.close();
  }
});

test('fails closed when a response does not match the active request', async () => {
  const bridge = client('wrong_id');
  await assert.rejects(bridge.send({ message: { text: 'one' } }, 2000), /\(correlation_error\)/);
  assert.equal(bridge.isClosed, true);
});

async function main(): Promise<void> {
  for (const entry of tests) {
    try {
      await entry.run();
      console.log(`ok - ${entry.name}`);
    } catch (error) {
      console.error(`not ok - ${entry.name}`);
      throw error;
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
