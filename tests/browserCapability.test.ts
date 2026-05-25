import assert from 'node:assert/strict';
import {
  classifyBrowserCapabilityQuestion,
  browserUseTaskScreenshotPath,
  parseBrowserUseCommandArgs,
  renderBrowserCapabilityAnswer,
  renderBrowserUseActionAnswer,
  renderBrowserUsePrimitiveAnswer,
  renderBrowserUseReviewAnswer,
  renderBrowserUseTaskAnswer,
  shouldRunFullBrowserUseTask
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

function requireIntent(text: string) {
  const intent = classifyBrowserCapabilityQuestion(text);
  assert.ok(intent);
  return intent;
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

  await test('classifies natural product UI fix requests as browser tasks', () => {
    const text = "Check this product's UI and let me know the fixes http://127.0.0.1:3333/kanban";
    assert.deepEqual(
      classifyBrowserCapabilityQuestion(text),
      { kind: 'task', url: 'http://127.0.0.1:3333/kanban', goal: text }
    );
  });

  await test('parses browser-use profile flags from Telegram commands', () => {
    const parsed = parseBrowserUseCommandArgs('task full --profile Default --user-data-dir "C:/Users/USER/AppData/Chrome/User Data" --cdp-url http://127.0.0.1:9222 http://127.0.0.1:3333 review the dashboard');

    assert.deepEqual(parsed.args, ['task', 'full', 'http://127.0.0.1:3333', 'review', 'the', 'dashboard']);
    assert.deepEqual(parsed.profile, {
      profile: 'Default',
      userDataDir: 'C:/Users/USER/AppData/Chrome/User Data',
      cdpUrl: 'http://127.0.0.1:9222',
    });
  });

  await test('promotes interactive browser task goals to the full agent loop', () => {
    assert.equal(
      shouldRunFullBrowserUseTask('http://127.0.0.1:3333/canvas inspect the Canvas workspace like an operator: click Inspect if needed'),
      true
    );
    assert.equal(
      shouldRunFullBrowserUseTask('http://127.0.0.1:3333/kanban review the visible board and give 3 improvements'),
      false
    );
    assert.equal(
      shouldRunFullBrowserUseTask('http://127.0.0.1:3333/trace open trace and explain the failure'),
      true
    );
  });

  await test('selects the latest full-task screenshot with start-page fallback', () => {
    assert.equal(
      browserUseTaskScreenshotPath({
        screenshot_paths: ['C:/spark/step-1.png', 'C:/spark/step-3.png'],
        start_page: { screenshot_path: 'C:/spark/start.png' },
      }),
      'C:/spark/step-3.png'
    );
    assert.equal(
      browserUseTaskScreenshotPath({
        screenshot_paths: [],
        start_page: { screenshot_path: 'C:/spark/start.png' },
      }),
      'C:/spark/start.png'
    );
    assert.equal(browserUseTaskScreenshotPath({}), '');
  });

  await test('renders capability answers without generic route-probe cards', () => {
    const intent = requireIntent('You list browser capability, so can you definitely browse pages right now?');
    const reply = renderBrowserCapabilityAnswer(intent, successPayload);

    assert.match(reply, /Yes, for the browser actions Spark just proved/);
    assert.match(reply, /public page open/);
    assert.match(reply, /Still unproven/);
    assert.doesNotMatch(reply, /Route probe/);
    assert.doesNotMatch(reply, /status_path=/);
  });

  await test('renders specific URL open action receipts with page text', () => {
    const intent = requireIntent('Can you open https://example.com with browser-use and tell me what you see? Use only fresh browser evidence.');
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
    const intent = requireIntent('Can you capture a screenshot of https://example.com from Telegram right now?');
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

  await test('renders cdp action receipts with attached-browser boundary', () => {
    const reply = renderBrowserUseActionAnswer(
      {
        kind: 'specific_open',
        url: 'http://127.0.0.1:3333/canvas',
        profile: { cdpUrl: 'http://127.0.0.1:9222' },
      },
      {
        ok: true,
        action: 'open',
        final_url: 'http://127.0.0.1:3333/canvas',
        title: 'Spawner',
        text_excerpt: 'Canvas workspace',
        profile_requested: true,
        cdp_url: 'http://127.0.0.1:9222',
      }
    );

    assert.match(reply, /attached browser/);
    assert.match(reply, /attached browser evidence/);
    assert.doesNotMatch(reply, /Profile/);
    assert.doesNotMatch(reply, /running browser via CDP requested/);
    assert.doesNotMatch(reply, /public URL evidence only/);
  });

  await test('renders direct primitive browser receipts compactly', () => {
    const reply = renderBrowserUsePrimitiveAnswer('click', {
      ok: true,
      action: 'click',
      title: 'Kanban · spawner',
      final_url: 'http://127.0.0.1:3333/kanban',
      state_excerpt: 'MISSION BOARD\n20 missions · 0 running · 1 paused',
    });

    assert.match(reply, /Browser-use clicked\./);
    assert.match(reply, /Kanban · spawner/);
    assert.match(reply, /20 missions/);
    assert.doesNotMatch(reply, /receipt_path/);
  });

  await test('renders direct primitive failures as a short why', () => {
    const reply = renderBrowserUsePrimitiveAnswer('input', {
      ok: false,
      status: 'failed',
      last_failure_reason: 'Command failed: browser-use input 3',
    });

    assert.match(reply, /Browser-use could not fill that field\./);
    assert.match(reply, /Why/);
    assert.doesNotMatch(reply, /Command failed:/);
  });

  await test('renders task receipts as a browser loop result', () => {
    const intent = {
      ...requireIntent('Use browser-use to review http://127.0.0.1:3333 and gather feedback.'),
      profile: { profile: 'Default' },
    };
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: true,
      action: 'task',
      final_result: 'The main workflow is clear, but the empty state needs a stronger next action.',
      urls: ['http://127.0.0.1:3333/'],
      number_of_steps: 4,
      screenshot_paths: ['C:/spark/shot.png'],
      profile_requested: true,
      profile: 'Default',
    });

    assert.match(reply, /Browser-use finished\./);
    assert.match(reply, /Fix next/);
    assert.match(reply, /empty state needs/);
    assert.match(reply, /Live Default browser run on 127\.0\.0\.1 with screenshot evidence/);
    assert.doesNotMatch(reply, /Visited/);
  });

  await test('renders full task markdown as compact Telegram bullets', () => {
    const intent = {
      ...requireIntent('Use browser-use to review http://127.0.0.1:3333/kanban and gather feedback.'),
      profile: { cdpUrl: 'http://127.0.0.1:9222' },
    };
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: true,
      action: 'task',
      final_result: [
        '## Kanban board inspection - 5 issues to fix:',
        '1. "Orphan Pause Mission" stuck in ACTIVE as PAUSED - resume, reassign, or cancel it.',
        '2. "Publishing Machine Maze Game" marked NEEDS REVIEW after failure - review the failure trace.',
        '3. "Cancel Me" is CANCELLED but still shows "Needs completion proof" - clear the contradictory tag.',
        '4. Completed missions still say "Needs completion proof" - supply proofs or remove the tags.',
        '5. Zero missions running out of 20 total - add a board-level next action.',
      ].join('\n'),
      urls: ['http://127.0.0.1:3333/kanban'],
      number_of_steps: 2,
      screenshot_paths: ['C:/spark/shot.png', 'C:/spark/shot2.png'],
      profile_requested: true,
      cdp_url: 'http://127.0.0.1:9222',
    });

    assert.match(reply, /Fix next/);
    assert.match(reply, /Resume or cancel Orphan Pause Mission\./);
    assert.match(reply, /Resolve Publishing Machine Maze Game; failure and progress disagree\./);
    assert.match(reply, /Clear completion proof from Cancel Me\./);
    assert.doesNotMatch(reply, /##/);
    assert.doesNotMatch(reply, /\[truncated\]/);
    assert.match(reply, /Live attached-browser run on Kanban with screenshot evidence/);
    assert.doesNotMatch(reply, /Profile/);
    assert.doesNotMatch(reply, /Visited/);
  });

  await test('clips long full task bullets without truncation markers', () => {
    const reply = renderBrowserUseTaskAnswer(
      { kind: 'task', url: 'http://127.0.0.1:3333/kanban' },
      {
        ok: true,
        action: 'task',
        final_result: [
          '1. Two COMPLETE missions still flagged "Needs completion proof" - Both "Reply with Exactly: PING_OK" and "Spark Mission Surface Smoke" are marked Complete yet still request completion proof, indicating a cleanup issue that should be resolved before operators trust the board.',
        ].join('\n'),
      }
    );

    assert.match(reply, /Clear completion-proof flags from completed missions\./);
    assert.doesNotMatch(reply, /\[truncated\]/);
    assert.ok(reply.split('\n').every((line) => line.length < 190));
  });

  await test('keeps clipped browser task bullets as complete thoughts', () => {
    const reply = renderBrowserUseTaskAnswer(
      { kind: 'task', url: 'http://127.0.0.1:3333/kanban' },
      {
        ok: true,
        action: 'task',
        final_result: [
          '1. "Orphan Pause Mission" is stuck in ACTIVE but its status is PAUSED - It sits in the Active swimlane yet is flagged as Paused and says "Paused and ready to resume." It needs a clear operator action.',
          '2. Three completed missions still show "Needs completion proof" - "Reply with Exactly: PING_OK", "Spark Mission Surface Smoke", and "Telegram Canvas Build" all need cleanup.',
        ].join('\n'),
      }
    );

    assert.match(reply, /Resume or cancel Orphan Pause Mission\./);
    assert.match(reply, /Clear completion-proof flags from completed missions\./);
    assert.doesNotMatch(reply, /\bIt\s*$/m);
    assert.doesNotMatch(reply, /Smoke"\s*$/m);
  });

  await test('turns Kanban full-task findings into punchy operator actions', () => {
    const reply = renderBrowserUseTaskAnswer(
      { kind: 'task', url: 'http://127.0.0.1:3333/kanban', profile: { cdpUrl: 'http://127.0.0.1:9222' } },
      {
        ok: true,
        action: 'task',
        final_result: [
          '1. Orphan Pause Mission is stranded in ACTIVE - It sits in the Active column but is in Paused state with no clear owner or next step; resume or cancel it.',
          '2. Publishing Machine Maze Game has contradictory status - Marked Needs review and says Mission failed yet all 4/4 build tasks show 100% complete',
          '3. Three completed missions still need completion proof - Reply with Exactly: PING_OK, Spark Mission Surface Smoke',
          '4. Cancelled Cancel Me mission still demands completion proof - A user-cancelled mission should not require proof; clear the flag or finalize its closure.',
          '5. Zero running missions and an empty TO DO column - With 0 running and nothing queued, the board has no forward momentum',
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/kanban'],
        screenshot_paths: ['C:/spark/shot.png'],
        profile_requested: true,
        cdp_url: 'http://127.0.0.1:9222',
      }
    );

    assert.match(reply, /Resume or cancel Orphan Pause Mission\./);
    assert.match(reply, /Resolve Publishing Machine Maze Game; failure and progress disagree\./);
    assert.match(reply, /Clear completion-proof flags from completed missions\./);
    assert.match(reply, /Clear completion proof from Cancel Me\./);
    assert.match(reply, /Queue or start the next mission\./);
    assert.doesNotMatch(reply, /It sits in the Active column/);
    assert.doesNotMatch(reply, /Spark Mission Surface Smoke/);
  });

  await test('filters QA pass-checklist noise into useful Kanban fallback fixes', () => {
    const reply = renderBrowserUseTaskAnswer(
      {
        kind: 'task',
        url: 'http://127.0.0.1:3333/kanban',
        goal: 'QA this page like a useful operator.',
      },
      {
        ok: true,
        action: 'task',
        final_result: [
          'Page Load & Navigation',
          '✅ Page loads correctly. Title: Kanban · spawner',
          '✅ Top nav links present: Canvas, Kanban, Trace, Skills, Settings',
          '✅ Footer present with copyright © 2025 and GitHub link',
          '✅ Pipeline selector shows Untitled Pipeline with file import capability',
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/kanban'],
        number_of_steps: 2,
        screenshot_paths: ['C:/spark/shot.png'],
      }
    );

    assert.match(reply, /Inspect the paused active mission/);
    assert.match(reply, /Review needs-review or failed cards/);
    assert.doesNotMatch(reply, /Page loads correctly/);
    assert.doesNotMatch(reply, /Top nav links present/);
  });

  await test('filters QA existence checks without checkmarks', () => {
    const reply = renderBrowserUseTaskAnswer(
      {
        kind: 'task',
        url: 'http://127.0.0.1:3333/kanban',
        goal: 'QA this page like a useful operator.',
      },
      {
        ok: true,
        action: 'task',
        final_result: [
          'Title: Kanban · spawner - correct.',
          'Pipeline selector shows Untitled Pipeline.',
          'Search input with placeholder Search… present.',
          'New mission button present.',
          'Board/Scheduled toggle present.',
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/kanban'],
        number_of_steps: 2,
        screenshot_paths: ['C:/spark/shot.png'],
      }
    );

    assert.match(reply, /Inspect the paused active mission/);
    assert.doesNotMatch(reply, /New mission button present/);
    assert.doesNotMatch(reply, /Board\/Scheduled toggle present/);
  });

  await test('filters QA board inventory summaries', () => {
    const reply = renderBrowserUseTaskAnswer(
      {
        kind: 'task',
        url: 'http://127.0.0.1:3333/kanban',
        goal: 'QA this page like a useful operator.',
      },
      {
        ok: true,
        action: 'task',
        final_result: [
          '3 columns: TO DO (0 missions), active (1 mission), HISTORY (19 missions, 6 shown)',
          'Header stats: 20 missions · 0 running · 1 paused',
          'Filters: All (active), Needs review, Paused, Complete - all present but only All tested',
          'Search: Present with placeholder Search…',
          'Actions: New mission button, Show all history button',
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/kanban'],
        number_of_steps: 2,
        screenshot_paths: ['C:/spark/shot.png'],
      }
    );

    assert.match(reply, /Inspect the paused active mission/);
    assert.doesNotMatch(reply, /3 columns/);
    assert.doesNotMatch(reply, /Header stats/);
    assert.doesNotMatch(reply, /New mission button/);
  });

  await test('filters bulleted QA board inventory summaries', () => {
    const reply = renderBrowserUseTaskAnswer(
      {
        kind: 'task',
        url: 'http://127.0.0.1:3333/kanban',
        goal: 'QA this page like a useful operator.',
      },
      {
        ok: true,
        action: 'task',
        final_result: [
          '• Title: Kanban · spawner - correct.',
          '• Sidebar navigation present: Canvas, Kanban, Trace, Skills, Settings, GitHub - all linked.',
          '• Summary header: 20 missions · 0 running · 1 paused on initial load.',
          '• Untitled Pipeline button in header; file upload input present inside shadow DOM.',
          '• Needs review filter: TO DO=0, active=0, HISTORY shows 5 entries (latest 4 visible).',
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/kanban'],
        number_of_steps: 2,
        screenshot_paths: ['C:/spark/shot.png'],
      }
    );

    assert.match(reply, /Inspect the paused active mission/);
    assert.doesNotMatch(reply, /Title: Kanban/);
    assert.doesNotMatch(reply, /Sidebar navigation/);
    assert.doesNotMatch(reply, /Summary header/);
  });

  await test('normalizes clipped Kanban variants from browser-use output', () => {
    const reply = renderBrowserUseTaskAnswer(
      { kind: 'task', url: 'http://127.0.0.1:3333/kanban', profile: { cdpUrl: 'http://127.0.0.1:9222' } },
      {
        ok: true,
        action: 'task',
        final_result: [
          '1. Cancelled mission still demands completion proof - clear the flag.',
          '2. Multiple Completed missions still flagged for proof - ping smoke test, Spark Mission Surface Smoke',
          '3. TO DO column is completely empty - With 20 total missions and none queued for upcoming work',
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/kanban'],
        screenshot_paths: ['C:/spark/shot.png'],
        profile_requested: true,
        cdp_url: 'http://127.0.0.1:9222',
      }
    );

    assert.match(reply, /Clear completion proof from cancelled missions\./);
    assert.match(reply, /Clear completion-proof flags from completed missions\./);
    assert.match(reply, /Queue or start the next mission\./);
    assert.doesNotMatch(reply, /from mission\./);
    assert.doesNotMatch(reply, /Spark Mission Surface Smoke/);
    assert.doesNotMatch(reply, /With 20 total missions/);
  });

  await test('normalizes quoted Kanban findings from full browser output', () => {
    const reply = renderBrowserUseTaskAnswer(
      { kind: 'task', url: 'http://127.0.0.1:3333/kanban', profile: { cdpUrl: 'http://127.0.0.1:9222' } },
      {
        ok: true,
        action: 'task',
        final_result: [
          "1. 'Orphan Pause Mission' is stuck paused with nothing running. Board shows 0 running missions.",
          "2. 'Publishing Machine Maze Game' says 'Mission failed' yet shows 4/4 tasks at 100% and sits in 'Needs Review'.",
          "3. 'Cancel Me' is cancelled but still says 'needs completion proof'. A user-cancelled mission shouldn't require completion proof",
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/kanban'],
        screenshot_paths: ['C:/spark/shot.png'],
        profile_requested: true,
        cdp_url: 'http://127.0.0.1:9222',
      }
    );

    assert.match(reply, /Resume or cancel Orphan Pause Mission\./);
    assert.match(reply, /Resolve Publishing Machine Maze Game; failure and progress disagree\./);
    assert.match(reply, /Clear completion proof from Cancel Me\./);
    assert.doesNotMatch(reply, /Board shows 0 running/);
    assert.doesNotMatch(reply, /A user-cancelled mission/);
    assert.doesNotMatch(reply, /'/);
  });

  await test('normalizes colon-style Kanban findings from full browser output', () => {
    const reply = renderBrowserUseTaskAnswer(
      { kind: 'task', url: 'http://127.0.0.1:3333/kanban', profile: { cdpUrl: 'http://127.0.0.1:9222' } },
      {
        ok: true,
        action: 'task',
        final_result: [
          '1. Publishing Machine Maze Game: failed but shows 100% task completion - This mission is in needs review with all 4/4 build tasks at 100%',
          '2. Multiple completed missions are missing completion proofs - Telegram Canvas Build and Spark Mission Surface Smoke are marked complete but still flagged as "Needs',
          '3. Clear completion proof from mission Cancel Me.',
          '4. Zero missions running - board is idle - The board header confirms 0 running across 20 missions.',
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/kanban'],
        screenshot_paths: ['C:/spark/shot.png'],
        profile_requested: true,
        cdp_url: 'http://127.0.0.1:9222',
      }
    );

    assert.match(reply, /Resolve Publishing Machine Maze Game; failure and progress disagree\./);
    assert.match(reply, /Clear completion-proof flags from completed missions\./);
    assert.match(reply, /Clear completion proof from Cancel Me\./);
    assert.match(reply, /Queue or start the next mission\./);
    assert.doesNotMatch(reply, /100% task completion/);
    assert.doesNotMatch(reply, /Spark Mission Surface Smoke/);
    assert.doesNotMatch(reply, /mission Cancel Me/);
    assert.doesNotMatch(reply, /board is idle/);
  });

  await test('normalizes review-status Kanban variants from full browser output', () => {
    const reply = renderBrowserUseTaskAnswer(
      { kind: 'task', url: 'http://127.0.0.1:3333/kanban', profile: { cdpUrl: 'http://127.0.0.1:9222' } },
      {
        ok: true,
        action: 'task',
        final_result: [
          "1. Cancel Me is Cancelled but still requests completion proof - A cancelled mission shouldn't require a completion proof",
          '2. Publishing Machine Maze Game shows Needs Review but has Mission failed - All 4/4 build tasks are 100% yet the mission failed and sits in Needs Review',
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/kanban'],
        screenshot_paths: ['C:/spark/shot.png'],
        profile_requested: true,
        cdp_url: 'http://127.0.0.1:9222',
      }
    );

    assert.match(reply, /Clear completion proof from Cancel Me\./);
    assert.match(reply, /Resolve Publishing Machine Maze Game; failure and progress disagree\./);
    assert.doesNotMatch(reply, /shouldn't require/);
    assert.doesNotMatch(reply, /All 4\/4 build tasks/);
  });

  await test('renders issue section instead of observed nodes for full task markdown', () => {
    const reply = renderBrowserUseTaskAnswer(
      { kind: 'task', url: 'http://127.0.0.1:3333/canvas' },
      {
        ok: true,
        action: 'task',
        final_result: [
          '## Canvas Workflow Inspection Summary',
          '### Nodes Observed',
          '1. Create the playable game file',
          '2. Design the core play and reasoning loop',
          '### Issues to Fix',
          '1. Inverted ordering - design should precede implementation.',
          '2. Generic ports hide what data moves between nodes.',
        ].join('\n'),
      }
    );

    assert.match(reply, /• Inverted ordering/);
    assert.match(reply, /• Generic ports/);
    assert.doesNotMatch(reply, /Create the playable game file/);
  });

  await test('normalizes canvas failure recovery findings into complete actions', () => {
    const reply = renderBrowserUseTaskAnswer(
      { kind: 'task', url: 'http://127.0.0.1:3333/canvas', profile: { cdpUrl: 'http://127.0.0.1:9222' } },
      {
        ok: true,
        action: 'task',
        final_result: [
          '1. Rerun only the failed tasks - The Rerun failed button is available in the panel.',
          '2. Open the trace and inspect detailed logs - The generic Exited with code 1 error is opaque.',
          '3. Reduce the task-pack size on the first node - The first node (Create the playable game file) bundles 4 skills (frontend-engineer, game-development, responsive-mobile-first, game-ui-design).',
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/canvas'],
        screenshot_paths: ['C:/spark/shot.png'],
        profile_requested: true,
        cdp_url: 'http://127.0.0.1:9222',
      }
    );

    assert.match(reply, /Rerun only the failed tasks\./);
    assert.match(reply, /Open the trace and inspect the detailed logs\./);
    assert.match(reply, /Reduce the first node task pack before rerun\./);
    assert.doesNotMatch(reply, /frontend-engineer/);
    assert.doesNotMatch(reply, /\($/m);
  });

  await test('renders fast browser reviews from screenshot and state evidence', () => {
    const intent = requireIntent('Use browser-use to review http://127.0.0.1:3333 and gather feedback.');
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
    assert.match(reply, /What I would improve/);
    assert.match(reply, /actual Canvas or Kanban workspace/);
    assert.match(reply, /screenshot capture/);
    assert.doesNotMatch(reply, /task loop/);
  });

  await test('humanizes noisy browser-use task failures', () => {
    const intent = requireIntent('Use browser-use to review http://127.0.0.1:3333 and gather feedback.');
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: false,
      action: 'task',
      last_failure_reason: 'Command failed: spark browser-use task --json\nINFO [Agent] Step 2\nValidationError: Invalid model output format json_invalid',
    });

    assert.match(reply, /Browser-use could not finish that run/);
    assert.match(reply, /invalid action format/);
    assert.match(reply, /fast path/);
    assert.doesNotMatch(reply, /Command failed/);
    assert.doesNotMatch(reply, /INFO \[Agent\]/);
  });

  await test('renders canvas-specific browser reviews', () => {
    const reply = renderBrowserUseReviewAnswer(
      {
        kind: 'task',
        url: 'http://127.0.0.1:3333/canvas',
        goal: 'review Canvas',
      },
      {
        ok: true,
        action: 'screenshot',
        final_url: 'http://127.0.0.1:3333/canvas',
        title: 'Spawner - Visual Orchestration for AI Skill Chains',
        text_excerpt: 'Publishing Machine Maze Game WORKFLOW FAILED Claude exited with code 1 Canvas',
        state_excerpt: 'viewport: 3834x2160 node graph execution pane failed mission',
      }
    );

    assert.match(reply, /Canvas workspace/);
    assert.match(reply, /execution panel over the node graph/);
    assert.match(reply, /right-side inspector/);
    assert.match(reply, /failure banner/);
    assert.match(reply, /proof badges/);
  });

  await test('renders three canvas improvements from minimal cdp evidence', () => {
    const reply = renderBrowserUseReviewAnswer(
      {
        kind: 'task',
        url: 'http://127.0.0.1:3333/canvas',
        goal: 'review Canvas',
        profile: { cdpUrl: 'http://127.0.0.1:9222' },
      },
      {
        ok: true,
        action: 'screenshot',
        final_url: 'http://127.0.0.1:3333/canvas',
        title: 'Spawner - Visual Orchestration for AI Skill Chains',
        text_excerpt: 'SKILLS 656 total 4 in pipeline Create the playable game file Verify the playable loop',
        state_excerpt: 'viewport: 1252x1278 Canvas node graph',
        profile_requested: true,
        cdp_url: 'http://127.0.0.1:9222',
      }
    );

    assert.match(reply, /1\. Add compact proof badges/);
    assert.match(reply, /2\. Keep node details/);
    assert.match(reply, /3\. Make blocked or removed nodes/);
    assert.match(reply, /attached browser/);
    assert.doesNotMatch(reply, /Profile/);
    assert.doesNotMatch(reply, /running browser via CDP requested/);
  });

  await test('renders kanban-specific browser reviews', () => {
    const reply = renderBrowserUseReviewAnswer(
      {
        kind: 'task',
        url: 'http://127.0.0.1:3333/kanban',
        goal: 'review Kanban',
      },
      {
        ok: true,
        action: 'screenshot',
        final_url: 'http://127.0.0.1:3333/kanban',
        title: 'Kanban · spawner',
        text_excerpt: '20 missions 0 running 1 paused To Do Active History Orphan Pause Mission paused Publishing Machine Maze Game needs attention',
        state_excerpt: 'viewport: 3834x2160 kanban columns cards',
      }
    );

    assert.match(reply, /Kanban workspace: 20 missions, 0 running, 1 paused/);
    assert.match(reply, /board use more of the desktop width/);
    assert.match(reply, /paused or failed mission card/);
    assert.match(reply, /History stronger scan controls/);
  });

  await test('cleans browser mojibake before rendering Telegram text', () => {
    const reply = renderBrowserUseReviewAnswer(
      {
        kind: 'task',
        url: 'http://127.0.0.1:3333/kanban',
        goal: 'review Kanban',
      },
      {
        ok: true,
        action: 'screenshot',
        final_url: 'http://127.0.0.1:3333/kanban',
        title: 'Kanban Â· spawner',
        text_excerpt: '20 missions Â· 0 running Â· 1 paused',
        state_excerpt: 'viewport: 3834x2160 kanban workspace',
      }
    );

    assert.match(reply, /Kanban · spawner/);
    assert.doesNotMatch(reply, /Â/);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
