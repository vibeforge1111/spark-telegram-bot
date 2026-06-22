import assert from 'node:assert/strict';
import {
  formatCompletionSummaryDeliveryFailureLogForTests,
  resetMissionRelayDeliveryStateForTests,
  sendFetchedCompletionSummaryForTests
} from '../src/missionRelay';

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('sanitizes delayed completion summary delivery failure logs', async () => {
    const missionId = 'mission-raw-1000000001';
    const secret = `sk-${'a'.repeat(30)}`;
    const line = formatCompletionSummaryDeliveryFailureLogForTests(
      missionId,
      new Error(`network failed with OPENAI_API_KEY=${secret}`)
    );

    assert.match(line, /^\[CompletionSummary\] delivery failed mission=mission_[a-f0-9]{16} error=/);
    assert.match(line, /network failed/);
    assert.doesNotMatch(line, new RegExp(missionId));
    assert.doesNotMatch(line, new RegExp(secret));
  });

  await test('suppresses concurrent completion handoffs for one mission', async () => {
    resetMissionRelayDeliveryStateForTests();

    const sent: string[] = [];
    const bot = {
      telegram: {
        sendMessage: async (_chatId: number, message: string) => {
          await new Promise((resolve) => setTimeout(resolve, 25));
          sent.push(message);
        }
      }
    };
    const subscription = {
      missionId: 'spark-dedupe-race',
      chatId: '12345',
      userId: '67890',
      requestId: 'req-dedupe-race',
      goal: 'Reply exactly DEDUPE_OK and do not create files.',
      createdAt: '2026-05-09T00:00:00Z'
    };
    const event = {
      type: 'mission_completed' as const,
      missionId: subscription.missionId
    };
    const completion = {
      providerLabel: 'codex',
      response: 'DEDUPE_OK'
    };

    const results = await Promise.all([
      sendFetchedCompletionSummaryForTests(bot as any, 12345, subscription, event, 'normal', completion),
      sendFetchedCompletionSummaryForTests(bot as any, 12345, subscription, event, 'normal', completion)
    ]);

    assert.deepEqual(results.sort(), [0, 1]);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /DEDUPE_OK/);
  });

  await test('suppresses later retries after a completion handoff is sent', async () => {
    resetMissionRelayDeliveryStateForTests();

    const sent: string[] = [];
    const bot = {
      telegram: {
        sendMessage: async (_chatId: number, message: string) => {
          sent.push(message);
        }
      }
    };
    const subscription = {
      missionId: 'spark-dedupe-later',
      chatId: '12345',
      userId: '67890',
      requestId: 'req-dedupe-later',
      goal: 'Reply exactly DEDUPE_LATER_OK and do not create files.',
      createdAt: '2026-05-09T00:00:00Z'
    };
    const event = {
      type: 'mission_completed' as const,
      missionId: subscription.missionId
    };
    const completion = {
      providerLabel: 'codex',
      response: 'DEDUPE_LATER_OK'
    };

    const first = await sendFetchedCompletionSummaryForTests(bot as any, 12345, subscription, event, 'normal', completion);
    const second = await sendFetchedCompletionSummaryForTests(bot as any, 12345, subscription, event, 'normal', completion);

    assert.equal(first, 1);
    assert.equal(second, 0);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /DEDUPE_LATER_OK/);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
