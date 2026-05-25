import assert from 'node:assert/strict';
import {
  classifyBrowserCapabilityQuestion,
  renderBrowserCapabilityAnswer
} from '../src/browserCapability';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const successPayload = {
  capability_key: 'spark_browser',
  status: 'success',
  event_type: 'tool_result_received',
  route_latency_ms: 8004,
  probe_summary: 'browser-use adapter status=ready package_available=True cli_available=True proofs=doctor,public_page_open,screenshot_capture,state_read',
};

async function main(): Promise<void> {
  await test('classifies general browser capability questions', () => {
    assert.deepEqual(
      classifyBrowserCapabilityQuestion('You list browser capability, so can you definitely browse pages right now?'),
      { kind: 'capability' }
    );
  });

  await test('classifies URL open requests separately from generic capability', () => {
    assert.deepEqual(
      classifyBrowserCapabilityQuestion('Can you open https://example.com with browser-use and tell me what you see? Use only fresh browser evidence.'),
      { kind: 'specific_open', url: 'https://example.com' }
    );
  });

  await test('classifies URL screenshot requests separately from generic capability', () => {
    assert.deepEqual(
      classifyBrowserCapabilityQuestion('Can you capture a screenshot of https://example.com from Telegram right now?'),
      { kind: 'specific_screenshot', url: 'https://example.com' }
    );
  });

  await test('classifies logged-in cookie requests as unproven scope', () => {
    assert.deepEqual(
      classifyBrowserCapabilityQuestion('Can you open a logged-in dashboard with my cookies right now?'),
      { kind: 'logged_in' }
    );
  });

  await test('renders capability answers without generic route-probe cards', () => {
    const intent = classifyBrowserCapabilityQuestion('You list browser capability, so can you definitely browse pages right now?');
    assert.ok(intent);
    const reply = renderBrowserCapabilityAnswer(intent, successPayload);

    assert.match(reply, /Yes, for the small browser checks covered by the fresh probe/);
    assert.match(reply, /public page open/);
    assert.match(reply, /Still unproven/);
    assert.doesNotMatch(reply, /Route probe/);
    assert.doesNotMatch(reply, /status_path=/);
  });

  await test('renders specific URL open answers as not fully wired yet', () => {
    const intent = classifyBrowserCapabilityQuestion('Can you open https://example.com with browser-use and tell me what you see? Use only fresh browser evidence.');
    assert.ok(intent);
    const reply = renderBrowserCapabilityAnswer(intent, successPayload);

    assert.match(reply, /Not fully yet/);
    assert.match(reply, /https:\/\/example\.com/);
    assert.match(reply, /does not yet return page contents/);
    assert.doesNotMatch(reply, /Route probe/);
  });

  await test('renders screenshot answers as probe-proven but command-missing', () => {
    const intent = classifyBrowserCapabilityQuestion('Can you capture a screenshot of https://example.com from Telegram right now?');
    assert.ok(intent);
    const reply = renderBrowserCapabilityAnswer(intent, successPayload);

    assert.match(reply, /Screenshot capture is proven/);
    assert.match(reply, /does not yet expose a general screenshot command/);
    assert.match(reply, /\/browser screenshot <url>/);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
