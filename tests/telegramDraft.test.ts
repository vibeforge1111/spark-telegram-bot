import assert from 'node:assert/strict';
import {
  buildTelegramDraftPreviewTexts,
  createTelegramDraftStreamer,
  parseTelegramStreamingConfigText,
  prepareTelegramDraftText,
  replayTelegramDraftPreview,
  renderTelegramStreamingConfigStatus,
  telegramDraftsSupportedForContext,
  telegramDraftStreamingEnabled
} from '../src/telegramDraft';

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

async function run(): Promise<void> {
  await test('draft streaming is opt-in only', () => {
    assert.equal(telegramDraftStreamingEnabled({}), false);
    assert.equal(telegramDraftStreamingEnabled({ SPARK_TELEGRAM_CHAT_STREAMING: '1' }), true);
  });

  await test('draft streaming only enables for private chats', () => {
    const env = { SPARK_TELEGRAM_CHAT_STREAMING: '1' };

    assert.equal(telegramDraftsSupportedForContext({ chat: { id: 1, type: 'private' } }, env), true);
    assert.equal(telegramDraftsSupportedForContext({ chat: { id: 1, type: 'group' } }, env), false);
    assert.equal(telegramDraftsSupportedForContext({ chat: { id: 1 } }, env), false);
  });

  await test('draft text is sanitized before Telegram sees it', () => {
    assert.equal(prepareTelegramDraftText('**Hello** \u2014 now'), 'Hello - now');
  });

  await test('parses Telegram streaming setting chat text without exposing general env edits', () => {
    assert.deepEqual(parseTelegramStreamingConfigText('SPARK_TELEGRAM_CHAT_STREAMING=1'), {
      kind: 'set',
      key: 'SPARK_TELEGRAM_CHAT_STREAMING',
      value: '1'
    });
    assert.deepEqual(parseTelegramStreamingConfigText('SPARK_TELEGRAM_DRAFT_INTERVAL_MS=700'), {
      kind: 'set',
      key: 'SPARK_TELEGRAM_DRAFT_INTERVAL_MS',
      value: '700'
    });
    assert.deepEqual(parseTelegramStreamingConfigText('/streaming off'), {
      kind: 'set',
      key: 'SPARK_TELEGRAM_CHAT_STREAMING',
      value: '0'
    });
    assert.deepEqual(parseTelegramStreamingConfigText('/streaming'), { kind: 'status' });
    assert.equal(parseTelegramStreamingConfigText('BOT_TOKEN=secret'), null);
  });

  await test('renders compact Telegram streaming status', () => {
    const status = renderTelegramStreamingConfigStatus({
      SPARK_TELEGRAM_CHAT_STREAMING: '1',
      SPARK_TELEGRAM_DRAFT_INTERVAL_MS: '700',
    });

    assert.match(status, /Status: on/);
    assert.match(status, /Draft interval: 700ms/);
    assert.match(status, /Private chats only/);
  });

  await test('builds progressive draft previews for full Builder replies', () => {
    const previews = buildTelegramDraftPreviewTexts(
      'Hey Cem.\n\nStill tracking the persistent memory quality evaluation as your active focus. Want to pick that back up, or are we shifting gears?'
    );

    assert.equal(previews.length, 2);
    assert.match(previews[0], /Hey Cem/);
    assert.equal(previews[1].startsWith(previews[0]), true);
    assert.match(previews[1], /shifting gears/);
  });

  await test('replays full replies as Telegram drafts before final send', async () => {
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];

    await replayTelegramDraftPreview(
      { chat: { id: 42, type: 'private' } },
      {
        async callApi(method, payload) {
          calls.push({ method, payload });
        },
      },
      'Hey Cem. This is a full Builder reply that should preview as a draft.',
      { SPARK_TELEGRAM_CHAT_STREAMING: '1', SPARK_TELEGRAM_DRAFT_INTERVAL_MS: '0' }
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, 'sendRichMessageDraft');
    assert.equal(calls[0].payload.chat_id, 42);
    assert.equal(calls[1].payload.draft_id, calls[0].payload.draft_id);
    assert.match(JSON.stringify(calls[1].payload.rich_message), /full Builder reply/);
  });

  await test('streamer sends stable draft id updates through sendRichMessageDraft', async () => {
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    const streamer = createTelegramDraftStreamer(
      { chat: { id: 42, type: 'private' } },
      {
        async callApi(method, payload) {
          calls.push({ method, payload });
        },
      },
      { SPARK_TELEGRAM_CHAT_STREAMING: '1', SPARK_TELEGRAM_DRAFT_INTERVAL_MS: '0' }
    );

    assert.ok(streamer);
    await streamer.push('Hel');
    await streamer.push('Hello **Spark**');

    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, 'sendRichMessageDraft');
    assert.equal(calls[0].payload.chat_id, 42);
    assert.match(JSON.stringify(calls[0].payload.rich_message), /Hel/);
    assert.match(JSON.stringify(calls[1].payload.rich_message), /Hello Spark/);
    assert.equal(calls[1].payload.draft_id, calls[0].payload.draft_id);
  });

  await test('streamer throttles draft updates', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const streamer = createTelegramDraftStreamer(
      { chat: { id: 42, type: 'private' } },
      {
        async callApi(_method, payload) {
          calls.push(payload);
        },
      },
      { SPARK_TELEGRAM_CHAT_STREAMING: '1', SPARK_TELEGRAM_DRAFT_INTERVAL_MS: '100000' }
    );

    assert.ok(streamer);
    await streamer.push('First');
    await streamer.push('Second');

    assert.equal(calls.length, 1);
    assert.match(JSON.stringify(calls[0].rich_message), /First/);
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
