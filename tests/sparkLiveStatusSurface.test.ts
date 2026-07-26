import assert from 'node:assert/strict';
import {
  parseSparkLiveSummary,
  renderSparkLiveSummary,
  shouldShowRawSparkLiveDetails
} from '../src/sparkLiveStatusSurface';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('renders fresh Spark live summary without raw proof by default', () => {
  const summary = parseSparkLiveSummary(
    [
      '[OK] Spark Live is ready',
      '[OK] spawner-ui: ready | 8 providers listed | 3 configured | workspace=/Users/alchemistab/private-project',
      '[OK] spark-telegram-bot: ready (profile=primary polling=active pid=1234)',
      'Telegram profiles: primary running pid=1234',
      'LLM roles: chat=codex mission=codex'
    ].join('\n'),
    'Runtime processes are running under Spark supervision: spawner-ui, spark-telegram-bot.'
  );

  const reply = renderSparkLiveSummary(summary, { sourceDisclosure: true });

  assert.match(reply, /Spark is healthy right now/);
  assert.match(reply, /fresh runtime state here, not memory/i);
  assert.match(reply, /Spawner is reachable, Telegram is polling, and Mission Control is ready/i);
  assert.match(reply, /no repair action is needed/i);
  assert.doesNotMatch(reply, /Live loop|^\s*•/m);
  assert.doesNotMatch(reply, /Raw proof/);
  assert.doesNotMatch(reply, /\/Users\/alchemistab|pid=1234|8 providers listed|chat=codex/);
});

test('renders raw Spark live proof only when requested', () => {
  const summary = parseSparkLiveSummary(
    [
      '[OK] Spark Live is ready',
      '[OK] spawner-ui: ready | 8 providers listed | 3 configured | workspace=/Users/alchemistab/private-project',
      '[OK] spark-telegram-bot: ready (profile=primary polling=active pid=1234)',
      'Telegram profiles: primary running pid=1234',
      'LLM roles: chat=codex mission=codex'
    ].join('\n'),
    'Runtime processes are running under Spark supervision: spawner-ui, spark-telegram-bot.'
  );

  const reply = renderSparkLiveSummary(summary, { rawDetails: true, includeAction: false });

  assert.match(reply, /Raw proof/);
  assert.match(reply, /8 providers listed, 3 configured/);
  assert.match(reply, /workspace \/Users\/alchemistab\/private-project/);
  assert.match(reply, /polling active \(profile=primary polling=active pid=1234\)/);
  assert.doesNotMatch(reply, /No repair action needed/);
});

test('detects explicit raw Spark live detail requests', () => {
  assert.equal(shouldShowRawSparkLiveDetails('what is the current Spark status?'), false);
  assert.equal(shouldShowRawSparkLiveDetails('show raw provider and supervision details'), true);
  assert.equal(shouldShowRawSparkLiveDetails('give exact pids for live status'), true);
  assert.equal(shouldShowRawSparkLiveDetails('which model is Spark using?'), false);
  assert.equal(shouldShowRawSparkLiveDetails('show status without raw details'), false);
});
