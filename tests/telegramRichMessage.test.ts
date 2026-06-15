import assert from 'node:assert/strict';
import {
  buildReadableTelegramHtmlMessageFromText,
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
    assert.match(rich.html, /<p>Board: <a href="http:\/\/127\.0\.0\.1:3333\/kanban">Open board<\/a><\/p>/);
    assert.equal(rich.skip_entity_detection, false);
  });

  await test('renders long local Spark links as readable rich links', () => {
    const rich = buildInputRichMessageFromText([
      'Day Triage Button has a matching preview',
      '',
      'Evidence',
      '• Preview: http://127.0.0.1:3333/preview/QzpcVXNlcnNcVVNFUlwuc3Bhcmtcd29ya3NwYWNlcw/index.html',
      '• Canvas: http://127.0.0.1:3333/canvas?pipeline=prd-demo&mission=mission-demo',
      '• Board: http://127.0.0.1:3333/kanban?mission=mission-demo'
    ].join('\n'));

    assert.ok(rich);
    assert.match(rich.html, /<h4>Day Triage Button has a matching preview<\/h4>\n<blockquote>\n<p><b>Evidence<\/b><\/p>/);
    assert.match(rich.html, /<p><b>Evidence<\/b><\/p>\n<ul><li>Preview:/);
    assert.doesNotMatch(rich.html, /<p>Evidence<br>/);
    assert.match(rich.html, /<blockquote>/);
    assert.match(rich.html, /<a href="http:\/\/127\.0\.0\.1:3333\/preview\/QzpcVXNlcnNcVVNFUlwuc3Bhcmtcd29ya3NwYWNlcw\/index\.html">Open preview<\/a>/);
    assert.match(rich.html, /<a href="http:\/\/127\.0\.0\.1:3333\/canvas\?pipeline=prd-demo&amp;mission=mission-demo">Open canvas<\/a>/);
    assert.match(rich.html, /<a href="http:\/\/127\.0\.0\.1:3333\/kanban\?mission=mission-demo">Open board<\/a>/);
    assert.doesNotMatch(rich.html, />http:\/\/127\.0\.0\.1:3333\/preview/);
  });

  await test('renders compact Spark card sections as spaced rich blocks', () => {
    const rich = buildInputRichMessageFromText([
      'Day Triage Button has a current Spawner result',
      '',
      'What changed',
      '• It moved from idea to a concrete tiny local app plan with 5 build steps.',
      '• Scope: local-only app; no auth, database, or API in the artifact.',
      '',
      'Blockers',
      '• No current blocker is visible in the Spawner result artifact.',
      '• Still worth proving next: open/click flow, refresh behavior, and saved state.'
    ].join('\n'));

    assert.ok(rich);
    assert.match(rich.html, /<blockquote>\n<p><b>What changed<\/b><\/p>\n<ul><li>It moved from idea/);
    assert.match(rich.html, /<\/blockquote>\n<blockquote>\n<p><b>Blockers<\/b><\/p>\n<ul><li>No current blocker/);
    assert.doesNotMatch(rich.html, /What changed<br>/);
    assert.doesNotMatch(rich.html, /Blockers<br>/);
  });

  await test('builds readable Telegram HTML cards with preserved section spacing', () => {
    const html = buildReadableTelegramHtmlMessageFromText([
      'Day Triage Button has a current Spawner result',
      '',
      'Evidence',
      '• Preview: http://127.0.0.1:3333/preview/QzpcVXNlcnNcVVNFUlwuc3Bhcmtcd29ya3NwYWNlcw/index.html',
      '• Canvas: http://127.0.0.1:3333/canvas?pipeline=prd-demo&mission=mission-demo',
      '',
      'Blockers',
      '• No current blocker is visible.'
    ].join('\n'));

    assert.ok(html);
    assert.match(html, /^<b>Day Triage Button has a current Spawner result<\/b>\n\n---\n\n<b>Evidence<\/b>/);
    assert.match(html, /\n\n---\n\n<b>Blockers<\/b>\n• No current blocker is visible\./);
    assert.match(html, /Preview: <a href="http:\/\/127\.0\.0\.1:3333\/preview\/QzpcVXNlcnNcVVNFUlwuc3Bhcmtcd29ya3NwYWNlcw\/index\.html">Open preview<\/a>/);
    assert.match(html, /Canvas: <a href="http:\/\/127\.0\.0\.1:3333\/canvas\?pipeline=prd-demo&amp;mission=mission-demo">Open canvas<\/a>/);
    assert.doesNotMatch(html, />http:\/\/127\.0\.0\.1:3333\/preview/);
  });

  await test('recovers visible spacing when governed compact cards lose blank lines', () => {
    const html = buildReadableTelegramHtmlMessageFromText([
      'Day Triage Button has a current Spawner result',
      'What changed',
      '\u2022 It moved from idea to a concrete tiny local app plan with 5 build steps.',
      '\u2022 Scope: local-only app; no auth, database, or API in the artifact.',
      'Evidence',
      '\u2022 Preview: http://127.0.0.1:3333/preview/QzpcVXNlcnNcVVNFUlwuc3Bhcmtcd29ya3NwYWNlcw/index.html',
      '\u2022 Canvas: http://127.0.0.1:3333/canvas?pipeline=prd-demo&mission=mission-demo',
      'Blockers',
      '\u2022 No current blocker is visible.'
    ].join('\n'));

    assert.ok(html);
    assert.match(html, /^<b>Day Triage Button has a current Spawner result<\/b>\n\n---\n\n<b>What changed<\/b>/);
    assert.match(html, /\n\n---\n\n<b>Evidence<\/b>\n/);
    assert.match(html, /\n\n---\n\n<b>Blockers<\/b>\n/);
    assert.doesNotMatch(html, /What changed\n\u2022[\s\S]*Evidence\n\u2022/);
  });

  await test('recognizes legacy mojibake bullets as list markers', () => {
    const html = buildReadableTelegramHtmlMessageFromText([
      'Card title',
      'Evidence',
      '\u00e2\u20ac\u00a2 Preview: http://127.0.0.1:3333/preview/Q/index.html',
      'Blockers',
      '\u00e2\u20ac\u00a2 No current blocker.'
    ].join('\n'));

    assert.ok(html);
    assert.match(html, /<b>Evidence<\/b>\n\u2022 Preview:/);
    assert.match(html, /\n\n---\n\n<b>Blockers<\/b>\n\u2022 No current blocker\./);
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
