import assert from 'node:assert/strict';
import axios from 'axios';
import { parseNaturalCreatorMissionIntent } from '../src/conversationIntent';
import { decideNaturalRoute } from '../src/naturalRouteDecision';
import {
  deletePendingCreatorMission,
  getPendingCreatorMission,
  telegramPendingCreatorMissionKey
} from '../src/telegramPendingCreatorMissionEvidence';

type CapturedCall = { url: string; body: any };

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function makeCtx(replies: string[]) {
  return {
    chat: { id: 8319079055 },
    from: { id: 8319079055, username: 'cem' },
    message: { message_id: 56321, text: DCL_PROMPT },
    update: { update_id: 56321 },
    sendChatAction: async (_action: string) => {},
    reply: async (text: string) => {
      replies.push(text);
    }
  };
}

const DCL_PROMPT =
  'create a domain chip according to the Spark Domain Chip Labs framework with self-improving loops, benchmark pack, watchtower, and verifiable loop engineering for founder objection handling';
const PENDING_KEY = telegramPendingCreatorMissionKey(8319079055, 8319079055);

function assertDclContract(text: string): void {
  assert.match(text, /Domain Chip Labs artifact contract/);
  assert.match(text, /purpose, triggers, non-triggers, playbook, examples/);
  assert.match(text, /manifest\/hook contract/);
  assert.match(text, /score dimensions, allowed mutations/);
  assert.match(text, /watchtower, rollback, review packet, and activation notes/);
  assert.match(text, /Verifiable loop engineering/);
  assert.match(text, /held-out or trap checks/);
}

async function run(): Promise<void> {
await test('DCL framework parser and route preserve full creator contract', () => {
  const parsed = parseNaturalCreatorMissionIntent(DCL_PROMPT);
  assert.equal(parsed?.privacyMode, 'local_only');
  assert.equal(parsed?.riskLevel, 'medium');
  assertDclContract(parsed?.brief || '');

  const route = decideNaturalRoute(DCL_PROMPT);
  assert.equal(route.route, 'creator.mission');
  assert.equal(route.owner_system, 'spawner-ui');
  assert.equal(route.context_source, 'latest_message');
  assert.equal(route.requires_confirmation, true);
  assertDclContract(String(route.payload.brief || ''));
});

await test('DCL framework Telegram turn stages full creator mission through Spawner', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  const captured: CapturedCall[] = [];
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    (axios as any).post = async (url: string, body: any) => {
      captured.push({ url, body });
      if (url.includes('/api/creator/mission')) {
        return {
          data: {
            ok: true,
            missionId: 'mission-creator-dcl-founder-objections',
            taskCount: 9,
            canvasUrl: 'http://127.0.0.1:3333/canvas?mission=mission-creator-dcl-founder-objections'
          }
        };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    await indexModule.handleTextMessage(makeCtx(replies));

    const creatorCall = captured.find((call) => call.url.includes('/api/creator/mission'));
    assert.ok(creatorCall, 'DCL framework prompt should stage creator mission');
    assert.ok(!captured.some((call) => call.url.includes('/api/prd-bridge/write')), 'DCL framework prompt should not use generic PRD bridge');
    assert.equal(creatorCall?.body?.executionPolicy, 'manual_run');
    assert.equal(creatorCall?.body?.privacyMode, 'local_only');
    assert.match(String(creatorCall?.body?.brief || ''), /Requested artifact: full creator system/);
    assertDclContract(String(creatorCall?.body?.brief || ''));
    assert.match(replies.join('\n'), /stage the full creator system privately first/i);
    assert.match(replies.join('\n'), /Creator-run contract: creator intent, adapter map, artifact manifest, domain chip, manifest\/hook contract/);
    assert.doesNotMatch(replies.join('\n'), /I can build this as domain-chip/i);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('DCL framework Telegram turn fails closed when Spawner omits mission proof', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    (axios as any).post = async (url: string) => {
      if (url.includes('/api/creator/mission')) {
        return { data: { ok: true, taskCount: 5 } };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    await indexModule.handleTextMessage(makeCtx(replies));

    const replyText = replies.join('\n');
    assert.match(replyText, /stage the full creator system privately first/i);
    assert.match(replyText, /Creator mission failed/i);
    assert.match(replyText, /missing mission id or staged artifact proof/i);
    assert.doesNotMatch(replyText, /Creator plan ready|Private path staged|Creator plan is staged/i);
    assert.equal(getPendingCreatorMission(PENDING_KEY), null);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('DCL framework Telegram turn remembers pending state from trace mission proof', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    (axios as any).post = async (url: string) => {
      if (url.includes('/api/creator/mission')) {
        return {
          data: {
            ok: true,
            taskCount: 5,
            trace: {
              mission_id: 'mission-creator-trace-only',
              execution_policy: 'manual_run',
              artifacts: ['domain_chip', 'benchmark_pack']
            }
          }
        };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    await indexModule.handleTextMessage(makeCtx(replies));

    assert.match(replies.join('\n'), /5 tasks queued/);
    assert.match(replies.join('\n'), /say: run it/);
    assert.equal(getPendingCreatorMission(PENDING_KEY)?.missionId, 'mission-creator-trace-only');
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});

await test('DCL framework Telegram turn keeps staged artifact proof review-only', async () => {
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalEnv = { ...process.env };
  deletePendingCreatorMission(PENDING_KEY);
  try {
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';
    process.env.SPAWNER_UI_PUBLIC_URL = 'http://stub-spawner.test';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';

    (axios as any).post = async (url: string) => {
      if (url.includes('/api/creator/mission')) {
        return {
          data: {
            ok: true,
            taskCount: 4,
            reviewPath: '/creator/review/tg-creator-review-only',
            trace: {
              execution_policy: 'manual_run',
              artifacts: ['domain_chip', 'benchmark_pack']
            }
          }
        };
      }
      return { data: { success: true } };
    };
    (axios as any).get = async () => ({ data: { pending: false } });

    const replies: string[] = [];
    const indexModule = await import('../src/index');
    await indexModule.handleTextMessage(makeCtx(replies));

    const replyText = replies.join('\n');
    assert.match(replyText, /4 tasks staged/);
    assert.match(replyText, /Review: http:\/\/stub-spawner\.test\/creator\/review\/tg-creator-review-only/);
    assert.doesNotMatch(replyText, /say: run it/);
    assert.doesNotMatch(replyText, /kanban\?mission=staged-review/);
    assert.equal(getPendingCreatorMission(PENDING_KEY), null);
  } finally {
    deletePendingCreatorMission(PENDING_KEY);
    (axios as any).post = originalPost;
    (axios as any).get = originalGet;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  }
});
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
