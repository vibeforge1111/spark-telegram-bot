import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractStartSession, onboardingEventPath, recordTelegramFirstMessage } from '../src/onboardingBridge';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

void (async () => {
  await test('extracts Telegram /start onboarding session codes', () => {
    assert.equal(extractStartSession('/start ember-4821'), 'ember-4821');
    assert.equal(extractStartSession('/start@SparkBot ember_4821'), 'ember_4821');
    assert.equal(extractStartSession('/start'), null);
  });

  await test('uses Spark onboarding event path override', () => {
    assert.equal(onboardingEventPath({ SPARK_ONBOARDING_EVENT_PATH: 'C:/tmp/events.jsonl' } as any), 'C:/tmp/events.jsonl');
  });

  await test('writes structured first-message event jsonl', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'spark-onboarding-'));
    const eventFile = path.join(dir, 'nested', 'events.jsonl');
    await recordTelegramFirstMessage({
      event: 'telegram_first_message',
      session: 'ember-4821',
      replied: true,
      ts: '2026-05-05T00:00:00Z',
      chat_id: '123',
      user_id: '456',
      profile: 'default'
    }, eventFile);
    const parsed = JSON.parse((await readFile(eventFile, 'utf-8')).trim());
    assert.equal(parsed.event, 'telegram_first_message');
    assert.equal(parsed.session, 'ember-4821');
    assert.equal(parsed.replied, true);
  });
})();

