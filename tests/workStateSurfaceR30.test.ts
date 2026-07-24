import assert from 'node:assert/strict';
import axios from 'axios';
import { inferMissionFromRecentContext, parseSpawnerBoardNaturalIntent } from '../src/conversationIntent';
import {
  postInstallFirstRunPath,
  renderPostInstallFirstRunReply,
  renderTelegramHelp,
  renderTelegramStartWelcome
} from '../src/onboardingSurface';
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

  await test('gives one safe next action after installation', () => {
    assert.equal(postInstallFirstRunPath('I just installed Spark for Telegram, what next?'), 'telegram');
    assert.equal(postInstallFirstRunPath('I finished installing Spark in the local CLI'), 'cli');
    assert.equal(postInstallFirstRunPath('I just installed Spark, what should I do next?'), 'clarify');
    assert.match(renderPostInstallFirstRunReply('telegram'), /^Send \/start/);
    assert.match(renderPostInstallFirstRunReply('cli'), /spark verify --onboarding/);
    assert.match(renderPostInstallFirstRunReply('cli'), /keep any raw output local/i);
    assert.doesNotMatch(renderPostInstallFirstRunReply('telegram'), /spark verify/);
  });

  await test('moves the dense command reference to /help with access-aware commands', () => {
    const memberHelp = renderTelegramHelp({ admin: false });
    const adminHelp = renderTelegramHelp({ admin: true });
    assert.match(memberHelp, /\/remember/);
    assert.match(memberHelp, /\/resonance/);
    assert.match(memberHelp, /\/voice/);
    assert.doesNotMatch(memberHelp, /\/access\s+<|\/mission\s+<|Spawner Control/);
    assert.match(adminHelp, /Spawner Control/);
    assert.match(adminHelp, /\/schedule/);
    assert.match(adminHelp, /\/schedules/);
    assert.match(adminHelp, /\/chip create/);
    assert.match(adminHelp, /\/loop/);
    assert.match(adminHelp, /\/recursive/);
    assert.match(adminHelp, /\/process/);
    assert.match(adminHelp, /\/reflect/);
    assert.match(adminHelp, /\/mission\s+<status\|pause\|resume\|kill>/);
    assert.match(adminHelp, /\/authority/);
    assert.match(adminHelp, /\/capabilities/);
    assert.match(adminHelp, /\/ledger/);
    assert.match(adminHelp, /\/runminimax/);
    assert.match(adminHelp, /\/runall/);
    assert.match(adminHelp, /\/workspace/);
    assert.match(adminHelp, /\/route_probe/);
    assert.doesNotMatch(adminHelp, /\/agent_context|\/operating_context/);
  });

  await test('routes generic active-task status language to live board truth', () => {
    assert.equal(parseSpawnerBoardNaturalIntent("how's my mission going?"), 'active_missions');
    assert.equal(parseSpawnerBoardNaturalIntent('what is the status of my task?'), 'active_missions');
    assert.equal(parseSpawnerBoardNaturalIntent('how is my application going?'), null);
  });

  await test('resolves the latest mission id from the current board', async () => {
    const now = Date.now();
    (axios as any).get = async () => ({
      data: {
        board: {
          running: [{ missionId: 'spark-live-2', status: 'running', lastUpdated: new Date(now - 60_000).toISOString() }],
          paused: [],
          completed: [{ missionId: 'spark-old-1', status: 'completed', lastUpdated: new Date(now - 120_000).toISOString() }],
          failed: [],
          cancelled: [],
          created: []
        }
      }
    });
    assert.equal(await spawner.latestMissionId(), 'spark-live-2');
  });

  await test('distinguishes an empty live board from an unavailable board', async () => {
    (axios as any).get = async () => ({ data: { board: { running: [], paused: [], completed: [], failed: [], cancelled: [], created: [] } } });
    assert.equal(await spawner.latestMissionId(), null);
    (axios as any).get = async () => { throw new Error('offline'); };
    await assert.rejects(() => spawner.latestMissionId(), /offline/);
  });

  await test('does not turn a bare retry phrase into a new mission from stale conversation text', () => {
    assert.equal(inferMissionFromRecentContext('retry it', [
      'We discussed creating a Spark diagnostic mission for a previous problem.',
      'That old run failed yesterday.'
    ]), null);
  });
})().finally(() => {
  (axios as any).get = originalGet;
});
