import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 'spark-browser-proof-ledger-'));
  process.env.SPARK_GATEWAY_STATE_DIR = stateDir;
  const jsonState = await import('../src/jsonState');
  jsonState.resetJsonStateForTests();
  const {
    browserProofReceiptToRoutePayload,
    readLatestBrowserProofReceipt,
    recordBrowserProofReceipt,
  } = await import('../src/browserProofLedger');
  const { renderBrowserCapabilityAnswer } = await import('../src/browserCapability');

  try {
    await test('records successful URL opens as fresh browser proof', async () => {
      await recordBrowserProofReceipt({
        action: 'open',
        intent: { url: 'https://example.com' },
        latencyMs: 321,
        checkedAt: '2026-05-26T10:00:00.000Z',
        payload: {
          ok: true,
          action: 'open',
          final_url: 'https://example.com/',
          title: 'Example Domain',
        },
      });

      const latest = await readLatestBrowserProofReceipt();
      assert.equal(latest?.result, 'success');
      assert.equal(latest?.action, 'open');
      assert.equal(latest?.target_url, 'https://example.com');
      assert.equal(latest?.latency_ms, 321);
      assert.deepEqual(latest?.proof_labels, ['public_page_open', 'state_read']);
    });

    await test('converts the latest browser receipt into capability-proof language', async () => {
      const latest = await readLatestBrowserProofReceipt();
      assert.ok(latest);
      const reply = renderBrowserCapabilityAnswer(
        { kind: 'capability' },
        browserProofReceiptToRoutePayload(latest)
      );

      assert.match(reply, /Yes, for the browser actions Spark just proved/);
      assert.match(reply, /public page open/);
      assert.match(reply, /page state read/);
      assert.doesNotMatch(reply, /Route probe/);
    });

    await test('records failed tasks as the current browser boundary', async () => {
      await recordBrowserProofReceipt({
        action: 'task',
        intent: { url: 'http://127.0.0.1:3333/kanban' },
        payload: {
          ok: false,
          status: 'failed',
          last_failure_reason: 'The full browser-use agent model returned an invalid action format.',
        },
      });

      const latest = await readLatestBrowserProofReceipt();
      assert.equal(latest?.result, 'failure');
      assert.equal(latest?.failure_reason, 'The full browser-use agent model returned an invalid action format.');
      const reply = renderBrowserCapabilityAnswer(
        { kind: 'capability' },
        browserProofReceiptToRoutePayload(latest!)
      );
      assert.match(reply, /Browser-use is not ready/);
      assert.match(reply, /invalid action format/);
    });

    await test('records attached-browser runs with a distinct boundary', async () => {
      await recordBrowserProofReceipt({
        action: 'state',
        profile: { cdpUrl: 'http://127.0.0.1:9222' },
        payload: {
          ok: true,
          action: 'state',
          title: 'Kanban',
          final_url: 'http://127.0.0.1:3333/kanban',
        },
      });

      const latest = await readLatestBrowserProofReceipt();
      assert.equal(latest?.boundary, 'attached browser');
      assert.deepEqual(latest?.proof_labels, ['state_read']);
    });

    await test('renders latest evidence questions as evidence cards', async () => {
      await recordBrowserProofReceipt({
        action: 'screenshot',
        intent: { url: 'https://example.com' },
        payload: {
          ok: true,
          action: 'screenshot',
          final_url: 'https://example.com/',
          title: 'Example Domain',
          screenshot_path: 'C:/spark/browser.png',
        },
      });

      const latest = await readLatestBrowserProofReceipt();
      const reply = renderBrowserCapabilityAnswer(
        { kind: 'evidence' },
        browserProofReceiptToRoutePayload(latest!)
      );

      assert.match(reply, /Latest browser evidence/);
      assert.match(reply, /screenshot on https:\/\/example\.com\//);
      assert.match(reply, /page: Example Domain/);
      assert.match(reply, /screenshot capture/);
      assert.match(reply, /screenshot\/artifact saved/);
      assert.match(reply, /public page/);
      assert.doesNotMatch(reply, /Not for full browser automation/);
    });
  } finally {
    jsonState.resetJsonStateForTests();
    await rm(stateDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
