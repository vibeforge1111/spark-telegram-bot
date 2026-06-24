import assert from 'node:assert/strict';
import {
  buildTelegramDraftPreviewTexts,
  createTelegramDraftStreamer,
  parseTelegramStreamingConfigText,
  prepareTelegramDraftText,
  replayTelegramDraftPreview,
  renderTelegramStreamingConfigStatus,
  sendTelegramRichMessage,
  sendTelegramDraftUpdate,
  telegramDraftsSupportedForContext,
  telegramDraftStreamingEnabled,
  telegramDraftTransport,
  telegramRichDraftsEnabled,
  telegramRichMessagesEnabled
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
  await test('draft streaming and rich messages default on', () => {
    assert.equal(telegramDraftStreamingEnabled({}), true);
    assert.equal(telegramDraftStreamingEnabled({ SPARK_TELEGRAM_CHAT_STREAMING: '0' }), false);
    assert.equal(telegramDraftStreamingEnabled({ SPARK_TELEGRAM_CHAT_STREAMING: '1' }), true);
    assert.equal(telegramDraftTransport({}), 'rich');
    assert.equal(telegramDraftTransport({ SPARK_TELEGRAM_DRAFT_METHOD: 'legacy' }), 'legacy');
    assert.equal(telegramRichDraftsEnabled({ SPARK_TELEGRAM_DRAFT_METHOD: 'legacy' }), false);
    assert.equal(telegramRichMessagesEnabled({}), true);
    assert.equal(telegramRichMessagesEnabled({ SPARK_TELEGRAM_RICH_MESSAGES: '0' }), false);
  });

  await test('draft streaming only enables for private chats', () => {
    assert.equal(telegramDraftsSupportedForContext({ chat: { id: 1, type: 'private' } }, {}), true);
    assert.equal(telegramDraftsSupportedForContext({ chat: { id: 1, type: 'group' } }, {}), false);
    assert.equal(telegramDraftsSupportedForContext({ chat: { id: 1 } }, {}), false);
    assert.equal(
      telegramDraftsSupportedForContext({ chat: { id: 1, type: 'private' } }, { SPARK_TELEGRAM_CHAT_STREAMING: '0' }),
      false
    );
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
    assert.deepEqual(parseTelegramStreamingConfigText('/streaming@SparkBot on'), {
      kind: 'set',
      key: 'SPARK_TELEGRAM_CHAT_STREAMING',
      value: '1'
    });
    assert.deepEqual(parseTelegramStreamingConfigText('/streaming rich off'), {
      kind: 'set_many',
      values: [
        { key: 'SPARK_TELEGRAM_DRAFT_METHOD', value: 'legacy' },
        { key: 'SPARK_TELEGRAM_RICH_MESSAGES', value: '0' }
      ]
    });
    assert.deepEqual(parseTelegramStreamingConfigText('/streaming rich_messages off'), {
      kind: 'set',
      key: 'SPARK_TELEGRAM_RICH_MESSAGES',
      value: '0'
    });
    assert.deepEqual(parseTelegramStreamingConfigText('/streaming preview off'), {
      kind: 'set',
      key: 'SPARK_TELEGRAM_DRAFT_PREVIEW_FULL_REPLIES',
      value: '0'
    });
    assert.deepEqual(parseTelegramStreamingConfigText('/streaming'), { kind: 'status' });
    assert.equal(parseTelegramStreamingConfigText('BOT_TOKEN=secret'), null);
  });

  await test('renders compact Telegram streaming status', () => {
    const status = renderTelegramStreamingConfigStatus({
      SPARK_TELEGRAM_DRAFT_INTERVAL_MS: '700',
    });

    assert.match(status, /Status: on/);
    assert.match(status, /Rich messages: on/);
    assert.match(status, /Draft transport: rich/);
    assert.match(status, /Full-reply preview: on/);
    assert.match(status, /Draft interval: 700ms/);
    assert.match(status, /Private chats only/);
  });

  await test('sends Telegram drafts through Rich Message drafts by default', async () => {
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];

    const transport = await sendTelegramDraftUpdate(
      {
        async callApi(method, payload) {
          calls.push({ method, payload });
        },
      },
      42,
      1001,
      'Hello Spark',
      {}
    );

    assert.equal(transport, 'rich');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'sendRichMessageDraft');
    assert.equal(calls[0].payload.chat_id, 42);
    assert.equal(calls[0].payload.draft_id, 1001);
    assert.deepEqual(calls[0].payload.rich_message, {
      markdown: 'Hello Spark',
      skip_entity_detection: false,
    });
  });

  await test('sends final Telegram replies through Rich Messages by default', async () => {
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];

    const delivery = await sendTelegramRichMessage(
      {
        async callApi(method, payload) {
          calls.push({ method, payload });
          return { message_id: 7 };
        },
      },
      42,
      'Hello Spark',
      { parse_mode: 'MarkdownV2', reply_markup: { inline_keyboard: [] } },
      {}
    );

    assert.deepEqual(delivery, { message_id: 7 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'sendRichMessage');
    assert.equal(calls[0].payload.chat_id, 42);
    assert.deepEqual(calls[0].payload.rich_message, {
      markdown: 'Hello Spark',
      skip_entity_detection: false,
    });
    assert.deepEqual(calls[0].payload.reply_markup, { inline_keyboard: [] });
    assert.equal('parse_mode' in calls[0].payload, false);
  });

  await test('final Rich Messages can be disabled or can fall back silently', async () => {
    const disabledCalls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    const disabled = await sendTelegramRichMessage(
      {
        async callApi(method, payload) {
          disabledCalls.push({ method, payload });
        },
      },
      42,
      'Hello Spark',
      null,
      { SPARK_TELEGRAM_RICH_MESSAGES: '0' }
    );
    assert.equal(disabled, null);
    assert.equal(disabledCalls.length, 0);

    const failed = await sendTelegramRichMessage(
      {
        async callApi() {
          throw new Error('method unavailable');
        },
      },
      42,
      'Hello Spark',
      null,
      {}
    );
    assert.equal(failed, null);
  });

  await test('falls back to legacy message drafts when Rich Message drafts fail', async () => {
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];

    const transport = await sendTelegramDraftUpdate(
      {
        async callApi(method, payload) {
          calls.push({ method, payload });
          if (method === 'sendRichMessageDraft') {
            throw new Error('method unavailable');
          }
        },
      },
      42,
      1001,
      'Hello Spark',
      {}
    );

    assert.equal(transport, 'legacy');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, 'sendRichMessageDraft');
    assert.equal(calls[1].method, 'sendMessageDraft');
    assert.equal(calls[1].payload.text, 'Hello Spark');
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
    assert.match(String((calls[1].payload.rich_message as any).markdown), /full Builder reply/);
  });

  await test('streamer sends stable draft id updates through Rich Message drafts', async () => {
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
    assert.equal(await streamer.push('Hel'), true);
    assert.equal(await streamer.push('Hel'), false);
    assert.equal(await streamer.push('Hello **Spark**'), true);

    assert.equal(calls.length, 2);
    assert.equal(calls[0].method, 'sendRichMessageDraft');
    assert.equal(calls[0].payload.chat_id, 42);
    assert.equal((calls[0].payload.rich_message as any).markdown, 'Hel');
    assert.equal((calls[1].payload.rich_message as any).markdown, 'Hello Spark');
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
    assert.equal(await streamer.push('First'), true);
    assert.equal(await streamer.push('Second'), false);

    assert.equal(calls.length, 1);
    assert.equal((calls[0].rich_message as any).markdown, 'First');
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
