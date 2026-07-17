import assert from 'node:assert/strict';
import axios from 'axios';
import { parseSpawnerBoardNaturalIntent } from '../src/conversationIntent';
import { renderTelegramHelp, renderTelegramStartWelcome } from '../src/onboardingSurface';
import { spawner } from '../src/spawner';

type AsyncTest = () => Promise<void> | void;

async function test(name: string, fn: AsyncTest): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const originalGet = axios.get;

void (async () => {
  await test('keeps allowed admin /start progressive and conversational', () => {
    const reply = renderTelegramStartWelcome({ name: 'Ada', allowed: true, admin: true });
    assert.match(reply, /Hey Ada/i);
    assert.match(reply, /\/diagnose/);
    assert.match(reply, /\/run/);
    assert.match(reply, /\/help/);
    assert.doesNotMatch(reply, /Memory Commands|Spawner Control|Mission\s*\/\s*Provider\s*\/\s*Move/i);
    assert.ok(reply.split('\n').length <= 6, reply);
  });

  await test('keeps private first-use guidance scoped to identity setup', () => {
    const reply = renderTelegramStartWelcome({ name: 'Ada', allowed: false, admin: false });
    assert.match(reply, /private/i);
    assert.match(reply, /\/myid/);
    assert.doesNotMatch(reply, /\/run/);
  });

  await test('moves the dense command reference to /help with access-aware commands', () => {
    const memberHelp = renderTelegramHelp({ admin: false });
    const adminHelp = renderTelegramHelp({ admin: true });
    assert.match(memberHelp, /\/remember/);
    assert.doesNotMatch(memberHelp, /\/access\s+<|\/mission\s+<|Spawner Control/);
    assert.match(adminHelp, /Spawner Control/);
    assert.match(adminHelp, /\/mission\s+<status\|pause\|resume\|kill>/);
  });

  await test('routes generic active-task status language to live board truth', () => {
    assert.equal(parseSpawnerBoardNaturalIntent("how's my mission going?"), 'active_missions');
    assert.equal(parseSpawnerBoardNaturalIntent('what is the status of my task?'), 'active_missions');
    assert.equal(parseSpawnerBoardNaturalIntent('how is my application going?'), null);
  });

  await test('resolves the latest mission id from the current board', async () => {
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [{ missionId: 'spark-live-2', status: 'running', lastUpdated: '2026-07-17T07:00:00Z' }],
          paused: [],
          completed: [{ missionId: 'spark-old-1', status: 'completed', lastUpdated: '2026-07-17T06:00:00Z' }],
          failed: [],
          cancelled: [],
          created: []
        }
      }
    });
    assert.equal(await spawner.latestMissionId(), 'spark-live-2');
  });

  await test('returns no mission id when the live board is empty or unavailable', async () => {
    (axios as any).get = async () => ({ data: { board: { running: [], paused: [], completed: [], failed: [], cancelled: [], created: [] } } });
    assert.equal(await spawner.latestMissionId(), null);
    (axios as any).get = async () => { throw new Error('offline'); };
    assert.equal(await spawner.latestMissionId(), null);
  });
})().finally(() => {
  (axios as any).get = originalGet;
});
