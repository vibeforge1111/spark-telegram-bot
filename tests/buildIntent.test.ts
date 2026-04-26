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
