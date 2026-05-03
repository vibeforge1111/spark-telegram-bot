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
  resetMissionRelayDeliveryStateForTests,
  shouldAcknowledgeRelayWithoutTelegramDelivery,
  shouldAcceptRelayEventForThisBot,
  shouldSkipDuplicateForTests,
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

  assert.match(message, /✨ Spark/);
  assert.match(message, /Implemented the requested static board/);
  assert.match(message, /Open it here:\nhttp:\/\/127\.0\.0\.1:5555\/preview\/[A-Za-z0-9_-]+\/index\.html/);
  assert.match(message, /Quality checks passed/);
  assert.match(message, /keep polishing/);
  assert.doesNotMatch(message, /Files updated/);
  assert.doesNotMatch(message, /npm run|node --check|Get-ChildItem|Checks:/);
  assert.doesNotMatch(message, /Mission: spark-123/);
  assert.doesNotMatch(message, /"goal"/);
  assert.doesNotMatch(message, /exact_commands/);
  assert.doesNotMatch(message, /execution_contract/);
});

test('acknowledges relay events without Telegram delivery in smoke mode', () => {
  assert.equal(shouldAcknowledgeRelayWithoutTelegramDelivery({ TELEGRAM_SMOKE_MODE: '1' } as NodeJS.ProcessEnv), true);
  assert.equal(shouldAcknowledgeRelayWithoutTelegramDelivery({ TELEGRAM_SMOKE_MODE: '0' } as NodeJS.ProcessEnv), false);
  assert.equal(shouldAcknowledgeRelayWithoutTelegramDelivery({} as NodeJS.ProcessEnv), false);
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

  assert.match(message, /✨ Spark/);
  assert.match(message, /Built the mission cards and canvas sync\./);
  assert.doesNotMatch(message, /Files changed: 3/);
  assert.doesNotMatch(message, /src\/kanban\.ts/);
  assert.doesNotMatch(message, /Checks:/);
});

test('keeps verbose completion summaries readable and non-console-like', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'spark-verbose',
    requestId: 'tg-build-verbose',
    verbosity: 'verbose',
    response: JSON.stringify({
      summary: 'Built the dashboard and verified the main workflow.',
      status: 'completed',
      project_path: 'C:\\Users\\USER\\Desktop\\spark-readable-build',
      changed_files: ['index.html', 'styles.css', 'app.js', 'README.md'],
      verification: ['Type check passed.', 'Browser smoke passed.', 'Persistence smoke passed.'],
      exact_commands: ['npm run check', 'npm run test:run', 'npx playwright test']
    })
  });

  assert.match(message, /Spark/);
  assert.match(message, /Built the dashboard and verified the main workflow/);
  assert.match(message, /Open it here:\nhttp:\/\/127\.0\.0\.1:5555\/preview\/[A-Za-z0-9_-]+\/index\.html/);
  assert.match(message, /Quality checks passed \(3 checks\)\./);
  assert.doesNotMatch(message, /Verification commands run/);
  assert.doesNotMatch(message, /npm run|playwright|Changed files|README\.md/);
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

  assert.match(message, /(?:This run needs attention|Something blocked the mission|The build hit a problem|Spark could not finish this run)\./);
  assert.match(message, /final browser verification failed/);
  assert.match(message, /Open it here:\nhttp:\/\/127\.0\.0\.1:5555\/preview\/[A-Za-z0-9_-]+\/index\.html/);
  assert.match(message, /Quality checks passed/);
  assert.doesNotMatch(message, /Files updated/);
  assert.doesNotMatch(message, /npm run smoke/);
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

  assert.match(message, /✨ Spark/);
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

  assert.match(message, /✨ Spark/);
  assert.match(message, /What shipped:/);
  assert.match(message, /Full-viewport Three\.js orbital forge/);
  assert.match(message, /Quality checks passed/);
  assert.doesNotMatch(message, /Headless Chrome desktop\/mobile/);
  assert.match(message, /Open it here:\nhttp:\/\/127\.0\.0\.1:5555\/preview\/[A-Za-z0-9_-]+\/index\.html/);
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
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'none', 'http://127.0.0.1:3333'), []);
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'board', 'http://127.0.0.1:3333'), [
    'Mission spark-123: http://127.0.0.1:3333/kanban?mission=spark-123'
  ]);
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'canvas', 'http://127.0.0.1:3333'), [
    'Canvas: http://127.0.0.1:3333/canvas?mission=spark-123'
  ]);
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'both', 'http://127.0.0.1:3333'), [
    'Mission spark-123: http://127.0.0.1:3333/kanban?mission=spark-123',
    'Canvas: http://127.0.0.1:3333/canvas?mission=spark-123'
  ]);
  assert.deepEqual(buildMissionSurfaceLinks('mission-1777', 'both', 'http://127.0.0.1:3333', 'tg-build-1'), [
    'Mission mission-1777: http://127.0.0.1:3333/kanban?mission=mission-1777',
    'Canvas: http://127.0.0.1:3333/canvas?pipeline=prd-tg-build-1&mission=mission-1777'
  ]);
});

test('uses the public Spawner URL for mission surface links when configured', () => {
  const originalInternalUrl = process.env.SPAWNER_UI_URL;
  const originalPublicUrl = process.env.SPAWNER_UI_PUBLIC_URL;
  process.env.SPAWNER_UI_URL = 'http://spawner-ui.railway.internal:3000';
  process.env.SPAWNER_UI_PUBLIC_URL = 'https://spark-spawner-test.up.railway.app/';

  try {
    assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'board'), [
      'Mission spark-123: https://spark-spawner-test.up.railway.app/kanban?mission=spark-123'
    ]);
  } finally {
    if (originalInternalUrl === undefined) delete process.env.SPAWNER_UI_URL;
    else process.env.SPAWNER_UI_URL = originalInternalUrl;
    if (originalPublicUrl === undefined) delete process.env.SPAWNER_UI_PUBLIC_URL;
    else process.env.SPAWNER_UI_PUBLIC_URL = originalPublicUrl;
  }
});

test('uses the public Spawner URL for generated project preview links when configured', () => {
  const originalPreviewUrl = process.env.SPARK_PROJECT_PREVIEW_URL;
  const originalInternalUrl = process.env.SPAWNER_UI_URL;
  const originalPublicUrl = process.env.SPAWNER_UI_PUBLIC_URL;
  delete process.env.SPARK_PROJECT_PREVIEW_URL;
  process.env.SPAWNER_UI_URL = 'http://spawner-ui.railway.internal:3000';
  process.env.SPAWNER_UI_PUBLIC_URL = 'https://spark-spawner-test.up.railway.app/';

  try {
    const message = formatProviderCompletionForTelegram({
      providerLabel: 'zai',
      missionId: 'spark-preview-public',
      verbosity: 'normal',
      response: JSON.stringify({
        summary: 'Built the hosted page.',
        status: 'completed',
        project_path: '/data/workspaces/mission-1-cafe'
      })
    });

    assert.match(message, /Open it here:\nhttps:\/\/spark-spawner-test\.up\.railway\.app\/preview\/[A-Za-z0-9_-]+\/index\.html/);
    assert.doesNotMatch(message, /127\.0\.0\.1:5555/);
    assert.doesNotMatch(message, /spawner-ui\.railway\.internal/);
  } finally {
    if (originalPreviewUrl === undefined) delete process.env.SPARK_PROJECT_PREVIEW_URL;
    else process.env.SPARK_PROJECT_PREVIEW_URL = originalPreviewUrl;
    if (originalInternalUrl === undefined) delete process.env.SPAWNER_UI_URL;
    else process.env.SPAWNER_UI_URL = originalInternalUrl;
    if (originalPublicUrl === undefined) delete process.env.SPAWNER_UI_PUBLIC_URL;
    else process.env.SPAWNER_UI_PUBLIC_URL = originalPublicUrl;
  }
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

  assert.match(message || '', /(?:Spark is on it|The run is moving|Spark picked it up|We are underway)\./);
  assert.match(message || '', /Planning has started/);
  assert.match(message || '', /canvas link once the PRD and canvas are ready/);
  assert.match(message || '', /only ping when something useful changes/);
  assert.match(message || '', /Mission spark-123: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=spark-123/);
  assert.doesNotMatch(message || '', /Canvas:/);
  assert.doesNotMatch(message || '', /\/missions/);
});

test('suppresses late mission start after canvas tasks are already planned', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'mission_started',
      missionId: 'mission-planned',
      taskName: 'Create the static app shell',
      data: {
        requestId: 'tg-build-1',
        plannedTasks: [
          { title: 'Create the static app shell' },
          { title: 'Implement the core interaction and state' }
        ]
      }
    },
    {
      missionId: 'mission-planned',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-build-1',
      goal: 'Build a cafe page.',
      createdAt: '2026-05-03T00:00:00Z'
    },
    'normal',
    'board'
  );

  assert.equal(message, null);
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

  assert.match(message || '', /(?:Spark is on it|The run is moving|Spark picked it up|We are underway)\./);
  assert.match(message || '', /Mission spark-123: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=spark-123/);
  assert.match(message || '', /canvas link once the PRD and canvas are ready/);
  assert.doesNotMatch(message || '', /Canvas:/);
  assert.doesNotMatch(message || '', /prd-tg-build-1/);
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

  assert.match(started || '', /(?:Step(?: \d+)? (?:started|is moving|is underway)|Now working on step)/);
  assert.match(started || '', /Create static shell/);
  assert.equal(noisyProgress, null);
});

test('task pack starts explain the batch without announcing every future step', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'task_started',
      missionId: 'spark-pack',
      taskId: 'task-1-shell',
      taskName: 'Create the project shell',
      source: 'codex',
      data: {
        provider: 'codex',
        assignedTaskIds: ['task-1-shell', 'task-2-scene', 'task-3-controls', 'task-4-docs'],
        assignedTaskCount: 4
      }
    },
    {
      missionId: 'spark-pack',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-build-pack',
      goal: 'Build a sprite creator.',
      createdAt: '2026-04-26T00:00:00Z'
    },
    'normal',
    'board'
  );

  assert.match(message || '', /Create the project shell/);
  assert.match(message || '', /working through 4 build steps/);
  assert.doesNotMatch(message || '', /task-2-scene/);
});

test('suppresses same-provider task start bursts until a task finishes', () => {
  resetMissionRelayDeliveryStateForTests();

  assert.equal(shouldSkipDuplicateForTests({
    type: 'task_started',
    missionId: 'spark-burst',
    taskName: 'Plan the build',
    source: 'codex',
    data: { provider: 'codex' }
  }), false);

  assert.equal(shouldSkipDuplicateForTests({
    type: 'task_started',
    missionId: 'spark-burst',
    taskName: 'Build the UI',
    source: 'codex',
    data: { provider: 'codex' }
  }), true);

  assert.equal(shouldSkipDuplicateForTests({
    type: 'task_completed',
    missionId: 'spark-burst',
    taskName: 'Plan the build',
    source: 'codex',
    data: { provider: 'codex' }
  }), false);

  assert.equal(shouldSkipDuplicateForTests({
    type: 'task_started',
    missionId: 'spark-burst',
    taskName: 'Build the UI',
    source: 'codex',
    data: { provider: 'codex' }
  }), false);
});

test('allows different providers to start different tasks in parallel', () => {
  resetMissionRelayDeliveryStateForTests();

  assert.equal(shouldSkipDuplicateForTests({
    type: 'task_started',
    missionId: 'spark-parallel',
    taskName: 'Build frontend',
    source: 'codex',
    data: { provider: 'codex' }
  }), false);

  assert.equal(shouldSkipDuplicateForTests({
    type: 'task_started',
    missionId: 'spark-parallel',
    taskName: 'Build backend',
    source: 'claude',
    data: { provider: 'claude' }
  }), false);
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

  assert.match(message || '', /(?:Step 2 started|Step 2 is moving|Now working on step 2|Step 2 is underway)/);
  assert.match(message || '', /Three\.js sprite forge core/);
  assert.doesNotMatch(message || '', /node-2/);
});

test('task completion messages stay compact and human readable', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'task_completed',
      missionId: 'spark-123',
      taskId: 'node-3-task-task-3-localstorage-and-saved-sprites',
      taskName: 'node-3-task-task-3-localstorage-and-saved-sprites',
      data: {}
    },
    {
      missionId: 'spark-123',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-build-1',
      goal: 'Build a sprite creator.',
      createdAt: '2026-04-26T00:00:00Z'
    },
    'normal',
    'board'
  );

  assert.match(message || '', /(?:Step 3 done|Step 3 landed|Step 3 is complete|Finished step 3)/);
  assert.match(message || '', /localStorage and saved sprites/);
  assert.doesNotMatch(message || '', /node-3/);
  assert.doesNotMatch(message || '', /MissionControl/);
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

  assert.match(message || '', /(?:Checkpoint|Small update|Progress note|Good signal)/);
  assert.match(message || '', /Wire launch sequence/);
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

  assert.match(message, /(?:Still working|Still with it|The run is still active|No handoff yet)\./);
  assert.match(message, /Checkpoint:/);
  assert.match(message, /reviewing the telemetry relay and writing focused tests/);
  assert.match(message, /Focus:\nReview relay updates/);
  assert.match(message, /new signal/);
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

test('suppresses hosted preview generation progress in Telegram', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'task_progress',
      missionId: 'spark-preview',
      taskName: 'zai',
      message: 'Z.AI GLM is generating compact project files for the hosted preview.',
      data: {
        kind: 'artifact_generation',
        provider: 'zai',
        providerLabel: 'Z.AI GLM'
      }
    },
    {
      missionId: 'spark-preview',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-preview-1',
      goal: 'Build a cafe page.',
      createdAt: '2026-05-03T00:00:00Z'
    },
    'normal',
    'board'
  );

  assert.equal(message, null);
});

test('completion can withhold an unreachable hosted preview link', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'zai',
    missionId: 'spark-preview-pending',
    verbosity: 'normal',
    openLink: null,
    previewPending: true,
    response: JSON.stringify({
      summary: 'Built the cafe landing page.',
      status: 'completed',
      project_path: '/data/workspaces/mission-1-cafe'
    })
  });

  assert.match(message, /Built the cafe landing page\./);
  assert.match(message, /Preview is still preparing\. Use the Mission board for now\./);
  assert.doesNotMatch(message, /Open it here:/);
  assert.doesNotMatch(message, /\/preview\//);
});

test('reports this relay identity from env', () => {
  const originalPort = process.env.TELEGRAM_RELAY_PORT;
  const originalProfile = process.env.SPARK_TELEGRAM_PROFILE;
  const originalUrl = process.env.TELEGRAM_RELAY_URL;
  process.env.TELEGRAM_RELAY_PORT = '8789';
  process.env.SPARK_TELEGRAM_PROFILE = 'spark-agi';
  process.env.TELEGRAM_RELAY_URL = 'http://spark-telegram-bot.railway.internal:8789';

  try {
    assert.deepEqual(getTelegramRelayIdentity(), {
      port: 8789,
      profile: 'spark-agi',
      url: 'http://spark-telegram-bot.railway.internal:8789/spawner-events'
    });
  } finally {
    if (originalPort === undefined) delete process.env.TELEGRAM_RELAY_PORT;
    else process.env.TELEGRAM_RELAY_PORT = originalPort;
    if (originalProfile === undefined) delete process.env.SPARK_TELEGRAM_PROFILE;
    else process.env.SPARK_TELEGRAM_PROFILE = originalProfile;
    if (originalUrl === undefined) delete process.env.TELEGRAM_RELAY_URL;
    else process.env.TELEGRAM_RELAY_URL = originalUrl;
  }
});
