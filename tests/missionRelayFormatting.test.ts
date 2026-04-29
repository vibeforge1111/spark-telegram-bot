import assert from 'node:assert/strict';
import {
  buildMissionSurfaceLinks,
  formatMissionHeartbeatForTelegram,
  formatProgressMessageForTelegram,
  getTelegramRelayIdentity,
  formatProviderCompletionForTelegram,
  normalizeTelegramMissionLinkPreference,
  normalizeTelegramRelayVerbosity,
  relayEventMatchesSubscription,
  shouldAcceptRelayEventForThisBot,
  shouldStopMissionHeartbeat
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
  assert.match(message, /Preview: http:\/\/127\.0\.0\.1:5173\/preview\/[A-Za-z0-9_-]+\/index\.html/);
  assert.match(message, /Files updated: 4/);
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

test('formats structured provider failures without raw JSON noise', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'spark-failed',
    requestId: 'tg-build-failed',
    verbosity: 'normal',
    response: JSON.stringify({
      status: 'failed',
      summary: 'The app shell was created, but final browser verification failed.',
      project_path: 'C:\\Users\\USER\\Desktop\\spark-failed-build',
      changed_files: ['index.html', 'app.js'],
      verification: [
        'File check passed.',
        'Browser smoke failed because the launch button was missing.'
      ],
      exact_commands: ['npm run smoke'],
      execution_contract: { done_when: ['All checks pass'] }
    })
  });

  assert.match(message, /Codex reported a failure\./);
  assert.match(message, /final browser verification failed/);
  assert.match(message, /Preview: http:\/\/127\.0\.0\.1:5173\/preview\/[A-Za-z0-9_-]+\/index\.html/);
  assert.match(message, /Files updated: 2/);
  assert.match(message, /Browser smoke failed/);
  assert.doesNotMatch(message, /"status"/);
  assert.doesNotMatch(message, /execution_contract/);
  assert.doesNotMatch(message, /exact_commands/);
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

  assert.match(message, /Codex finished the build\./);
  assert.match(message, /created the Kanban cards and synced the canvas/);
  assert.doesNotMatch(message, /private chain of thought/);
  assert.doesNotMatch(message, /curl -X POST/);
  assert.doesNotMatch(message, /Mission ID/);
});

test('summarizes freeform Codex build output without dumping file links', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'mission-orbit',
    verbosity: 'normal',
    response: [
      'Done. Built the direct static app in `C:\\Users\\USER\\Desktop\\spark-orbit-forge` with exactly the requested files:',
      '',
      '- [index.html](</c/Users/USER/Desktop/spark-orbit-forge/index.html>)',
      '- [styles.css](</c/Users/USER/Desktop/spark-orbit-forge/styles.css>)',
      '',
      'What shipped:',
      '- Full-viewport Three.js orbital forge from CDN, no bundler/build config.',
      '- Compact dark mission-control overlay with add spark, speed, glow, satellite count, reset, and status.',
      '',
      'Verification passed:',
      '- `node --check app.js`',
      '- Headless Chrome desktop/mobile visual checks showed nonblank scene and usable overlay.',
      '',
      'Mission: mission-orbit'
    ].join('\n')
  });

  assert.match(message, /Codex finished the build\./);
  assert.match(message, /What shipped:/);
  assert.match(message, /Full-viewport Three\.js orbital forge/);
  assert.match(message, /Checks passed:/);
  assert.match(message, /Headless Chrome desktop\/mobile/);
  assert.match(message, /Preview: http:\/\/127\.0\.0\.1:5173\/preview\/[A-Za-z0-9_-]+\/index\.html/);
  assert.doesNotMatch(message, /\[index\.html\]/);
  assert.doesNotMatch(message, /<\/c\/Users/);
  assert.doesNotMatch(message, /Mission: mission-orbit/);
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
    'Mission spark-123: http://127.0.0.1:5173/kanban?mission=spark-123'
  ]);
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'canvas', 'http://127.0.0.1:5173'), [
    'Canvas: http://127.0.0.1:5173/canvas?mission=spark-123'
  ]);
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'both', 'http://127.0.0.1:5173'), [
    'Mission spark-123: http://127.0.0.1:5173/kanban?mission=spark-123',
    'Canvas: http://127.0.0.1:5173/canvas?mission=spark-123'
  ]);
  assert.deepEqual(buildMissionSurfaceLinks('mission-1777', 'both', 'http://127.0.0.1:5173', 'tg-build-1'), [
    'Mission mission-1777: http://127.0.0.1:5173/kanban?mission=mission-1777',
    'Canvas: http://127.0.0.1:5173/canvas?pipeline=prd-tg-build-1&mission=mission-1777'
  ]);
});

test('mission start update links the mission once through kanban', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'mission_started',
      missionId: 'spark-123',
      taskName: 'Codex',
      data: {}
    },
    {
      missionId: 'spark-123',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-build-1',
      goal: 'Build a tiny board.',
      createdAt: '2026-04-26T00:00:00Z'
    },
    'normal',
    'board'
  );

  assert.match(message || '', /Spark started the run/);
  assert.match(message || '', /useful checkpoints/);
  assert.match(message || '', /Mission spark-123: http:\/\/127\.0\.0\.1:5173\/kanban\?mission=spark-123/);
  assert.doesNotMatch(message || '', /\/missions/);
});

test('verbose mission start does not paste the whole build brief', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'mission_started',
      missionId: 'spark-123',
      data: {}
    },
    {
      missionId: 'spark-123',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-build-1',
      goal: 'Build this at C:\\Users\\USER\\Desktop\\huge-project with many implementation details.',
      createdAt: '2026-04-26T00:00:00Z'
    },
    'verbose',
    'both'
  );

  assert.match(message || '', /Spark started the run/);
  assert.doesNotMatch(message || '', /Build this at/);
  assert.doesNotMatch(message || '', /Target operating-system folder/);
});

test('normal verbosity announces task starts but suppresses noisy progress', () => {
  const subscription = {
    missionId: 'spark-123',
    chatId: '8319079055',
    userId: '8319079055',
    requestId: 'tg-build-1',
    goal: 'Build a tiny board.',
    createdAt: '2026-04-26T00:00:00Z'
  };

  const started = formatProgressMessageForTelegram(
    {
      type: 'task_started',
      missionId: 'spark-123',
      taskName: 'Create static shell',
      data: {}
    },
    subscription,
    'normal',
    'board'
  );
  const noisyProgress = formatProgressMessageForTelegram(
    {
      type: 'task_progress',
      missionId: 'spark-123',
      taskName: 'Create static shell',
      message: '[MissionControl] Progress: Z.AI GLM: Create static shell is running (spark-123).',
      data: {}
    },
    subscription,
    'normal',
    'board'
  );

  assert.match(started || '', /Task started\nCreate static shell/);
  assert.equal(noisyProgress, null);
});

test('task start labels are human-readable instead of node slugs', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'task_started',
      missionId: 'spark-123',
      taskId: 'node-2-task-task-2-threejs-sprite-forge-core',
      taskName: 'node-2-task-task-2-threejs-sprite-forge-core',
      data: {}
    },
    {
      missionId: 'spark-123',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-build-1',
      goal: 'Build a tiny board.',
      createdAt: '2026-04-26T00:00:00Z'
    },
    'normal',
    'board'
  );

  assert.match(message || '', /Task 2 started/);
  assert.match(message || '', /Three\.js sprite forge core/);
  assert.doesNotMatch(message || '', /node-2/);
});

test('verbose progress turns useful relay summaries into readable Telegram updates', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'task_progress',
      missionId: 'spark-123',
      taskName: 'Wire launch sequence',
      message:
        '[MissionControl] Progress: Codex: added persisted launch state, reset controls, and final pulse animation (spark-123).',
      data: {}
    },
    {
      missionId: 'spark-123',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-build-1',
      goal: 'Build a tiny board.',
      createdAt: '2026-04-26T00:00:00Z'
    },
    'verbose',
    'board'
  );

  assert.match(message || '', /Update: Wire launch sequence/);
  assert.match(message || '', /added persisted launch state/);
  assert.doesNotMatch(message || '', /MissionControl/);
  assert.doesNotMatch(message || '', /spark-123/);
});

test('suppresses internal skill and dispatch chatter', () => {
  const subscription = {
    missionId: 'spark-123',
    chatId: '8319079055',
    userId: '8319079055',
    requestId: 'tg-build-1',
    goal: 'Build a tiny board.',
    createdAt: '2026-04-26T00:00:00Z'
  };

  assert.equal(formatProgressMessageForTelegram(
    {
      type: 'dispatch_started',
      missionId: 'spark-123',
      message: 'Spark is assigning the work.',
      data: {}
    },
    subscription,
    'verbose',
    'board'
  ), null);

  assert.equal(formatProgressMessageForTelegram(
    {
      type: 'progress',
      missionId: 'spark-123',
      taskName: 'node-1-task-task-1-static-shell',
      message: 'SKILL_LOADED:node-1-task-task-1-static-shell:none',
      data: {}
    },
    subscription,
    'verbose',
    'board'
  ), null);
});

test('normal mission completion waits for the handoff summary', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'mission_completed',
      missionId: 'spark-123',
      data: {}
    },
    {
      missionId: 'spark-123',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-build-1',
      goal: 'Build a tiny board.',
      createdAt: '2026-04-26T00:00:00Z'
    },
    'normal',
    'board'
  );

  assert.equal(message, null);
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
  assert.match(message, /Latest checkpoint:/);
  assert.match(message, /reviewing the telemetry relay and writing focused tests/);
  assert.match(message, /Current focus:\nReview relay updates/);
  assert.match(message, /meaningful changes/);
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

  assert.match(message, /No new checkpoint yet/);
  assert.doesNotMatch(message, /Elapsed:/);
  assert.match(message, /Mission: spark-123/);
  assert.doesNotMatch(message, /Z\.AI: Document launch path is running/);
});

test('suppresses provider stopwatch heartbeat summaries', () => {
  const message = formatMissionHeartbeatForTelegram({
    missionId: 'spark-123',
    goal: 'Build a Spark diagnostic chip.',
    taskLabel: 'Create app shell',
    elapsedMs: 180_000,
    verbosity: 'verbose',
    snapshot: {
      missionId: 'spark-123',
      status: 'running',
      lastEventType: 'task_progress',
      lastSummary: '[MissionControl] Progress: OpenAI Codex is working through 4 task pack (2m 20s elapsed; estimate adjusting) (spark-123).',
      taskName: 'Create app shell'
    }
  });

  assert.match(message, /No new checkpoint yet/);
  assert.doesNotMatch(message, /working through 4 task pack/);
  assert.doesNotMatch(message, /estimate adjusting/);
});

test('stops mission heartbeats for terminal or stale runs', () => {
  assert.equal(shouldStopMissionHeartbeat({
    elapsedMs: 60_000,
    staleMs: 30 * 60_000,
    snapshot: { missionId: 'spark-1', status: 'completed' }
  }), true);

  assert.equal(shouldStopMissionHeartbeat({
    elapsedMs: 31 * 60_000,
    staleMs: 30 * 60_000,
    snapshot: { missionId: 'spark-2', status: 'running' }
  }), true);

  assert.equal(shouldStopMissionHeartbeat({
    elapsedMs: 10 * 60_000,
    staleMs: 30 * 60_000,
    snapshot: { missionId: 'spark-3', status: 'running' }
  }), false);
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
      data: { telegramRelay: { port: 8789, profile: 'primary' } }
    }), false);
    assert.equal(shouldAcceptRelayEventForThisBot({
      type: 'mission_started',
      missionId: 'spark-1',
      data: { telegramRelay: { port: 8788, profile: 'primary' } }
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
  process.env.SPARK_TELEGRAM_PROFILE = 'spark-agi';

  try {
    assert.equal(shouldAcceptRelayEventForThisBot({
      type: 'mission_started',
      missionId: 'spark-legacy',
      data: { telegramRelayPort: '8788', telegramRelayProfile: 'spark-agi' }
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

test('requires relay events to match registered Telegram identity', () => {
  const subscription = {
    missionId: 'spark-1',
    chatId: '12345',
    userId: '67890',
    requestId: 'req-1',
    goal: 'Build a safer relay',
    createdAt: new Date().toISOString()
  };

  assert.equal(relayEventMatchesSubscription({
    type: 'task_completed',
    missionId: 'spark-1',
    data: { chatId: '12345', userId: '67890' }
  }, subscription), true);

  assert.equal(relayEventMatchesSubscription({
    type: 'task_completed',
    missionId: 'spark-1',
    data: { chatId: '12345', userId: '67891' }
  }, subscription), false);

  assert.equal(relayEventMatchesSubscription({
    type: 'task_completed',
    missionId: 'spark-1',
    data: { chatId: '12345' }
  }, subscription), false);
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
