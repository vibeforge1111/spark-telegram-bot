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
  assert.equal(intent.projectName, 'spark direct probe');
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

test('ignores paths outside the configured workspace root', () => {
  const intent = parseBuildIntent('build this at D:\\tmp\\outside: a tiny HTML file called Outside Test.');

  assert.ok(intent);
  assert.equal(intent.projectPath, null);
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

test('does not turn exploratory conversation into an accidental build', () => {
  const intent = parseBuildIntent(
    'can you help me think through whether we should build a mission control dashboard before we touch the canvas?'
  );

  assert.equal(intent, null);
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
