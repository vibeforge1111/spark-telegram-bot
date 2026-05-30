import assert from 'node:assert/strict';
import { parseBuildIntent } from '../src/buildIntent';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('parses a compact direct build request', () => {
  const intent = parseBuildIntent(
    'build a quick vanilla JS page at C:\\Users\\USER\\Desktop\\spark-direct-probe: Files: index.html, app.js. No build step. Shows hello.'
  );

  assert.ok(intent);
  assert.equal(intent.projectPath, 'C:\\Users\\USER\\Desktop\\spark-direct-probe');
  assert.equal(intent.buildMode, 'direct');
  assert.equal(intent.projectName, 'Spark Direct Probe');
  assert.match(intent.prd, /Files: index\.html, app\.js\./);
  assert.doesNotMatch(intent.prd, /C:\\Users\\USER\\Desktop/);
});

test('promotes larger new projects to advanced PRD mode', () => {
  const intent = parseBuildIntent(
    'build this at C:\\Users\\USER\\Desktop\\spark-advanced-probe: a vanilla-JS single-page web app called Spark Advanced Probe. Files: index.html, styles.css, app.js, README.md. No build step. It shows cards, filters, editable notes, localStorage persistence, animated status states, and responsive layout.'
  );

  assert.ok(intent);
  assert.equal(intent.projectPath, 'C:\\Users\\USER\\Desktop\\spark-advanced-probe');
  assert.equal(intent.buildMode, 'advanced_prd');
  assert.equal(intent.buildLane, 'advanced_prd');
  assert.equal(intent.projectName, 'Spark Advanced Probe');
  assert.match(intent.prd, /^a vanilla-JS single-page web app called Spark Advanced Probe\./);
  assert.doesNotMatch(intent.prd, /^at C:\\Users\\USER\\Desktop/);
});

test('parses conversational immediate new-project build requests', () => {
  const intent = parseBuildIntent(
    "Let's build right now a new project called the Game of Ascension and make it a surprising game right now"
  );

  assert.ok(intent);
  assert.equal(intent.projectPath, null);
  assert.equal(intent.projectName, 'the Game of Ascension');
  assert.equal(intent.buildMode, 'advanced_prd');
  assert.match(intent.prd, /new project called the Game of Ascension/);
});

test('names agent-chosen game prompts from the actual game intent', () => {
  const intent = parseBuildIntent(
    "what would you wanna build here as a game that you'd wanna play Rec, let's build something for you"
  );

  assert.ok(intent);
  assert.equal(intent.projectName, 'Recursive Sage Maze Game');
  assert.notEqual(intent.projectName, 'Here As A Game');
  assert.match(intent.prd, /browser-playable game chosen for Recursive Sage/i);
  assert.match(intent.prd, /shifting maze game/i);

  const shortIntent = parseBuildIntent('sounds good, so what would you wanna build as a game right now');
  assert.ok(shortIntent);
  assert.equal(shortIntent.projectName, 'Recursive Sage Maze Game');
  assert.notEqual(shortIntent.projectName, 'As A Game Right Now');
  assert.match(shortIntent.prd, /browser-playable game chosen for Recursive Sage/i);
});

test('preserves colon subtitles in explicit project names', () => {
  const intent = parseBuildIntent(
    'Build a small browser game called Recursive Sage: Signal Maze. Make it playable in one static HTML file.'
  );

  assert.ok(intent);
  assert.equal(intent.projectName, 'Recursive Sage: Signal Maze');
  assert.match(intent.prd, /one static HTML file/i);
});

test('infers clean landing-page names from compact build prompts', () => {
  const intent = parseBuildIntent('Build a tiny static landing page for a cafe with a menu section.');

  assert.ok(intent);
  assert.equal(intent.projectName, 'Cafe Landing Page');
  assert.equal(intent.buildMode, 'direct');
  assert.equal(intent.buildLane, 'fast_direct');
});

test('routes tiny one-screen smoke pages through the fast direct lane', () => {
  const intent = parseBuildIntent('Build a one-screen paragraph spacing smoke page with a save button and responsive checks.');

  assert.ok(intent);
  assert.equal(intent.buildMode, 'direct');
  assert.equal(intent.buildLane, 'fast_direct');
  assert.match(intent.buildLaneReason, /lightweight planning/i);
});

test('polishes inferred mission titles without workflow wording', () => {
  const intent = parseBuildIntent(
    'Create a tiny maze game plan and build only a minimal playable prototype. Use a short PRD if needed, keep it fast, and show me the Mission Control links as it moves through planning, build, and completion.'
  );

  assert.ok(intent);
  assert.equal(intent.projectName, 'Tiny Maze Game');
  assert.doesNotMatch(intent.projectName, /plan and build/i);
});

test('extracts clean names from Telegram direct-build game prompts', () => {
  const quotedIntent = parseBuildIntent(
    'Build a tiny single-screen browser game called "Spark Bumper QA". Direct build now through Spawner/Mission Control. Keep it small and fast: static HTML/CSS/JS in one folder.'
  );

  assert.ok(quotedIntent);
  assert.equal(quotedIntent.projectName, 'Spark Bumper QA');
  assert.equal(quotedIntent.buildMode, 'direct');
  assert.equal(quotedIntent.buildLane, 'direct');

  const routedIntent = parseBuildIntent(
    'Direct build now through Spawner Mission Control: Spark Paddle QA. Make a tiny one-screen static HTML CSS JS game in one folder. Player moves a paddle with arrow keys or WASD to catch falling sparks for 30 seconds.'
  );

  assert.ok(routedIntent);
  assert.equal(routedIntent.projectName, 'Spark Paddle QA');
  assert.equal(routedIntent.buildMode, 'direct');
  assert.equal(routedIntent.buildLane, 'direct');
});

test('does not let mission link sharing break tiny one-file game naming', () => {
  const intent = parseBuildIntent(
    'Build a tiny one-file browser game called "Spark Pinball QA". Direct build now through Spawner/Mission Control. Keep it fast: static HTML/CSS/JS in one folder. Include score, lives, timer, restart, win/fail. Verify locally. Share Canvas, Kanban, and Preview.'
  );

  assert.ok(intent);
  assert.equal(intent.projectName, 'Spark Pinball QA');
  assert.equal(intent.buildMode, 'direct');
  assert.equal(intent.buildLane, 'direct');
});

test('keeps constrained one-file static HTML prompts direct even when they say full app', () => {
  const intent = parseBuildIntent(
    'build one file only: index.html with a big heading "Spark relay is alive" and text "telegram progress updates reached me". Do not make a full app, do not add package files, and keep it as static HTML only.'
  );

  assert.ok(intent);
  assert.equal(intent.buildMode, 'direct');
  assert.equal(intent.buildLane, 'fast_direct');
  assert.equal(intent.buildModeReason, 'User asked for a constrained one-file static HTML build.');
  assert.equal(intent.projectName, 'Spark relay is alive');
  assert.match(intent.prd, /index\.html/);
});

test('parses advanced PRD mode preface before build command', () => {
  const intent = parseBuildIntent(
    'Use advanced PRD mode. Build this at C:\\Users\\USER\\Desktop\\spark-galaxy-garden: a vanilla-JS single-page app called Spark Galaxy Garden. Files: index.html, styles.css, app.js, README.md. No build step. Users plant seeds, water them, harvest stardust, persist state, and see animated growth stages.'
  );

  assert.ok(intent);
  assert.equal(intent.projectPath, 'C:\\Users\\USER\\Desktop\\spark-galaxy-garden');
  assert.equal(intent.buildMode, 'advanced_prd');
  assert.equal(intent.buildModeReason, 'User explicitly requested advanced PRD mode.');
  assert.equal(intent.projectName, 'Spark Galaxy Garden');
  assert.match(intent.prd, /^a vanilla-JS single-page app called Spark Galaxy Garden\./);
});

test('stops target paths before sentence-level proof instructions', () => {
  const intent = parseBuildIntent(
    'Create a local-only static HTML proof page in C:\\Users\\USER\\Desktop\\spark-os-live-trace-proof-20260511-k. Create only index.html and README.md. Include the visible marker SPARK_OS_INSTALLED_BUILDER_PROOF_K_20260511. Include the sentence "Installed Builder runtime source proof".'
  );

  assert.ok(intent);
  assert.equal(intent.projectPath, 'C:\\Users\\USER\\Desktop\\spark-os-live-trace-proof-20260511-k');
  assert.match(intent.prd, /SPARK_OS_INSTALLED_BUILDER_PROOF_K_20260511/);
});

test('ignores paths outside the configured workspace root', () => {
  const intent = parseBuildIntent('build this at D:\\tmp\\outside: a tiny HTML file called Outside Test.');

  assert.ok(intent);
  assert.equal(intent.projectPath, null);
});

test('does not treat provenance questions about exact changes as build intent', () => {
  const intent = parseBuildIntent('Where and how did you make these exact changes?');

  assert.equal(intent, null);
});

test('does not treat meta-language build words as build intent', () => {
  for (const prompt of [
    'build appears in this sentence as meta-language; stay in chat and explain the boundary',
    'Bug report: build hijacked routing before; do not create a mission',
    'QA case for build: words alone should not execute',
    'Do not create a domain chip; explain when one would be useful.'
  ]) {
    assert.equal(parseBuildIntent(prompt), null, prompt);
  }
});

test('parses Ubuntu target paths under configured project root', () => {
  const originalRoot = process.env.SPARK_PROJECT_ROOT;
  process.env.SPARK_PROJECT_ROOT = '/root';
  try {
    const intent = parseBuildIntent(
      'build this at /root/spark-orbit-diner: a vanilla-JS single-page app called Spark Orbit Diner. Files: index.html, styles.css, app.js, README.md. No build step. It has a menu, cart, launch order animation, localStorage history, and responsive layout.'
    );

    assert.ok(intent);
    assert.equal(intent.projectPath, '/root/spark-orbit-diner');
    assert.equal(intent.buildMode, 'advanced_prd');
    assert.equal(intent.projectName, 'Spark Orbit Diner');
    assert.match(intent.prd, /^a vanilla-JS single-page app called Spark Orbit Diner\./);
    assert.doesNotMatch(intent.prd, /^at \/root/);
  } finally {
    if (originalRoot === undefined) delete process.env.SPARK_PROJECT_ROOT;
    else process.env.SPARK_PROJECT_ROOT = originalRoot;
  }
});

test('parses macOS target paths under configured project root', () => {
  const originalRoot = process.env.SPARK_PROJECT_ROOT;
  process.env.SPARK_PROJECT_ROOT = '/Users/leventcem/Desktop';
  try {
    const intent = parseBuildIntent(
      'create a playful dashboard at /Users/leventcem/Desktop/spark-mission-pets: called Spark Mission Pets with daily missions, streaks, localStorage, filters, and a README.'
    );

    assert.ok(intent);
    assert.equal(intent.projectPath, '/Users/leventcem/Desktop/spark-mission-pets');
    assert.equal(intent.projectName, 'Spark Mission Pets');
    assert.match(intent.prd, /called Spark Mission Pets/);
    assert.doesNotMatch(intent.prd, /^create .* at \/Users/);
  } finally {
    if (originalRoot === undefined) delete process.env.SPARK_PROJECT_ROOT;
    else process.env.SPARK_PROJECT_ROOT = originalRoot;
  }
});

test('ignores POSIX paths outside configured project root', () => {
  const originalRoot = process.env.SPARK_PROJECT_ROOT;
  process.env.SPARK_PROJECT_ROOT = '/home/spark';
  try {
    const intent = parseBuildIntent('build this at /etc/spark-danger: a tiny HTML file called Outside Linux Test.');

    assert.ok(intent);
    assert.equal(intent.projectPath, null);
  } finally {
    if (originalRoot === undefined) delete process.env.SPARK_PROJECT_ROOT;
    else process.env.SPARK_PROJECT_ROOT = originalRoot;
  }
});

test('promotes mission-control canvas and kanban requests to advanced PRD mode', () => {
  const intent = parseBuildIntent(
    'build a Mission Control dashboard called Relay Workshop with a kanban board, canvas, Telegram updates, provider result summaries, acceptance checks, task routing, and a persistent project log'
  );

  assert.ok(intent);
  assert.equal(intent.buildMode, 'advanced_prd');
  assert.equal(intent.projectName, 'Relay Workshop');
  assert.match(intent.prd, /kanban board, canvas, Telegram updates/);
});

test('names audience-first platform briefs without dragging feature nouns into the title', () => {
  const intent = parseBuildIntent(
    'Build a platform for agents with auth, database, roles, analytics, Mission Control, and deployment planning.'
  );

  assert.ok(intent);
  assert.equal(intent.projectName, 'Agent Platform');
  assert.equal(intent.buildMode, 'advanced_prd');
  assert.equal(intent.buildLane, 'advanced_prd');
});

test('does not turn exploratory conversation into an accidental build', () => {
  const intent = parseBuildIntent(
    'can you help me think through whether we should build a mission control dashboard before we touch the canvas?'
  );

  assert.equal(intent, null);
  assert.equal(parseBuildIntent('Give me three build ideas for a memory dashboard'), null);
  assert.equal(parseBuildIntent('Hey Spark, give me the top 10 ideas about how to build startups in a better way'), null);
  assert.equal(parseBuildIntent('How to build startups in a better way?'), null);
  assert.equal(parseBuildIntent('suggest two project directions for a context tester'), null);
  assert.equal(
    parseBuildIntent(
      'sure, lets make today also about improving your capabilities of action taking and improving yourself while talking together, for example can you install a voice to yourself right now?'
    ),
    null
  );
  assert.equal(
    parseBuildIntent('lets make today about improving your capabilities\u2026 can you install a voice to yourself?'),
    null
  );
  assert.equal(parseBuildIntent('lets make this chat about improving Spark in convos'), null);
  assert.equal(parseBuildIntent('make Spark read my emails as a new capability'), null);
  assert.equal(parseBuildIntent('make my Spark read my emails as a new capability'), null);
  assert.equal(parseBuildIntent('make your brain handle my workflow differently'), null);
  assert.equal(parseBuildIntent('make daily reports of my memories work differently'), null);
  assert.equal(parseBuildIntent("Okay let's build this for you, Spark: a way to read my emails and summarize them."), null);
  assert.equal(parseBuildIntent("Let's build you an email reader so you can summarize my inbox."), null);
  assert.equal(parseBuildIntent('Create a capability for Spark to read my calendar.'), null);
  assert.equal(parseBuildIntent('Build a skill that lets you browse my project files.'), null);
  assert.equal(parseBuildIntent('Reply exactly TESTER_REALPATH_OK and do not create files.'), null);
  assert.equal(parseBuildIntent('Reply exactly SPARK_AGI_REALPATH_OK and do not build anything.'), null);
  assert.equal(
    parseBuildIntent('Run a safe Level 5 smoke test: create a tiny file at C:\\Users\\USER\\AppData\\Local\\Temp\\spark-telegram-level5-smoke.txt, write "level5 ok", read it back, then delete it. Do not touch anything else. Tell me each step.'),
    null
  );
  assert.equal(
    parseBuildIntent('Check whether C:\\Users\\USER\\Desktop exists. If it exists, list only the first 5 top-level folder names. Do not open files or read file contents.'),
    null
  );
  assert.equal(parseBuildIntent('we were gonna build something do you remember what it was'), null);
  assert.equal(parseBuildIntent('what were we going to build?'), null);
  assert.equal(
    parseBuildIntent(
      'nice is there any other thing that would be healthy to build for updates/upgrades besides this or should this be the first major focus, and do you have a way to update yourself directly from here'
    ),
    null
  );
  assert.equal(parseBuildIntent('what else would be healthy to build for updates/upgrades besides the ledger'), null);
  assert.equal(parseBuildIntent("what would you wanna be building now that's missing"), null);
  assert.equal(parseBuildIntent('besides these anything else before we start building these'), null);
  assert.equal(parseBuildIntent('create a shareable insight packet for Startup YC. Do not publish it.'), null);
  assert.equal(parseBuildIntent('No build or mission for now, just help me think through the QA plan.'), null);
  assert.equal(parseBuildIntent('Do not start a build yet. Should normal prompts still work when H70 skills are mandatory?'), null);
  assert.equal(parseBuildIntent('What edge cases should we test in Spawner routing and Telegram relay?'), null);
  assert.equal(
    parseBuildIntent('I want to create a new advanced domain chip with Spark. Help me shape the chip first before creating it.'),
    null
  );
  assert.equal(
    parseBuildIntent(
      'yeah buybacks not for now actually, maybe later, i think we can earn it back from NFTs, if we do sell the NFTs via token, and create a nice structure for it to get hype right after the launch.'
    ),
    null
  );
  assert.equal(
    parseBuildIntent(
      [
        'we already have a big community airdrop that we promised so it needs to be around 20% imo.',
        'and team 10% makes sense',
        'wondering what if we make liquidity dex 5% would it be too small or good enough, and then we could have some more stuff for ecosystem rewards.'
      ].join('\n\n')
    ),
    null
  );
  assert.equal(parseBuildIntent('create a clean structure for the launch hype'), null);
  assert.equal(parseBuildIntent('make a better framework for the NFT sale conversation'), null);
  assert.ok(parseBuildIntent('make a daily report dashboard for investors'));
  assert.ok(parseBuildIntent('Build a private local-first dashboard for memory reports'));
  assert.ok(parseBuildIntent('Build a Spark memory dashboard.'));
  assert.ok(parseBuildIntent('Build a tool for Spark users to manage reminders.'));
  assert.ok(parseBuildIntent('Build an NFT launch planner app with sections for hype ideas and token sale timing.'));
});

test('infers a compact product name for long conceptual build briefs', () => {
  const intent = parseBuildIntent(`Let's build this A narrow tool that takes a founder's messy weekly notes - half-written thoughts, customer quotes, random metrics, meeting takeaways - and turns them into a running strategy document that actually stays current.

The problem I keep seeing: founders do the thinking but lose it. They write something sharp in a notebook or a voice memo, then it's buried. The strategic picture in their head is always richer than anything written down. By the time they need it - for a board meeting, a hire, a pivot decision - they're reconstructing from memory instead of building on what they already figured out.

What I'd want: something that sits underneath their existing note-taking habit, pulls the strategic signal out of the noise, and maintains a living document that reflects what they actually know and believe about their business right now. Not a summary. A sharp, current, usable operating picture.

The bet: most founders already have the raw material. They just need it compressed and kept live.`);

  assert.ok(intent);
  assert.equal(intent.projectPath, null);
  assert.equal(intent.projectName, 'Founder Strategy Ledger');
  assert.equal(intent.buildMode, 'advanced_prd');
  assert.doesNotMatch(intent.projectName, /^A narrow tool that takes/i);
});

test('infers clean product names from paragraph-style build prompts', () => {
  const memoryIntent = parseBuildIntent(`Build a memory quality dashboard. It should test natural recall, stale context avoidance, current-state priority, source-aware recall, and whether Spark can explain where an answer came from.

The first version should be local-first, practical, and focused on showing pass/fail signals without needing a hosted service.`);

  assert.ok(memoryIntent);
  assert.equal(memoryIntent.projectName, 'Memory Quality Dashboard');
  assert.doesNotMatch(memoryIntent.projectName, /^Build a memory/i);

  const chipIntent = parseBuildIntent(`Build a passive Spark bug-recognition domain chip for Mission Control. It should notice recurring relay gaps, degraded health, routing mistakes, and memory failures from local traces, then write Obsidian-friendly diagnostics.`);

  assert.ok(chipIntent);
  assert.equal(chipIntent.projectName, 'Spark Bug Recognition Domain Chip');
  assert.doesNotMatch(chipIntent.projectName, /^Build a passive/i);
});

test('avoids over-naming generic paragraph prompts without domain signal', () => {
  const intent = parseBuildIntent('Build a private local-first dashboard that lets me organize cards, filters, and notes.');

  assert.ok(intent);
  assert.notEqual(intent.projectName, 'Dashboard');
});

test('parses Telegram-style greeting with curly apostrophe and mission link preferences', () => {
  const intent = parseBuildIntent(`Hey Spark, let’s build a real project called Founder Signal Room.

Build it at C:\\Users\\USER\\Desktop\\founder-signal-room.

I want this to be a private, local-first dashboard for founders who collect messy notes during the week and need those notes turned into a living operating picture.

Mission preferences:
Send concise Telegram updates only when planning is ready, a meaningful step starts or finishes, and when the project ships. Include the Mission board first, then send the project canvas link once it is ready.`);

  assert.ok(intent);
  assert.equal(intent.projectPath, 'C:\\Users\\USER\\Desktop\\founder-signal-room');
  assert.equal(intent.projectName, 'Founder Signal Room');
  assert.equal(intent.buildMode, 'advanced_prd');
  assert.match(intent.prd, /living operating picture/);
});

test('build intent wins even when a Spawner board paste is included below the prompt', () => {
  const intent = parseBuildIntent(`Build this at C:\\Users\\USER\\Desktop\\spark-telegram-live-mission: a vanilla-JS static app called Spark Telegram Live Mission. Files: index.html, styles.css, app.js, README.md. No build step.

Make it a playful Mission Control checklist for launching a tiny project. The first screen should show a dark command panel with exactly five launch steps, a progress meter, a mission status label, and a Launch button. Users can check/uncheck steps, progress updates instantly, and state persists in localStorage under key spark-telegram-live-mission:v1. When all five steps are checked and Launch is clicked, show LAUNCHED with a subtle pulse animation. Add a Reset button.
Spawner Board

Running: 1
- mission-1777360657817 | Scaffold the static app shell and mission panel`);

  assert.ok(intent);
  assert.equal(intent.projectPath, 'C:\\Users\\USER\\Desktop\\spark-telegram-live-mission');
  assert.equal(intent.projectName, 'Spark Telegram Live Mission');
  assert.equal(intent.buildMode, 'advanced_prd');
  assert.match(intent.prd, /playful Mission Control checklist/);
});

test('build intent wins over mission update language inside project briefs', () => {
  const intent = parseBuildIntent(`Build this at C:\\Users\\USER\\Desktop\\terminal-chef-clock: a vanilla-JS static app called Terminal Chef Clock. Files: index.html, styles.css, app.js, README.md. No build step.

Make it a playful dark terminal-style cooking timer for developers who cook.

First screen:
- A full-screen terminal dashboard with a huge monospace countdown.
- A tiny “cook log” panel that records timer starts, pauses, resets, and completions.

Behavior:
- Countdown updates every second.
- State persists in localStorage under key terminal-chef-clock:v1.`);

  assert.ok(intent);
  assert.equal(intent.projectPath, 'C:\\Users\\USER\\Desktop\\terminal-chef-clock');
  assert.equal(intent.projectName, 'Terminal Chef Clock');
  assert.match(intent.prd, /Countdown updates every second/);
});
