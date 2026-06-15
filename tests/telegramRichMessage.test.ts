import assert from 'node:assert/strict';
import {
  buildInputRichMessageFromText,
  sendTelegramRichMessage,
  stripRichUnsupportedExtra,
  telegramRichMessagesEnabled
} from '../src/telegramRichMessage';

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
  await test('rich messages are enabled unless explicitly disabled', () => {
    assert.equal(telegramRichMessagesEnabled({}), true);
    assert.equal(telegramRichMessagesEnabled({ SPARK_TELEGRAM_RICH_MESSAGES: '1' }), true);
    assert.equal(telegramRichMessagesEnabled({ SPARK_TELEGRAM_RICH_MESSAGES: '0' }), false);
  });

  await test('builds safe Telegram rich HTML from sanitized Spark text', () => {
    const rich = buildInputRichMessageFromText('Build ready\n\n- Score: 100/100\n- Review: clear\n\nBoard: http://127.0.0.1:3333/kanban');

    assert.ok(rich);
    assert.match(rich.html, /<h4>Build ready<\/h4>/);
    assert.match(rich.html, /<ul><li>Score: 100\/100<\/li><li>Review: clear<\/li><\/ul>/);
    assert.match(rich.html, /<p>Board: http:\/\/127\.0\.0\.1:3333\/kanban<\/p>/);
    assert.equal(rich.skip_entity_detection, false);
  });

  await test('escapes html and strips markdown-style emphasis before rendering', () => {
    const rich = buildInputRichMessageFromText('**Review** <clear> & ready');

    assert.ok(rich);
    assert.equal(rich.html, '<p>Review &lt;clear&gt; &amp; ready</p>');
  });

  await test('strips Telegram sendMessage extras unsupported by rich messages', () => {
    assert.deepEqual(
      stripRichUnsupportedExtra({
        parse_mode: 'MarkdownV2',
        link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: [] },
        disable_notification: true
      }),
      {
        reply_markup: { inline_keyboard: [] },
        disable_notification: true
      }
    );
  });

  await test('sends final replies through sendRichMessage payloads', async () => {
    const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];

    await sendTelegramRichMessage(
      {
        async callApi(method, payload) {
          calls.push({ method, payload });
        }
      },
      42,
      'Ready\n\n- Canvas: http://127.0.0.1:3333/canvas',
      { parse_mode: 'Markdown', protect_content: true }
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'sendRichMessage');
    assert.equal(calls[0].payload.chat_id, 42);
    assert.equal(calls[0].payload.protect_content, true);
    assert.equal('parse_mode' in calls[0].payload, false);
    assert.match(JSON.stringify(calls[0].payload.rich_message), /Canvas/);
  });
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
