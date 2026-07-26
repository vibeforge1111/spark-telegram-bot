import assert from 'node:assert/strict';
import axios from 'axios';
import { buildTelegramTurnIntentEnvelope } from '../src/harnessContract';
import { authorizeTelegramActionFromEnvelope } from '../src/telegramActionAuthority';
import { classifyTelegramIntentV2 } from '../src/telegramIntentGate';

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

const originalPost = axios.post;
const originalEnv = {
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
  BOT_DEFAULT_TIER: process.env.BOT_DEFAULT_TIER,
  SPARK_AGENT_ACCESS_PROFILE: process.env.SPARK_AGENT_ACCESS_PROFILE,
  SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE,
  SPARK_CLARIFICATION_COPY_LLM: process.env.SPARK_CLARIFICATION_COPY_LLM,
  SPAWNER_UI_URL: process.env.SPAWNER_UI_URL
};

function restore(): void {
  (axios as any).post = originalPost;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string>)[key] = value;
  }
}

function actionAuthorizationFor(text: string) {
  const decision = classifyTelegramIntentV2(text);
  const envelope = buildTelegramTurnIntentEnvelope({
    text,
    decision,
    userRef: 'user:qa',
    chatRef: 'chat:qa',
    accessProfile: 'admin',
    conversationKind: 'dm',
    turnId: 'turn:test-build-clarification',
    traceId: 'trace:test-build-clarification'
  });
  return authorizeTelegramActionFromEnvelope(envelope, {
    route: 'spawner.build',
    text,
    toolName: 'spawner.run',
    ownerSystem: 'spawner-ui',
    mutationClass: 'launches_mission'
  });
}

async function run(): Promise<void> {
  await test('build clarification replies prove the concrete spawner route', async () => {
    restore();
    process.env.ADMIN_TELEGRAM_IDS = '8319079055';
    process.env.BOT_DEFAULT_TIER = 'base';
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
    process.env.SPARK_BOT_TEST_MODE = '1';
    process.env.SPARK_CLARIFICATION_COPY_LLM = '0';
    process.env.SPAWNER_UI_URL = 'http://stub-spawner.test';

    (axios as any).post = async () => ({
      data: {
        success: true,
        needsClarification: true,
        openQuestions: ['Who needs to trust the proof first?'],
        addedAssumptions: ['Assume a focused local static page.']
      }
    });

    const text = 'Build a local-only static proof page called Spark Proof Tile. Do not publish, deploy, or push anything.';
    const replies: string[] = [];
    const extras: any[] = [];
    const ctx = {
      chat: { id: 8319079055, type: 'private' },
      from: { id: 8319079055, username: 'cem' },
      update: { update_id: 9001 },
      sendChatAction: async (_action: string) => {},
      reply: async (reply: string, extra?: any) => {
        replies.push(reply);
        extras.push(extra);
      }
    };

    const indexModule: any = await import('../src/index');
    await indexModule.handleBuildIntent(
      ctx,
      'local-only static proof page called Spark Proof Tile. Do not publish, deploy, or push anything.',
      'Spark Proof Tile',
      null,
      'direct',
      'Small explicit build request; direct execution is enough.',
      undefined,
      'direct',
      'Direct build lane selected.',
      { actionAuthorization: actionAuthorizationFor(text) }
    );

    assert.match(replies[0] || '', /I can turn this into Spark Proof Tile/);
    const trace = extras[0]?.__sparkTraceContext;
    assert.equal(trace?.route, 'spawner.build');
    assert.equal(trace?.proofCapsule?.route, 'spawner.build');
    assert.equal(trace?.proofCapsule?.intent?.kind, 'spawner.build');
    assert.equal(trace?.proofCapsule?.execution?.mutationClass, 'read_only');
    assert.notEqual(trace?.proofCapsule?.intent?.kind, 'build_or_spawner');

    restore();
  });
}

run().catch((error) => {
  restore();
  console.error(error);
  process.exit(1);
});
