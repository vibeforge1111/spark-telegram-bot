import assert from 'node:assert/strict';
import {
  buildMissionSurfaceLinks,
  formatMissionHeartbeatForTelegram,
  getTelegramRelayIdentity,
  formatProviderCompletionForTelegram,
  normalizeTelegramMissionLinkPreference,
  normalizeTelegramRelayVerbosity,
  shouldAcceptRelayEventForThisBot
} from '../src/missionRelay';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('formats structured provider JSON as readable Telegram text', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'zai',
    missionId: 'spark-123',
    requestId: 'tg-build-1',
    verbosity: 'normal',
    response: JSON.stringify({
      goal: 'Build a tiny board.',
      summary: 'Implemented the requested static board and verified the files.',
      status: 'completed',
      project_path: 'C:\\Users\\USER\\Desktop\\spark-board',
      changed_files: ['index.html', 'styles.css', 'app.js', 'README.md'],
      verification: [
        'Confirmed index.html loads styles.css and app.js.',
        'Confirmed localStorage usage.',
        'Confirmed README smoke test instructions.'
      ],
      exact_commands: ['Get-ChildItem', 'Get-Content README.md'],
      execution_contract: { done_when: ['Do the thing'] }
    })
  });

  assert.match(message, /Z\.AI GLM finished the build\./);
  assert.match(message, /Implemented the requested static board/);
  assert.match(message, /Project: C:\\Users\\USER\\Desktop\\spark-board/);
  assert.match(message, /Changed files: index\.html, styles\.css, app\.js, README\.md/);
  assert.match(message, /Checks:/);
  assert.doesNotMatch(message, /Mission: spark-123/);
  assert.doesNotMatch(message, /"goal"/);
  assert.doesNotMatch(message, /exact_commands/);
  assert.doesNotMatch(message, /execution_contract/);
});

test('keeps minimal structured provider summaries compact', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'spark-minimal',
    verbosity: 'minimal',
    response: JSON.stringify({
      summary: 'Built the mission cards and canvas sync.',
      status: 'completed',
      changed_files: ['src/kanban.ts', 'src/canvas.ts', 'README.md'],
      verification: ['Unit tests pass.', 'Canvas smoke test passes.']
    })
  });

  assert.match(message, /Codex finished the build\./);
  assert.match(message, /Built the mission cards and canvas sync\./);
  assert.match(message, /Files changed: 3/);
  assert.doesNotMatch(message, /src\/kanban\.ts/);
  assert.doesNotMatch(message, /Checks:/);
});

test('warns cleanly when structured provider output is malformed', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'claude',
    missionId: 'spark-bad-json',
    verbosity: 'normal',
    response: '{ "status": "completed", "summary": "half-written"'
  });

  assert.match(message, /Claude finished, but returned a structured result I could not summarize cleanly\./);
  assert.match(message, /Mission: spark-bad-json/);
  assert.doesNotMatch(message, /"status"/);
});

test('strips hidden reasoning and relay plumbing from freeform provider results', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'spark-clean',
    verbosity: 'normal',
    response: [
      '<think>private chain of thought</think>',
      'Mission ID: spark-clean',
      'Codex created the Kanban cards and synced the canvas.',
      'curl -X POST http://127.0.0.1:8788/spawner-events',
      'Final check passed.'
    ].join('\n')
  });

  assert.match(message, /Codex says:/);
  assert.match(message, /created the Kanban cards and synced the canvas/);
  assert.match(message, /Final check passed/);
  assert.doesNotMatch(message, /private chain of thought/);
  assert.doesNotMatch(message, /curl -X POST/);
  assert.doesNotMatch(message, /Mission ID/);
});

test('supports human verbosity aliases', () => {
  assert.equal(normalizeTelegramRelayVerbosity('bare bones'), 'minimal');
  assert.equal(normalizeTelegramRelayVerbosity('default'), 'normal');
  assert.equal(normalizeTelegramRelayVerbosity('full'), 'verbose');
  assert.equal(normalizeTelegramMissionLinkPreference('telegram only'), 'none');
  assert.equal(normalizeTelegramMissionLinkPreference('mission board'), 'board');
  assert.equal(normalizeTelegramMissionLinkPreference('kanban'), 'board');
  assert.equal(normalizeTelegramMissionLinkPreference('canvas'), 'canvas');
  assert.equal(normalizeTelegramMissionLinkPreference('board and canvas'), 'both');
  assert.equal(normalizeTelegramMissionLinkPreference('kanban and canvas'), 'both');
});

test('builds mission surface links from user preference', () => {
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'none', 'http://127.0.0.1:5173'), []);
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'board', 'http://127.0.0.1:5173'), [
    'Mission spark-123: http://127.0.0.1:5173/kanban'
  ]);
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'canvas', 'http://127.0.0.1:5173'), [
    'Canvas: http://127.0.0.1:5173/canvas'
  ]);
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'both', 'http://127.0.0.1:5173'), [
    'Mission spark-123: http://127.0.0.1:5173/kanban',
    'Canvas: http://127.0.0.1:5173/canvas'
  ]);
});

test('formats mission heartbeat as useful work narration', () => {
  const message = formatMissionHeartbeatForTelegram({
    missionId: 'spark-123',
    goal: 'Build a Spark diagnostic chip.',
    taskLabel: 'the build',
    elapsedMs: 180_000,
    verbosity: 'normal',
    snapshot: {
      missionId: 'spark-123',
      status: 'running',
      lastEventType: 'task_progress',
      lastSummary: '[MissionControl] Progress: Codex: reviewing the telemetry relay and writing focused tests (spark-123).',
      taskName: 'Review relay updates'
    }
  });

  assert.match(message, /Still building/);
  assert.match(message, /reviewing the telemetry relay and writing focused tests/);
  assert.match(message, /Current focus: Review relay updates/);
  assert.doesNotMatch(message, /Elapsed:/);
  assert.doesNotMatch(message, /Mission: spark-123/);
});

test('suppresses low-signal mission heartbeat summaries', () => {
  const message = formatMissionHeartbeatForTelegram({
    missionId: 'spark-123',
    goal: 'Build a Spark diagnostic chip.',
    taskLabel: 'Document launch path',
    elapsedMs: 180_000,
    verbosity: 'verbose',
    snapshot: {
      missionId: 'spark-123',
      status: 'running',
      lastEventType: 'task_progress',
      lastSummary: '[MissionControl] Progress: Z.AI: Document launch path is running (spark-123).',
      taskName: 'Document launch path'
    }
  });

  assert.match(message, /No new high-signal checkpoint/);
  assert.match(message, /Elapsed: about 3 min/);
  assert.match(message, /Mission: spark-123/);
  assert.doesNotMatch(message, /Z\.AI: Document launch path is running/);
});

test('ignores mission relay events targeted at another Telegram profile', () => {
  const originalPort = process.env.TELEGRAM_RELAY_PORT;
  const originalProfile = process.env.SPARK_TELEGRAM_PROFILE;
  process.env.TELEGRAM_RELAY_PORT = '8788';
  process.env.SPARK_TELEGRAM_PROFILE = '';

  try {
    assert.equal(shouldAcceptRelayEventForThisBot({
      type: 'mission_started',
      missionId: 'spark-1',
      data: { telegramRelay: { port: 8789, profile: 'spark-agi' } }
    }), false);
    assert.equal(shouldAcceptRelayEventForThisBot({
      type: 'mission_started',
      missionId: 'spark-1',
      data: { telegramRelay: { port: 8788, profile: 'default' } }
    }), true);
  } finally {
    if (originalPort === undefined) delete process.env.TELEGRAM_RELAY_PORT;
    else process.env.TELEGRAM_RELAY_PORT = originalPort;
    if (originalProfile === undefined) delete process.env.SPARK_TELEGRAM_PROFILE;
    else process.env.SPARK_TELEGRAM_PROFILE = originalProfile;
  }
});

test('accepts legacy flat Telegram relay target fields for this bot only', () => {
  const originalPort = process.env.TELEGRAM_RELAY_PORT;
  const originalProfile = process.env.SPARK_TELEGRAM_PROFILE;
  process.env.TELEGRAM_RELAY_PORT = '8788';
  process.env.SPARK_TELEGRAM_PROFILE = 'default';

  try {
    assert.equal(shouldAcceptRelayEventForThisBot({
      type: 'mission_started',
      missionId: 'spark-legacy',
      data: { telegramRelayPort: '8788', telegramRelayProfile: 'default' }
    }), true);
    assert.equal(shouldAcceptRelayEventForThisBot({
      type: 'mission_started',
      missionId: 'spark-legacy',
      data: { telegramRelayPort: '8788', telegramRelayProfile: 'other-profile' }
    }), false);
  } finally {
    if (originalPort === undefined) delete process.env.TELEGRAM_RELAY_PORT;
    else process.env.TELEGRAM_RELAY_PORT = originalPort;
    if (originalProfile === undefined) delete process.env.SPARK_TELEGRAM_PROFILE;
    else process.env.SPARK_TELEGRAM_PROFILE = originalProfile;
  }
});

test('reports this relay identity from env', () => {
  const originalPort = process.env.TELEGRAM_RELAY_PORT;
  const originalProfile = process.env.SPARK_TELEGRAM_PROFILE;
  process.env.TELEGRAM_RELAY_PORT = '8789';
  process.env.SPARK_TELEGRAM_PROFILE = 'spark-agi';

  try {
    assert.deepEqual(getTelegramRelayIdentity(), { port: 8789, profile: 'spark-agi' });
  } finally {
    if (originalPort === undefined) delete process.env.TELEGRAM_RELAY_PORT;
    else process.env.TELEGRAM_RELAY_PORT = originalPort;
    if (originalProfile === undefined) delete process.env.SPARK_TELEGRAM_PROFILE;
    else process.env.SPARK_TELEGRAM_PROFILE = originalProfile;
  }
});
