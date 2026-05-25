import assert from 'node:assert/strict';
import {
  classifyBrowserCapabilityQuestion,
  renderBrowserCapabilityAnswer,
  renderBrowserUseActionAnswer,
  renderBrowserUseReviewAnswer,
  renderBrowserUseTaskAnswer
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

  await test('classifies real browser-use task requests', () => {
    const text = 'Use browser-use to review http://127.0.0.1:3333 and gather feedback.';
    assert.deepEqual(
      classifyBrowserCapabilityQuestion(text),
      { kind: 'task', url: 'http://127.0.0.1:3333', goal: text }
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

  await test('renders specific URL open action receipts with page text', () => {
    const intent = classifyBrowserCapabilityQuestion('Can you open https://example.com with browser-use and tell me what you see? Use only fresh browser evidence.');
    assert.ok(intent);
    const reply = renderBrowserUseActionAnswer(intent, {
      ok: true,
      action: 'open',
      url: 'https://example.com',
      final_url: 'https://example.com/',
      title: 'Example Domain',
      text_excerpt: 'Example Domain\nThis domain is for use in documentation examples.',
    });

    assert.match(reply, /Browser-use opened the page/);
    assert.match(reply, /Example Domain/);
    assert.match(reply, /https:\/\/example\.com/);
    assert.doesNotMatch(reply, /Route probe/);
  });

  await test('renders screenshot action receipts as captured', () => {
    const intent = classifyBrowserCapabilityQuestion('Can you capture a screenshot of https://example.com from Telegram right now?');
    assert.ok(intent);
    const reply = renderBrowserUseActionAnswer(intent, {
      ok: true,
      action: 'screenshot',
      url: 'https://example.com',
      final_url: 'https://example.com/',
      title: 'Example Domain',
      text_excerpt: 'Example Domain',
      screenshot_path: 'C:/spark/browser.png',
    });

    assert.match(reply, /captured a screenshot/);
    assert.match(reply, /captured from the live browser-use session/);
  });

  await test('renders task receipts as a browser loop result', () => {
    const intent = classifyBrowserCapabilityQuestion('Use browser-use to review http://127.0.0.1:3333 and gather feedback.');
    assert.ok(intent);
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: true,
      action: 'task',
      final_result: 'The main workflow is clear, but the empty state needs a stronger next action.',
      urls: ['http://127.0.0.1:3333/'],
      number_of_steps: 4,
      screenshot_paths: ['C:/spark/shot.png'],
    });

    assert.match(reply, /Browser-use ran the task loop/);
    assert.match(reply, /empty state needs/);
    assert.match(reply, /4 browser steps/);
    assert.match(reply, /screenshot artifact/);
  });

  await test('renders fast browser reviews from screenshot and state evidence', () => {
    const intent = classifyBrowserCapabilityQuestion('Use browser-use to review http://127.0.0.1:3333 and gather feedback.');
    assert.ok(intent);
    const reply = renderBrowserUseReviewAnswer(intent, {
      ok: true,
      action: 'screenshot',
      url: 'http://127.0.0.1:3333',
      final_url: 'http://127.0.0.1:3333/',
      title: 'Spawner - Visual Orchestration for AI Skill Chains',
      text_excerpt: 'Canvas Kanban Trace Skills Settings LIVE MISSION running 1/5 done Pick how you want to work Open canvas Open kanban',
      state_excerpt: 'clickable Canvas Kanban Trace Skills Settings',
      screenshot_path: 'C:/spark/shot.png',
    });

    assert.match(reply, /Browser-use reviewed the live page/);
    assert.match(reply, /landing\/demo page/);
    assert.match(reply, /3 UX improvements/);
    assert.match(reply, /actual Canvas or Kanban workspace/);
    assert.match(reply, /screenshot capture/);
    assert.doesNotMatch(reply, /task loop/);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
