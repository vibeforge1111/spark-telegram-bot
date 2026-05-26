import assert from 'node:assert/strict';
import {
  browserTaskNeedsReferenceResearch,
  browserUseCliTaskGoalForIntent,
  browserUseTaskGoalForIntent,
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
    assert.deepEqual(
      classifyBrowserCapabilityQuestion('What browser evidence do you have from the latest run?'),
      { kind: 'evidence' }
    );
    assert.deepEqual(
      classifyBrowserCapabilityQuestion('Show me the browser proof from the last run.'),
      { kind: 'evidence' }
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

  await test('classifies internet reference research as browser tasks', () => {
    const text = 'Research 3 strong mission-control products on the internet, compare them to http://127.0.0.1:3333/canvas, and tell me what we should be inspired by.';
    const intent = classifyBrowserCapabilityQuestion(text);
    assert.deepEqual(intent, { kind: 'task', url: 'http://127.0.0.1:3333/canvas', goal: text });
    assert.equal(browserTaskNeedsReferenceResearch(intent!), true);
  });

  await test('classifies deep product operator browser research before build wording', () => {
    const text = [
      'Compare http://127.0.0.1:3333/canvas with https://linear.app, https://www.atlassian.com/software/jira/features, and https://github.com/features/issues.',
      'Act like a product operator improving Spawner Mission Control.',
      'Use browser-use to inspect the live Spawner canvas and the reference products.',
      'Tell me what Spawner already does better, what Spawner should be inspired by, the next 5 UI/product fixes we should build, and which fix should be first.'
    ].join(' ');
    const intent = classifyBrowserCapabilityQuestion(text);
    assert.deepEqual(intent, { kind: 'task', url: 'http://127.0.0.1:3333/canvas', goal: text });
    assert.equal(browserTaskNeedsReferenceResearch(intent!), true);
    assert.equal(shouldRunFullBrowserUseTask(intent!.goal || ''), true);
  });

  await test('does not force generic web wording into browser tasks', () => {
    assert.equal(
      classifyBrowserCapabilityQuestion('This web page is probably fine http://127.0.0.1:3333/canvas'),
      null
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
    assert.equal(
      shouldRunFullBrowserUseTask("Check this product's UI and let me know the fixes http://127.0.0.1:3333/kanban"),
      true
    );
    assert.equal(
      shouldRunFullBrowserUseTask('Research 3 strong mission-control products on the internet, compare them to http://127.0.0.1:3333/canvas, and tell me what we should be inspired by.'),
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

  await test('frames reference research results as inspiration', () => {
    const intent = requireIntent('Research 3 strong mission-control products on the internet, compare them to http://127.0.0.1:3333/canvas, and tell me what we should be inspired by.');
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: true,
      action: 'task',
      final_result: 'Codex: Research read: Linear is strong at saved filtered views and right-side context. GitHub Projects is strong at table, board, roadmap, custom fields, and insights charts. Copy/adapt 3 things: 1. Saved filtered views for common operator states. 2. Right-side context panel for selected work. 3. Insights charts for mission health.',
      urls: ['https://linear.app', 'https://github.com/features/issues'],
      number_of_steps: 8,
      screenshot_paths: ['C:/spark/linear.png'],
    });

    assert.match(reply, /Research read: Linear is strong/);
    assert.match(reply, /Inspired by: Saved filtered views/);
    assert.match(reply, /Inspired by: Right-side context panel/);
    assert.match(reply, /Inspired by: Insights charts/);
    assert.doesNotMatch(reply, /Codex:/);
    assert.doesNotMatch(reply, /Copy\/adapt/);
  });

  await test('does not render copy language in reference research results', () => {
    const intent = requireIntent('Compare http://127.0.0.1:3333/canvas with https://linear.app, https://www.atlassian.com/software/jira/features, and https://github.com/features/issues. Tell me what Spawner should be inspired by.');
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: true,
      action: 'task',
      final_result: [
        'Spawner should copy the control model, not the surface furniture.',
        '1. Linear: copy the always-alive work inspector',
        'Linear keeps issue state, activity, labels, priority, cycle, project, and agent work in one focused context.',
        'Source: https://linear.app',
        '2. Jira: copy the multi-view source of truth',
        'Jira has boards, lists, timelines, calendars, goals, dependencies, and automations over the same work.',
        'Source: https://www.atlassian.com/software/jira/features',
        '3. GitHub Issues: copy proof-native timelines',
        'GitHub keeps planning close to issues, PRs, commits, deploys, custom fields, and project views.',
        'Source: https://github.com/features/issues',
      ].join('\n'),
      urls: ['https://linear.app', 'https://www.atlassian.com/software/jira/features', 'https://github.com/features/issues'],
      number_of_steps: 8,
      screenshot_paths: ['C:/spark/linear.png'],
    });

    assert.match(reply, /Inspired by/);
    assert.match(reply, /Linear: be inspired by the always-alive work inspector/);
    assert.match(reply, /Jira: be inspired by the multi-view source of truth/);
    assert.match(reply, /GitHub Issues: be inspired by proof-native timelines/);
    assert.doesNotMatch(reply, /\bcopy\b/i);
    assert.doesNotMatch(reply, /Fix next/);
  });

  await test('adds reference research guardrails to full browser task goals', () => {
    const intent = requireIntent([
      'Use browser-use plus current Spark context to research product inspiration for Spawner Mission Control.',
      'Compare http://127.0.0.1:3333/canvas with https://linear.app, https://www.atlassian.com/software/jira/features, and https://github.com/features/issues.',
      'Give 5 short Inspired by bullets.'
    ].join(' '));

    const goal = browserUseTaskGoalForIntent(intent);

    assert.match(goal, /Reference inspiration task/);
    assert.match(goal, /Required browser itinerary:/);
    assert.match(goal, /Target page: http:\/\/127\.0\.0\.1:3333\/canvas/);
    assert.match(goal, /Reference 1: https:\/\/linear\.app/);
    assert.match(goal, /Reference 2: https:\/\/www\.atlassian\.com\/software\/jira\/features/);
    assert.match(goal, /Reference 3: https:\/\/github\.com\/features\/issues/);
    assert.match(goal, /Visit\/read every reference URL listed above/);
    assert.match(goal, /Do not finish until at least two reference URLs were observed/);
    assert.match(goal, /Return 5 short Inspired by bullets/);
    assert.match(goal, /not a product inventory/);
  });

  await test('flattens browser task goals before CLI dispatch', () => {
    const intent = requireIntent([
      'Use browser-use plus current Spark context to research product inspiration for Spawner Mission Control.',
      'Compare http://127.0.0.1:3333/canvas with https://linear.app and https://github.com/features/issues.',
      'Give 5 short Inspired by bullets.'
    ].join('\n'));

    const goal = browserUseCliTaskGoalForIntent(intent);

    assert.doesNotMatch(goal, /[\r\n]/);
    assert.match(goal, /Target page: http:\/\/127\.0\.0\.1:3333\/canvas/);
    assert.match(goal, /Reference 1: https:\/\/linear\.app/);
    assert.match(goal, /Reference 2: https:\/\/github\.com\/features\/issues/);
    assert.match(goal, /Return 5 short Inspired by bullets/);
  });

  await test('rejects Spawner-only observations as incomplete reference research', () => {
    const intent = requireIntent('Use browser-use plus current Spark context to research product inspiration for Spawner Mission Control. Compare http://127.0.0.1:3333/canvas with Linear, Jira, and GitHub Issues.');
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: true,
      action: 'task',
      final_result: [
        'Tagline: Visual Orchestration for AI Skill Chains.',
        'Scale: 656 total skills, 4 in pipeline, spanning 40+ categories.',
        'Visual DAG editor using SVG-based nodes connected by input/output connectors.',
        'Each node represents a task stage with an assigned skill set.',
        'Nodes are tagged with specialized skills.'
      ].join('\n'),
      urls: ['http://127.0.0.1:3333/canvas'],
      number_of_steps: 4,
      screenshot_paths: ['C:/spark/canvas.png'],
    });

    assert.match(reply, /did not complete the reference research/);
    assert.match(reply, /only returned Spawner page observations/);
    assert.doesNotMatch(reply, /Inspired by/);
    assert.doesNotMatch(reply, /Tagline: Visual Orchestration/);
  });

  await test('does not accept vague source words as reference evidence', () => {
    const intent = requireIntent('Use browser-use plus current Spark context to research product inspiration for Spawner Mission Control. Compare http://127.0.0.1:3333/canvas with Linear, Jira, and GitHub Issues.');
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: true,
      action: 'task',
      final_result: [
        'Spawner is a Visual Orchestration for AI Skill Chains platform.',
        'It has a skills library of 656 skills across 44 categories (Source.',
        'Skills are tiered.',
        'The platform features a canvas-based workflow editor with nodes representing skill chains.',
        'Canvas - Visual workflow editor for building AI skill chains.'
      ].join('\n'),
      urls: ['http://127.0.0.1:3333/canvas'],
      number_of_steps: 4,
      screenshot_paths: ['C:/spark/canvas.png'],
    });

    assert.match(reply, /did not complete the reference research/);
    assert.doesNotMatch(reply, /Inspired by/);
    assert.doesNotMatch(reply, /656 skills/);
  });

  await test('turns reference product inventory into actionable inspiration', () => {
    const intent = requireIntent('Use browser-use plus current Spark context to find 3 products that inspire agent mission control. Compare them to http://127.0.0.1:3333/canvas and give 5 short Inspired by bullets.');
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: true,
      action: 'task',
      final_result: [
        '1. CrewAI (crewai.com) - Visual editor + AI copilot for agent crew building, workflow tracing, agent training, task guardrails, RBAC, serverless container deployment.',
        '2. N8n (n8n.io) - Visual AI workflow automation canvas, 500+ integrations, multi-agent setups, RAG, MCP protocol support, human-in-the-loop approval nodes.',
        '3. LangGraph (langchain-ai.github.io/langgraph) - Low-level orchestration framework & runtime for long-running stateful agents.',
        '4. Inspired by CrewAIs AI Copilot + Visual Editor - Spawners canvas could add an inline AI copilot that auto-suggests skill-chain compositions and wires nodes based on.',
        "5. Inspired by n8n's 500+ Integrations & MCP Support - Spawner already lists MCPs (0 MCPs visible) and 656 skills.",
      ].join('\n'),
      urls: ['http://127.0.0.1:3333/canvas'],
      number_of_steps: 18,
      screenshot_paths: ['C:/spark/canvas.png'],
    });

    assert.match(reply, /CrewAI: add an inline copilot that suggests skill-chain compositions\./);
    assert.match(reply, /n8n: make MCP and integration nodes first-class workflow blocks\./i);
    assert.match(reply, /LangGraph: add durable state and resume points for long-running agent missions\./);
    assert.doesNotMatch(reply, /Visual editor \+ AI copilot/);
    assert.doesNotMatch(reply, /based on/);
    assert.match(reply, /Live browser run with Canvas and reference pages with screenshot evidence/);
  });

  await test('normalizes clipped inspired-by browser research concepts', () => {
    const intent = requireIntent('Use browser-use plus current Spark context to find products that inspire agent mission control. Compare them to http://127.0.0.1:3333/canvas and give 5 short Inspired by bullets.');
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: true,
      action: 'task',
      final_result: [
        '1. Inspired by: LangGraphs stateful checkpointers - Spawners canvas could persist state at each skill node, enabling mid-pipeline rollback and recovery so a failed node.',
        '2. Inspired by: CrewAIs role-based orchestration - Spawners flat skill tags could evolve into explicit agent roles/goals per node, turning sequential pipelines into.',
        "3. Inspired by: Langfuse's tracing & observability - Spawner could surface per-node latency, token cost, and trace trees directly on the canvas, making skill-chain.",
        '4. Inspired by: multi-agent-orchestrations routing patterns - Spawners linear 4-node pipeline could support conditional branching and dynamic router nodes that select the.',
        '5. Inspired by: human-in-the-loop-review confidence gating - Spawner could insert review gates between pipeline stages that pause execution for human approval when a no.',
      ].join('\n'),
      urls: ['http://127.0.0.1:3333/canvas'],
      number_of_steps: 18,
      screenshot_paths: ['C:/spark/canvas.png'],
    });

    assert.match(reply, /LangGraph: add per-node checkpoints for rollback and resume\./);
    assert.match(reply, /CrewAI: make every node show agent role, goal, and handoff\./);
    assert.match(reply, /Langfuse: surface latency, token cost, and trace trees on each node\./);
    assert.match(reply, /Multi-agent routing: add conditional branches and router nodes\./);
    assert.match(reply, /Review gates: pause risky stages for operator approval\./);
    assert.doesNotMatch(reply, /Inspired by:/);
    assert.doesNotMatch(reply, /\b(?:into|the|a no)\.?$/m);
  });

  await test('repairs clipped reference research parentheticals', () => {
    const intent = requireIntent([
      'Use browser-use plus current Spark context to research product inspiration for Spawner Mission Control.',
      'Compare http://127.0.0.1:3333/canvas with https://linear.app, https://www.atlassian.com/software/jira/features, and https://github.com/features/issues.',
      'Give 5 short Inspired by bullets.'
    ].join(' '));
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: true,
      action: 'task',
      final_result: [
        '1. AI-Powered Skill Triage & Auto-Assignment - Inspired by Linears triage intelligence and Jiras AI-assisted assignment.',
        '2. Multi-View Mission Dashboard (Board / Table / Timeline) - Inspired by GitHub Issues switchable table/board/roadmap views and Jiras board-list-timeline-calendar options.',
        "3. Sub-Node Progress Tracking with Nested Skill Chains - Inspired by GitHub's sub-issues with progress indicators.",
        '4. Keyboard-Driven Command Palette for Canvas Operations - Inspired by Linears speed-focused design and GitHubs full keyboard-shortcut coverage.',
        "5. Mission Health Insights with Burn-Up & Bottleneck Detection - Inspired by GitHub's project insights (burn-up charts.",
      ].join('\n'),
      urls: [
        'http://127.0.0.1:3333/canvas',
        'https://linear.app/',
        'https://www.atlassian.com/software/jira/features',
        'https://github.com/features/issues',
      ],
      number_of_steps: 6,
      screenshot_paths: ['C:/spark/canvas.png'],
    });

    assert.match(reply, /GitHub project insights and burn-up charts\./);
    assert.doesNotMatch(reply, /project insights \(burn-up charts\./);
    assert.doesNotMatch(reply, /Linears/);
    assert.doesNotMatch(reply, /Jiras/);
    assert.doesNotMatch(reply, /GitHubs/);
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

  await test('polishes natural UI findings from full browser output', () => {
    const reply = renderBrowserUseTaskAnswer(
      { kind: 'task', url: 'http://127.0.0.1:3333/kanban' },
      {
        ok: true,
        action: 'task',
        final_result: [
          '1. Empty TO DO column wastes horizontal space',
          '2. Inconsistent action links on history cards',
          '3. Duplicate/similar Canvas links on same card',
          '4. Title tooltip inconsistency - in Canvas vs on the Canvas',
          '5. needs completion proof label is passive with no action',
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/kanban'],
        screenshot_paths: ['C:/spark/shot.png'],
      }
    );

    assert.match(reply, /Use the empty TO DO space for next actions or board guidance\./);
    assert.match(reply, /Make history-card actions consistent across statuses\./);
    assert.match(reply, /Merge duplicate Canvas links on mission cards\./);
    assert.match(reply, /Fix the Canvas tooltip\/title mismatch\./);
    assert.match(reply, /Turn needs completion proof into a clear action\./);
    assert.doesNotMatch(reply, /wastes horizontal space/);
    assert.doesNotMatch(reply, /Title tooltip inconsistency/);
  });

  await test('polishes detailed Kanban browser findings from full loop output', () => {
    const reply = renderBrowserUseTaskAnswer(
      { kind: 'task', url: 'http://127.0.0.1:3333/kanban' },
      {
        ok: true,
        action: 'task',
        final_result: [
          '1. History list mixed into Board view: The Kanban board view below the columns shows a long scrolling HISTORY list of 19 completed/cancelled missions.',
          '2. New button placement among filters: The New mission button ([17]) sits alongside filter tabs (All, Needs review, Paused, Complete), which is confusing.',
          "3. Filter tabs dont map to board columns: Filters (All, Needs review, Paused, Complete, New) dont correspond to the visible board columns (To Do, Active).",
          '4. Inconsistent action links per mission card: Some history entries show Canvas + Open canvas + Trace + Failure links (e.g., Publishing Machine Maze Game).',
          '5. Footer navigation duplicates header: Navigation links (Canvas, Kanban, Skills, GitHub) appear both at the top ([6]-[10]) and botto.',
        ].join('\n'),
        urls: ['http://127.0.0.1:3333/kanban'],
        screenshot_paths: ['C:/spark/shot.png'],
      }
    );

    assert.match(reply, /Separate History from the active board view\./);
    assert.match(reply, /Move New mission away from the filter tabs\./);
    assert.match(reply, /Align filters with board columns or separate them visually\./);
    assert.match(reply, /Standardize mission-card actions across statuses\./);
    assert.match(reply, /Remove duplicate footer navigation from the workspace view\./);
    assert.doesNotMatch(reply, /\[\d+\]/);
    assert.doesNotMatch(reply, /botto/);
    assert.doesNotMatch(reply, /Publishing Machine Maze Game/);
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

    assert.match(reply, /Fast browser read/);
    assert.match(reply, /landing\/demo page/);
    assert.match(reply, /Fix next/);
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

  await test('does not pretend failed reference research was a fast page review', () => {
    const intent = requireIntent('Research 3 strong mission-control products on the internet, compare them to http://127.0.0.1:3333/canvas, and tell me what we should be inspired by.');
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: false,
      action: 'task',
      last_failure_reason: 'ValidationError: Invalid model output format json_invalid',
    });

    assert.match(reply, /could not finish the reference research/);
    assert.match(reply, /use for inspiration/);
    assert.doesNotMatch(reply, /fast path/);
    assert.doesNotMatch(reply, /Fast browser read/);
  });

  await test('explains missing direct reference URL visits', () => {
    const intent = requireIntent([
      'Use browser-use plus current Spark context to research product inspiration for Spawner Mission Control.',
      'Compare http://127.0.0.1:3333/canvas with https://linear.app and https://github.com/features/issues.',
      'Give 5 short Inspired by bullets.'
    ].join(' '));
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: true,
      action: 'task',
      final_result: [
        'Tagline: Visual Orchestration for AI Skill Chains.',
        'Scale: 656 total skills, 4 in pipeline.',
        'Visual DAG editor using SVG-based nodes.'
      ].join('\n'),
      urls: ['http://127.0.0.1:3333/canvas'],
      number_of_steps: 4,
      screenshot_paths: ['C:/spark/canvas.png'],
    });

    assert.match(reply, /did not visit the direct reference URLs from the prompt/);
    assert.match(reply, /one reference URL at a time/);
  });

  await test('reports blocked reference research from browser evidence', () => {
    const intent = requireIntent('Research 3 strong mission-control products on the internet, compare them to http://127.0.0.1:3333/canvas, and tell me what we should be inspired by.');
    const reply = renderBrowserUseTaskAnswer(intent, {
      ok: false,
      action: 'task',
      last_failure_reason: 'Invalid model output format. Please follow the correct schema.',
      final_result: [
        '## Internet Research Status: BLOCKED',
        'I attempted to research 3 mission-control products using both Google Search and DuckDuckGo, but both search engines presented CAPTCHA/bot-verification challenges.',
        'Please provide specific product URLs or retry in an environment where search is accessible.',
      ].join('\n'),
    });

    assert.match(reply, /reference research was blocked/);
    assert.match(reply, /Google and DuckDuckGo asked for human verification/);
    assert.match(reply, /direct product URLs/);
    assert.doesNotMatch(reply, /invalid action format/i);
    assert.doesNotMatch(reply, /schema/i);
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

    assert.match(reply, /• Add compact proof badges/);
    assert.match(reply, /• Keep node details/);
    assert.match(reply, /• Make blocked or removed nodes/);
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
