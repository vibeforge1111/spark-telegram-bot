import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  approvePendingMissionLesson,
  buildMissionLessonCandidates,
  buildMissionSurfaceLinks,
  formatMissionHeartbeatForTelegram,
  formatProgressMessageForTelegram,
  getTelegramRelayIdentity,
  formatProviderCompletionForTelegram,
  formatMissionRelayStateMessageForTelegram,
  isCompletionDeliveryCachedForTests,
  isMissionRelayPaused,
  markMissionRelayCancelled,
  markMissionRelayPaused,
  markMissionRelayResumed,
  normalizeTelegramMissionLinkPreference,
  normalizeTelegramRelayVerbosity,
  relayEventMatchesSubscription,
  resetMissionRelayDeliveryStateForTests,
  resolveReadyProjectOpenLinkForTests,
  sendFetchedCompletionSummaryForTests,
  shouldAcknowledgeRelayWithoutTelegramDelivery,
  shouldAcceptRelayEventForThisBot,
  shouldSkipDuplicateForTests,
  shouldSuppressMissionHandoff,
  shouldStopMissionHeartbeat
} from '../src/missionRelay';
import { resetJsonStateForTests } from '../src/jsonState';

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

  assert.match(message, /✨/);
  assert.match(message, /Implemented the requested static board/);
  assert.match(message, /Open it here:\nhttp:\/\/127\.0\.0\.1:3333\/preview\/[A-Za-z0-9_-]+\/index\.html/);
  assert.match(message, /Checked it; the important checks passed\./);
  assert.match(message, /(?:polish anything|tweak next|tune anything|adjusted)/);
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

  assert.match(message, /✨/);
  assert.match(message, /Built the mission cards and canvas sync\./);
  assert.doesNotMatch(message, /Files changed: 3/);
  assert.doesNotMatch(message, /src\/kanban\.ts/);
  assert.doesNotMatch(message, /Checks:/);
  assert.doesNotMatch(message, /Mission: spark-minimal/);
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

  assert.match(message, /✨/);
  assert.match(message, /Built the dashboard and verified the main workflow/);
  assert.match(message, /Open it here:\nhttp:\/\/127\.0\.0\.1:3333\/preview\/[A-Za-z0-9_-]+\/index\.html/);
  assert.match(message, /Checked it; the app opened cleanly\./);
  assert.doesNotMatch(message, /Verification commands run/);
  assert.doesNotMatch(message, /npm run|playwright|Changed files|README\.md/);
  assert.doesNotMatch(message, /Mission: spark-verbose/);
  assert.doesNotMatch(message, /Request: tg-build-verbose/);
});

test('freeform completion fallback does not repeat raw mission ids', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'spark-freeform',
    verbosity: 'verbose',
    response: 'Finished the tiny single-file game and verified it opens from the preview.'
  });

  assert.match(message, /Finished the tiny single-file game/);
  assert.doesNotMatch(message, /Mission: spark-freeform/);
});

test('completion summaries hide raw Spawner mission ids from no-edit smoke handoffs', () => {
  const freeform = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'spark-1778835482267',
    verbosity: 'normal',
    response: 'Codex: PUBLISHING_MACHINE_SMOKE_OK\n\nMission: spark-1778835482267'
  });
  const structured = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'spark-1778835482267',
    verbosity: 'normal',
    response: JSON.stringify({
      status: 'completed',
      summary: 'Codex: PUBLISHING_MACHINE_SMOKE_OK\n\nMission: spark-1778835482267'
    })
  });

  assert.match(freeform, /PUBLISHING_MACHINE_SMOKE_OK/);
  assert.match(structured, /PUBLISHING_MACHINE_SMOKE_OK/);
  assert.doesNotMatch(freeform, /Mission: spark-1778835482267/);
  assert.doesNotMatch(structured, /Mission: spark-1778835482267/);
  assert.doesNotMatch(freeform, /spark-1778835482267/);
  assert.doesNotMatch(structured, /spark-1778835482267/);
});

test('no-edit probe completions include requested Mission Control inspect links', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'spark-1778935217687',
    verbosity: 'normal',
    goal: 'Run a tiny no-edit Mission Control diagnostic through Spawner. It should only prove routing/status and reply with SPARK_E2E_NO_EDIT_OK_2. Do not create files, do not edit files, and share Canvas/Kanban/View Execution if it starts.',
    response: 'Codex: SPARK_E2E_NO_EDIT_OK_2'
  });

  assert.match(message, /SPARK_E2E_NO_EDIT_OK_2/);
  assert.match(message, /Mission Control/);
  assert.match(message, /Canvas: http:\/\/127\.0\.0\.1:3333\/canvas\?mission=spark-1778935217687/);
  assert.match(message, /Kanban: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=spark-1778935217687/);
  assert.match(message, /View execution: http:\/\/127\.0\.0\.1:3333\/canvas\?mission=spark-1778935217687/);
  assert.doesNotMatch(message, /^Mission: spark-1778935217687$/m);
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

  assert.match(message, /(?:⚠️ That run hit a blocker|⚠️ The build got blocked|⚠️ Spark could not finish that one|⚠️ This one needs a quick look)\./);
  assert.match(message, /final browser verification failed/);
  assert.match(message, /Open it here:\nhttp:\/\/127\.0\.0\.1:3333\/preview\/[A-Za-z0-9_-]+\/index\.html/);
  assert.match(message, /Some checks passed, but one still needs attention\./);
  assert.doesNotMatch(message, /Files updated/);
  assert.doesNotMatch(message, /npm run smoke/);
  assert.doesNotMatch(message, /"status"/);
  assert.doesNotMatch(message, /execution_contract/);
  assert.doesNotMatch(message, /exact_commands/);
});

test('treats blocked freeform provider completions as mission failures', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'mission-blocked-before-start',
    requestId: 'tg-build-blocked',
    verbosity: 'normal',
    response: [
      'Blocked before task start.',
      'I could not load the mandatory H70 skills because http://127.0.0.1:3333 is unreachable.',
      'Per the mission instructions, I did not create files.',
      'The filesystem sandbox is read-only.'
    ].join(' ')
  });

  assert.match(message, /(?:⚠️ That run hit a blocker|⚠️ The build got blocked|⚠️ Spark could not finish that one|⚠️ This one needs a quick look)\./);
  assert.match(message, /Blocked before task start/);
  assert.doesNotMatch(message, /\b(?:mandatory|required)\s+H70/i);
  assert.doesNotMatch(message, /filesystem sandbox is read-only/i);
  assert.doesNotMatch(message, /✨ Spark/);
  assert.doesNotMatch(message, /shipped|result ready|wrapped this one/i);
});

test('warns cleanly when structured provider output is malformed', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'claude',
    missionId: 'spark-bad-json',
    verbosity: 'normal',
    response: '{ "status": "completed", "summary": "half-written"'
  });

  assert.match(message, /⚠️ Spark finished, but the final payload needs a look\./);
  assert.match(message, /• Claude returned structured output I could not summarize cleanly\./);
  assert.doesNotMatch(message, /Mission: spark-bad-json/);
  assert.doesNotMatch(message, /"status"/);
});

test('uses neutral completion copy when there is no preview link', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'spark-no-preview-link',
    verbosity: 'normal',
    openLink: null,
    response: 'NO_PREVIEW_LINK_OK'
  });

  assert.match(message, /✨/);
  assert.match(message, /NO_PREVIEW_LINK_OK/);
  assert.doesNotMatch(message, /Open it here:/);
  assert.doesNotMatch(message, /something you can open|build ready|finished the build|ready to open|run is ready/i);
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

  assert.match(message, /✨/);
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

  assert.match(message, /✨/);
  assert.match(message, /Shipped/);
  assert.match(message, /Full-viewport Three\.js orbital forge/);
  assert.match(message, /Checked it; the app opened cleanly\./);
  assert.doesNotMatch(message, /Headless Chrome desktop\/mobile/);
  assert.match(message, /Open it here:\nhttp:\/\/127\.0\.0\.1:3333\/preview\/[A-Za-z0-9_-]+\/index\.html/);
  assert.doesNotMatch(message, /\[index\.html\]/);
  assert.doesNotMatch(message, /<\/c\/Users/);
  assert.doesNotMatch(message, /Mission: mission-orbit/);
});

test('summarizes inline verification without leaking command text', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'mission-inline-checks',
    verbosity: 'normal',
    response: [
      'Built the one-screen smoke page.',
      'Verification passed: - npm run build passed and generated dist/ - npm test passed: win path, failure path, mobile smoke.'
    ].join('\n')
  });

  assert.match(message, /Built the one-screen smoke page\./);
  assert.match(message, /\n\nChecked it; the build and smoke tests passed\./);
  assert.doesNotMatch(message, /npm run build/);
  assert.doesNotMatch(message, /generated dist/);
  assert.doesNotMatch(message, /win path, failure path/);
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
    'Mission board: http://127.0.0.1:3333/kanban?mission=spark-123'
  ]);
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'canvas', 'http://127.0.0.1:3333'), [
    'Canvas: http://127.0.0.1:3333/canvas?mission=spark-123'
  ]);
  assert.deepEqual(buildMissionSurfaceLinks('spark-123', 'both', 'http://127.0.0.1:3333'), [
    'Mission board: http://127.0.0.1:3333/kanban?mission=spark-123',
    'Canvas: http://127.0.0.1:3333/canvas?mission=spark-123'
  ]);
  assert.deepEqual(buildMissionSurfaceLinks('mission-1777', 'both', 'http://127.0.0.1:3333', 'tg-build-1'), [
    'Mission board: http://127.0.0.1:3333/kanban?mission=mission-1777',
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
      'Mission board: https://spark-spawner-test.up.railway.app/kanban?mission=spark-123'
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
    assert.doesNotMatch(message, /127\.0\.0\.1:3333/);
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

  assert.match(message || '', /(?:🛠️ Spark is on it|🛠️ The run is moving|🛠️ Spark picked it up|🛠️ We are underway)\./);
  assert.match(message || '', /keep the noise low and only ping when something useful changes/);
  assert.match(message || '', /Mission board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=spark-123/);
  assert.doesNotMatch(message || '', /^Spawned work$/m);
  assert.doesNotMatch(message || '', /^Paired surfaces$/m);
  assert.doesNotMatch(message || '', /Canvas:/);
  assert.doesNotMatch(message || '', /\/missions/);
});

test('pause and resume relay messages avoid raw mission id clutter', () => {
  const paused = formatMissionRelayStateMessageForTelegram({
    state: 'paused',
    missionId: 'spark-123',
    links: buildMissionSurfaceLinks('spark-123', 'board')
  });
  const resumed = formatMissionRelayStateMessageForTelegram({
    state: 'resumed',
    missionId: 'spark-123',
    links: buildMissionSurfaceLinks('spark-123', 'board')
  });

  assert.match(paused, /Run paused\./);
  assert.match(paused, /I will hold Telegram handoffs until it resumes\./);
  assert.match(paused, /Mission board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=spark-123/);
  assert.doesNotMatch(paused, /Mission: spark-123/);
  assert.doesNotMatch(paused, /^Move$/m);
  assert.match(resumed, /Run resumed\./);
  assert.match(resumed, /Telegram handoffs are back on\./);
  assert.doesNotMatch(resumed, /Mission: spark-123/);
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

  assert.match(message || '', /(?:🛠️ Spark is on it|🛠️ The run is moving|🛠️ Spark picked it up|🛠️ We are underway)\./);
  assert.match(message || '', /Mission board: http:\/\/127\.0\.0\.1:3333\/kanban\?mission=spark-123/);
  assert.match(message || '', /Builder and Spawner are attached behind the scenes\./);
  assert.doesNotMatch(message || '', /^Paired surfaces$/m);
  assert.doesNotMatch(message || '', /Canvas:/);
  assert.doesNotMatch(message || '', /prd-tg-build-1/);
  assert.doesNotMatch(message || '', /Build this at/);
  assert.doesNotMatch(message || '', /Target operating-system folder/);
});

test('normal verbosity suppresses task starts and noisy progress', () => {
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

  assert.equal(started, null);
  assert.equal(noisyProgress, null);
});

test('task pack starts stay quiet instead of announcing every future step', () => {
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

  assert.equal(message, null);
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

test('task start labels stay suppressed instead of exposing node slugs', () => {
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

  assert.equal(message, null);
});

test('verbose task completion messages stay compact and human readable', () => {
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
    'verbose',
    'board'
  );

  assert.match(message || '', /(?:finished localStorage and saved sprites|✨ finished localStorage and saved sprites|small win: finished localStorage and saved sprites|nice, finished localStorage and saved sprites)\./);
  assert.match(message || '', /localStorage and saved sprites/);
  assert.doesNotMatch(message || '', /Milestone complete/);
  assert.doesNotMatch(message || '', /node-3/);
  assert.doesNotMatch(message || '', /MissionControl/);
});

test('suppresses provider-only task completion chatter after the final result', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'task_completed',
      missionId: 'spark-no-edit',
      taskId: 'codex',
      taskName: 'codex',
      source: 'codex',
      data: { provider: 'codex' }
    },
    {
      missionId: 'spark-no-edit',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-no-edit',
      goal: 'Run a no-edit Spawner proof.',
      createdAt: '2026-05-14T00:00:00Z'
    },
    'verbose',
    'board'
  );

  assert.equal(message, null);
});

test('task completion updates rotate as natural one-line progress', () => {
  const labels = [
    'Create the app shell and project structure',
    'Implement the core interaction and state',
    'Polish the visual system and documentation',
    'Verify the completed build'
  ];

  const messages = labels.map((label, index) => formatProgressMessageForTelegram(
    {
      type: 'task_completed',
      missionId: 'spark-rotation',
      taskId: `task-${index + 1}`,
      taskName: label,
      data: {}
    },
    {
      missionId: 'spark-rotation',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-build-rotation',
      goal: 'Build a tiny page.',
      createdAt: '2026-04-26T00:00:00Z'
    },
    'verbose',
    'board'
  ) || '');

  assert.match(messages[0], /created the app shell and project structure/);
  assert.match(messages[1], /implemented the core interaction and state/);
  assert.match(messages[2], /polished the visual system and documentation/);
  assert.match(messages[3], /verified the completed build/);
  assert.ok(messages.every((message) => !message.includes('\n')), messages.join('\n---\n'));
  assert.ok(messages.every((message) => !/Milestone complete/.test(message)), messages.join('\n---\n'));
  assert.ok(new Set(messages).size >= 2, messages.join('\n---\n'));
  assert.equal(messages.filter((message) => message.startsWith('small win:')).length, 1, messages.join('\n---\n'));
});

test('fast-lane build-and-check completion reads like one natural action', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'task_completed',
      missionId: 'spark-fast-lane',
      taskId: 'task-1',
      taskName: 'Build and check the single-file static page',
      data: {}
    },
    {
      missionId: 'spark-fast-lane',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-fast-lane',
      goal: 'Build a tiny page.',
      createdAt: '2026-04-26T00:00:00Z'
    },
    'verbose',
    'board'
  ) || '';

  assert.match(message, /nice, built and checked the single file static page/);
  assert.doesNotMatch(message, /^✨/);
  assert.doesNotMatch(message, /built and check the/i);
});

test('fast-lane build-and-check progress avoids duplicate working-on blocks', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'progress',
      missionId: 'spark-fast-lane-progress',
      taskId: 'task-1',
      taskName: 'Build and check the single-file static page',
      message: 'Running the single-file checks now.',
      data: {}
    },
    {
      missionId: 'spark-fast-lane-progress',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-fast-lane-progress',
      goal: 'Build a tiny page.',
      createdAt: '2026-04-26T00:00:00Z'
    },
    'verbose',
    'board'
  ) || '';

  assert.match(message, /Running the single-file checks now/);
  assert.doesNotMatch(message, /Working on:/);
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

  assert.match(message || '', /(?:small update|quick progress|a bit more progress|small win)\./);
  assert.doesNotMatch(message || '', /this part moved/);
  assert.doesNotMatch(message || '', /Spark has a real update|The build has new signal/);
  assert.doesNotMatch(message || '', /Working on: Wire launch sequence/);
  assert.doesNotMatch(message || '', /🛠️/);
  assert.match(message || '', /added persisted launch state/);
  assert.doesNotMatch(message || '', /MissionControl/);
  assert.doesNotMatch(message || '', /spark-123/);
});

test('verbose progress skips generic focus when the concrete change is clear', () => {
  const message = formatProgressMessageForTelegram(
    {
      type: 'task_progress',
      missionId: 'spark-static',
      taskName: 'Create the app shell and project structure',
      message: 'Static shell files are present and app.js syntax check passed.',
      data: {}
    },
    {
      missionId: 'spark-static',
      chatId: '8319079055',
      userId: '8319079055',
      requestId: 'tg-build-static',
      goal: 'Build a tiny static page.',
      createdAt: '2026-04-26T00:00:00Z'
    },
    'verbose',
    'board'
  );

  assert.match(message || '', /Static shell files are present/);
  assert.doesNotMatch(message || '', /Working on: Create the app shell and project structure/);
});

test('neutralizes provider-prefixed no-text completion placeholders', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'mission-empty-prefixed',
    verbosity: 'normal',
    response: 'Codex: completed without a text response'
  });

  assert.match(message, /The run finished, but it did not send useful final notes back\./);
  assert.doesNotMatch(message, /Codex:\s*completed without a text response/i);
  assert.doesNotMatch(message, /Mission: mission-empty-prefixed/);
});

test('provider no-text placeholder with preview link becomes a clean handoff', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'codex',
    missionId: 'mission-empty-linked',
    verbosity: 'normal',
    openLink: 'http://127.0.0.1:3333/preview/demo/index.html',
    response: 'Codex: completed without a text response'
  });

  assert.match(message, /✨/);
  assert.match(message, /Open it here:\nhttp:\/\/127\.0\.0\.1:3333\/preview\/demo\/index\.html/);
  assert.match(message, /(?:polish anything|tweak next|tune anything|adjusted)/);
  assert.doesNotMatch(message, /completed without a text response/i);
  assert.doesNotMatch(message, /did not send useful final notes/i);
  assert.doesNotMatch(message, /Mission: mission-empty-linked/);
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

test('builds reusable mission lesson candidates without saving completion logs', () => {
  const candidates = buildMissionLessonCandidates({
    goal: 'Build the mission-memory loop.',
    providerLabel: 'codex',
    response: JSON.stringify({
      summary: 'Staged mission lessons for approval before memory writes.',
      status: 'completed',
      changed_files: ['src/missionRelay.ts', 'tests/missionRelayFormatting.test.ts'],
      verification: ['Mission relay test passed.']
    })
  });

  assert.equal(candidates.length, 3);
  assert.match(candidates[0], /^Workflow lesson:/);
  assert.match(candidates[0], /Build the mission-memory loop/);
  assert.match(candidates[1], /^Verification lesson:/);
  assert.match(candidates[1], /verification evidence/);
  assert.match(candidates[2], /^Evidence lesson:/);
  assert.match(candidates[2], /changed-file or preview evidence/);
  assert.doesNotMatch(candidates.join('\n'), /Completed Spawner mission/);
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

  assert.match(message, /(?:still working|still with it|still moving|still shaping this)\./);
  assert.doesNotMatch(message, /🛠️/);
  assert.match(message, /What changed: reviewing the telemetry relay and writing focused tests/);
  assert.match(message, /reviewing the telemetry relay and writing focused tests/);
  assert.doesNotMatch(message, /Working on: Review relay updates/);
  assert.match(message, /something actually changes/);
  assert.doesNotMatch(message, /^Focus$/m);
  assert.doesNotMatch(message, /Elapsed:/);
  assert.doesNotMatch(message, /Mission: spark-123/);
});

test('dedupes heartbeat summary when focus repeats the same work', () => {
  const message = formatMissionHeartbeatForTelegram({
    missionId: 'spark-dedupe',
    goal: 'Build a tiny static app.',
    taskLabel: 'the build',
    elapsedMs: 180_000,
    verbosity: 'normal',
    snapshot: {
      missionId: 'spark-dedupe',
      status: 'running',
      lastEventType: 'task_progress',
      lastSummary: 'Creating the static app shell and direct-launch file structure.',
      taskName: 'Create the app shell and project structure'
    }
  });

  assert.match(message, /What changed: Creating the static app shell and direct-launch file structure\./);
  assert.doesNotMatch(message, /Current focus:/);
  assert.doesNotMatch(message, /Working on: Create the app shell and project structure/);
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

  assert.match(message, /I will only nudge you when something actually changes\./);
  assert.doesNotMatch(message, /Elapsed:/);
  assert.doesNotMatch(message, /Mission: spark-123/);
  assert.doesNotMatch(message, /Z\.AI: Document launch path is running/);
  assert.doesNotMatch(message, /Working on:/);
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

  assert.match(message, /I will only nudge you when something actually changes\./);
  assert.doesNotMatch(message, /working through 4 task pack/);
  assert.doesNotMatch(message, /estimate adjusting/);
  assert.doesNotMatch(message, /Working on:/);
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

test('cancelled missions suppress delayed build handoffs', () => {
  resetMissionRelayDeliveryStateForTests();
  assert.equal(shouldSuppressMissionHandoff('mission-123'), false);

  markMissionRelayCancelled('mission-123');

  assert.equal(shouldSuppressMissionHandoff('mission-123'), true);
  assert.equal(shouldSuppressMissionHandoff('mission-456'), false);
  resetMissionRelayDeliveryStateForTests();
});

test('paused missions suppress handoffs until resume', () => {
  resetMissionRelayDeliveryStateForTests();
  assert.equal(isMissionRelayPaused('mission-paused'), false);
  assert.equal(shouldSuppressMissionHandoff('mission-paused'), false);

  markMissionRelayPaused('mission-paused');

  assert.equal(isMissionRelayPaused('mission-paused'), true);
  assert.equal(shouldSuppressMissionHandoff('mission-paused'), true);

  markMissionRelayResumed('mission-paused');

  assert.equal(isMissionRelayPaused('mission-paused'), false);
  assert.equal(shouldSuppressMissionHandoff('mission-paused'), false);
  resetMissionRelayDeliveryStateForTests();
});

test('cancelled missions clear paused handoff suppression state', () => {
  resetMissionRelayDeliveryStateForTests();
  markMissionRelayPaused('mission-cancelled-after-pause');
  markMissionRelayCancelled('mission-cancelled-after-pause');

  assert.equal(isMissionRelayPaused('mission-cancelled-after-pause'), false);
  assert.equal(shouldSuppressMissionHandoff('mission-cancelled-after-pause'), true);
  resetMissionRelayDeliveryStateForTests();
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

  assert.equal(relayEventMatchesSubscription({
    type: 'task_completed',
    missionId: 'spark-1'
  }, subscription), true);

  assert.equal(relayEventMatchesSubscription({
    type: 'task_completed',
    missionId: 'spark-2'
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
  assert.match(message, /Preview is not ready yet\. The board can show the run meanwhile\./);
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

async function asyncTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

void (async () => {
  await asyncTest('rejects unreachable preview links before Telegram completion handoff', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response('missing', { status: 404 })) as unknown as typeof fetch;

      const link = await resolveReadyProjectOpenLinkForTests(
        'http://127.0.0.1:3333/preview/default/index.html',
        'C:\\Users\\USER\\.spark\\workspaces\\default'
      );

      assert.equal(link, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await asyncTest('does not cache fetched completion summaries until Telegram delivery succeeds', async () => {
    const originalPromptEnv = process.env.SPARK_MISSION_LESSON_PROMPTS;
    try {
      delete process.env.SPARK_MISSION_LESSON_PROMPTS;
      resetJsonStateForTests();
      process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-mission-delivery-test-'));
      resetMissionRelayDeliveryStateForTests();
      const subscription = {
        missionId: 'spark-delivery-retry',
        chatId: '12345',
        userId: '67890',
        requestId: 'req-delivery-retry',
        goal: 'Build a retryable completion.',
        createdAt: '2026-05-05T00:00:00Z'
      };
      const event = {
        type: 'mission_completed' as const,
        missionId: subscription.missionId
      };
      const completion = {
        providerLabel: 'codex',
        response: JSON.stringify({
          summary: 'Built the retryable completion handoff.',
          status: 'completed'
        })
      };
      const failingBot = {
        telegram: {
          sendMessage: async () => {
            throw new Error('telegram unavailable');
          }
        }
      };

      await assert.rejects(
        sendFetchedCompletionSummaryForTests(failingBot as any, 12345, subscription, event, 'normal', completion),
        /telegram unavailable/
      );
      assert.equal(isCompletionDeliveryCachedForTests(subscription.missionId), false);

      const sent: string[] = [];
      const workingBot = {
        telegram: {
          sendMessage: async (_chatId: number, message: string) => {
            sent.push(message);
          }
        }
      };
      const chunks = await sendFetchedCompletionSummaryForTests(
        workingBot as any,
        12345,
        subscription,
        event,
        'normal',
        completion
      );

      assert.equal(chunks, 1);
      assert.equal(sent.length, 1);
      assert.doesNotMatch(sent.join('\n'), /Mission lesson candidate/);
      assert.doesNotMatch(sent.join('\n'), /I will not save the completion log as memory automatically/);
      assert.equal(isCompletionDeliveryCachedForTests(subscription.missionId), true);
    } finally {
      if (originalPromptEnv === undefined) delete process.env.SPARK_MISSION_LESSON_PROMPTS;
      else process.env.SPARK_MISSION_LESSON_PROMPTS = originalPromptEnv;
    }
  });

  await asyncTest('adds trace audit metadata to fetched completion handoffs', async () => {
    const originalPromptEnv = process.env.SPARK_MISSION_LESSON_PROMPTS;
    try {
      delete process.env.SPARK_MISSION_LESSON_PROMPTS;
      resetJsonStateForTests();
      process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-mission-trace-extra-test-'));
      resetMissionRelayDeliveryStateForTests();
      const subscription = {
        missionId: 'spark-trace-extra',
        chatId: '12345',
        userId: '67890',
        requestId: 'req-trace-extra',
        traceRef: 'trace-ref-extra',
        goal: 'Carry trace metadata to outbound audit.',
        createdAt: '2026-05-11T00:00:00Z'
      };
      const event = {
        type: 'mission_completed' as const,
        missionId: subscription.missionId
      };
      const extras: Array<Record<string, unknown> | undefined> = [];
      const bot = {
        telegram: {
          sendMessage: async (_chatId: number, _message: string, extra?: Record<string, unknown>) => {
            extras.push(extra);
          }
        }
      };

      const chunks = await sendFetchedCompletionSummaryForTests(
        bot as any,
        12345,
        subscription,
        event,
        'normal',
        {
          providerLabel: 'codex',
          response: JSON.stringify({
            summary: 'Built the trace metadata handoff.',
            status: 'completed'
          })
        }
      );

      assert.equal(chunks, 1);
      assert.deepEqual(extras[0]?.__sparkTraceContext, {
        route: 'mission_relay',
        command: 'mission_relay',
        replyKind: 'mission_completion',
        requestId: subscription.requestId,
        traceRef: subscription.traceRef,
        missionId: subscription.missionId
      });
    } finally {
      if (originalPromptEnv === undefined) delete process.env.SPARK_MISSION_LESSON_PROMPTS;
      else process.env.SPARK_MISSION_LESSON_PROMPTS = originalPromptEnv;
    }
  });

  await asyncTest('suppresses concurrent fetched completion summary duplicates', async () => {
    const originalPromptEnv = process.env.SPARK_MISSION_LESSON_PROMPTS;
    try {
      delete process.env.SPARK_MISSION_LESSON_PROMPTS;
      resetJsonStateForTests();
      process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-mission-dedupe-test-'));
      resetMissionRelayDeliveryStateForTests();
      const subscription = {
        missionId: 'spark-concurrent-completion',
        chatId: '12345',
        userId: '67890',
        requestId: 'req-concurrent-completion',
        goal: 'Reply exactly once.',
        createdAt: '2026-05-05T00:00:00Z'
      };
      const event = {
        type: 'mission_completed' as const,
        missionId: subscription.missionId
      };
      const completion = {
        providerLabel: 'codex',
        response: JSON.stringify({
          summary: 'CONCURRENT_COMPLETION_OK',
          status: 'completed'
        })
      };
      let releaseFirstSend!: () => void;
      const firstSendStarted = new Promise<void>((resolve) => {
        releaseFirstSend = resolve;
      });
      const sent: string[] = [];
      const bot = {
        telegram: {
          sendMessage: async (_chatId: number, message: string) => {
            sent.push(message);
            await firstSendStarted;
          }
        }
      };

      const first = sendFetchedCompletionSummaryForTests(
        bot as any,
        12345,
        subscription,
        event,
        'normal',
        completion
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      const second = await sendFetchedCompletionSummaryForTests(
        bot as any,
        12345,
        subscription,
        event,
        'normal',
        completion
      );
      releaseFirstSend();
      const firstChunks = await first;

      assert.equal(firstChunks, 1);
      assert.equal(second, 0);
      assert.equal(sent.length, 1);
      assert.equal(isCompletionDeliveryCachedForTests(subscription.missionId), true);
    } finally {
      if (originalPromptEnv === undefined) delete process.env.SPARK_MISSION_LESSON_PROMPTS;
      else process.env.SPARK_MISSION_LESSON_PROMPTS = originalPromptEnv;
    }
  });

  await asyncTest('cancelled missions suppress fetched completion summaries', async () => {
    resetMissionRelayDeliveryStateForTests();
    const subscription = {
      missionId: 'spark-cancelled-completion',
      chatId: '12345',
      userId: '67890',
      requestId: 'req-cancelled-completion',
      goal: 'Build something then cancel it.',
      createdAt: '2026-05-07T00:00:00Z'
    };
    const sent: string[] = [];
    markMissionRelayCancelled(subscription.missionId);

    const chunks = await sendFetchedCompletionSummaryForTests(
      {
        telegram: {
          sendMessage: async (_chatId: number, message: string) => {
            sent.push(message);
          }
        }
      } as any,
      12345,
      subscription,
      { type: 'mission_completed' as const, missionId: subscription.missionId },
      'normal',
      {
        providerLabel: 'codex',
        response: JSON.stringify({ summary: 'This late handoff should stay suppressed.', status: 'completed' })
      }
    );

    assert.equal(chunks, 0);
    assert.equal(sent.length, 0);
    assert.equal(isCompletionDeliveryCachedForTests(subscription.missionId), false);
    resetMissionRelayDeliveryStateForTests();
  });

  await asyncTest('paused missions suppress fetched completion summaries until resumed', async () => {
    resetMissionRelayDeliveryStateForTests();
    const subscription = {
      missionId: 'spark-paused-completion',
      chatId: '12345',
      userId: '67890',
      requestId: 'req-paused-completion',
      goal: 'Pause before completion.',
      createdAt: '2026-05-07T00:00:00Z'
    };
    const sent: string[] = [];
    const bot = {
      telegram: {
        sendMessage: async (_chatId: number, message: string) => {
          sent.push(message);
        }
      }
    };

    markMissionRelayPaused(subscription.missionId);
    const suppressedChunks = await sendFetchedCompletionSummaryForTests(
      bot as any,
      12345,
      subscription,
      { type: 'mission_completed' as const, missionId: subscription.missionId },
      'normal',
      {
        providerLabel: 'codex',
        response: JSON.stringify({ summary: 'This paused handoff should wait.', status: 'completed' })
      }
    );

    assert.equal(suppressedChunks, 0);
    assert.equal(sent.length, 0);
    assert.equal(isCompletionDeliveryCachedForTests(subscription.missionId), false);

    markMissionRelayResumed(subscription.missionId);
    const deliveredChunks = await sendFetchedCompletionSummaryForTests(
      bot as any,
      12345,
      subscription,
      { type: 'mission_completed' as const, missionId: subscription.missionId },
      'normal',
      {
        providerLabel: 'codex',
        response: JSON.stringify({ summary: 'This resumed handoff can send.', status: 'completed' })
      }
    );

    assert.equal(deliveredChunks, 1);
    assert.equal(sent.length, 1);
    assert.equal(isCompletionDeliveryCachedForTests(subscription.missionId), true);
    resetMissionRelayDeliveryStateForTests();
  });

  await asyncTest('mission lesson prompt can be enabled explicitly for experiments', async () => {
    const originalPromptEnv = process.env.SPARK_MISSION_LESSON_PROMPTS;
    try {
      process.env.SPARK_MISSION_LESSON_PROMPTS = '1';
      resetJsonStateForTests();
      process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-mission-lesson-prompt-test-'));
      resetMissionRelayDeliveryStateForTests();
      const subscription = {
        missionId: 'spark-lesson-prompt',
        chatId: '12345',
        userId: '67890',
        requestId: 'req-lesson-prompt',
        goal: 'Build mission-memory approval prompt.',
        createdAt: '2026-05-05T00:00:00Z'
      };
      const sent: string[] = [];
      await sendFetchedCompletionSummaryForTests(
        {
          telegram: {
            sendMessage: async (_chatId: number, message: string) => {
              sent.push(message);
            }
          }
        } as any,
        12345,
        subscription,
        { type: 'mission_completed' as const, missionId: subscription.missionId },
        'normal',
        {
          providerLabel: 'codex',
          response: JSON.stringify({ summary: 'Built prompt-gated mission lessons.', status: 'completed' })
        }
      );

      assert.equal(sent.length, 2);
      assert.match(sent[1], /Mission memory needs your call/);
      assert.match(sent[1], /\/remember 1/);
    } finally {
      if (originalPromptEnv === undefined) delete process.env.SPARK_MISSION_LESSON_PROMPTS;
      else process.env.SPARK_MISSION_LESSON_PROMPTS = originalPromptEnv;
    }
  });

  await asyncTest('mission lesson approval writes only the approved lesson', async () => {
    resetJsonStateForTests();
    process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-mission-lesson-test-'));
    resetMissionRelayDeliveryStateForTests();
    const subscription = {
      missionId: 'spark-lesson-approval',
      chatId: '12345',
      userId: '67890',
      requestId: 'req-lesson-approval',
      goal: 'Build mission-memory approval.',
      createdAt: '2026-05-05T00:00:00Z'
    };
    const event = {
      type: 'mission_completed' as const,
      missionId: subscription.missionId
    };
    const sent: string[] = [];
    const bot = {
      telegram: {
        sendMessage: async (_chatId: number, message: string) => {
          sent.push(message);
        }
      }
    };

    await sendFetchedCompletionSummaryForTests(bot as any, 12345, subscription, event, 'normal', {
      providerLabel: 'codex',
      response: JSON.stringify({
        summary: 'Built approval-gated mission lessons.',
        status: 'completed',
        verification: ['Approval test passed.']
      })
    });
    const reply = await approvePendingMissionLesson(subscription.userId, '2');

    assert.ok(reply);
    assert.match(reply || '', /Saved mission lesson/);
    assert.match(reply || '', /Source: mission spark-lesson-approval/);
    assert.doesNotMatch(reply || '', /Completed Spawner mission/);
    const secondReply = await approvePendingMissionLesson(subscription.userId, '1');
    assert.equal(secondReply, null);
  });
})();
