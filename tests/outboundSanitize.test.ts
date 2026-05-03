import assert from 'node:assert/strict';
import {
  rewriteSpawnerSurfaceStandaloneQuestion,
  sanitizeAndSplitTelegramText,
  sanitizeOutbound,
  splitTelegramText,
  TELEGRAM_SAFE_MESSAGE_LIMIT,
  stripMarkdownEmphasis,
  withQuietTelegramLinks
} from '../src/outboundSanitize';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('splits oversized Telegram text under the send limit', () => {
  const text = [
    'Spark self-awareness',
    '',
    ...Array.from({ length: 80 }, (_, index) => `- Capability ${index}: ${'detail '.repeat(18)}`)
  ].join('\n');

  const chunks = splitTelegramText(text, 900);

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks.every((chunk) => chunk.length <= 900), true);
  assert.match(chunks.join('\n'), /Capability 0/);
  assert.match(chunks.join('\n'), /Capability 79/);
});

test('strips Markdown bold markers from Telegram replies', () => {
  assert.equal(
    stripMarkdownEmphasis('Short answer: **yes**.\n\n**Two directions to consider:**'),
    'Short answer: yes.\n\nTwo directions to consider:'
  );
});

test('rewrites stale standalone Spawner surface question', () => {
  const text = [
    'Spawner Kanban and Canvas notes:',
    '',
    'My pick: start with Live State Sync.',
    '',
    '- Are you thinking this runs locally as a standalone page, or lives inside the existing Spawner UI routes?'
  ].join('\n');

  const rewritten = rewriteSpawnerSurfaceStandaloneQuestion(text);

  assert.doesNotMatch(rewritten, /standalone page/i);
  assert.match(rewritten, /Since this lives inside the existing Spawner UI routes/);
  assert.match(rewritten, /Kanban state accuracy, Canvas execution state, or Telegram relay messaging/);
});

test('sanitizes bold and stale standalone question together', () => {
  const cleaned = sanitizeOutbound(
    '1. **Live State Sync**\n\nSpawner Kanban and Canvas.\n\n- Are you thinking this runs locally as a standalone page, or lives inside the existing Spawner UI routes?'
  );

  assert.doesNotMatch(cleaned, /\*\*/);
  assert.doesNotMatch(cleaned, /standalone page/i);
  assert.match(cleaned, /1\. Live State Sync/);
  assert.match(cleaned, /Since this lives inside the existing Spawner UI routes/);
});

test('keeps bullets while removing bold emphasis', () => {
  assert.equal(
    sanitizeOutbound('* **Lean dashboard first** - ship it fast'),
    '* Lean dashboard first - ship it fast'
  );
});

test('still replaces dash family characters', () => {
  assert.equal(sanitizeOutbound('One — two – three'), 'One - two - three');
});
test('chunks long Telegram text under the safe message limit', () => {
  const text = Array.from({ length: 90 }, (_, index) => `Paragraph ${index}: ${'useful context '.repeat(8)}`).join('\n\n');
  const chunks = splitTelegramText(text, 500);

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks.every((chunk) => chunk.length <= 500), true);
  assert.match(chunks.join('\n'), /Paragraph 89/);
});

test('preserves Builder numbered chunks instead of splitting through them', () => {
  const text = [
    `(1/2) Spark self-awareness\n\n${'Observed now\n- ready\n\n'.repeat(45)}`,
    `(2/2) Where Spark lacks\n\n${'How Spark can improve\n- record last-success evidence\n\n'.repeat(35)}`
  ].join('\n\n');

  const chunks = splitTelegramText(text, TELEGRAM_SAFE_MESSAGE_LIMIT);

  assert.equal(chunks.length, 2);
  assert.match(chunks[0], /^\(1\/2\)/);
  assert.match(chunks[1], /^\(2\/2\)/);
  assert.equal(chunks.every((chunk) => chunk.length <= TELEGRAM_SAFE_MESSAGE_LIMIT), true);
});

test('prefers paragraph boundaries before splitting on spaces', () => {
  const text = [
    `First section ${'alpha '.repeat(50)}`,
    `Second section ${'beta '.repeat(50)}`,
    `Third section ${'gamma '.repeat(50)}`
  ].join('\n\n');

  const chunks = splitTelegramText(text, 360);

  assert.equal(chunks.length > 1, true);
  assert.match(chunks[0], /First section/);
  assert.match(chunks.join('\n'), /Second section/);
  assert.match(chunks.join('\n'), /Third section/);
  assert.equal(chunks.every((chunk) => chunk.length <= 360), true);
});

test('sanitizes before chunking Telegram reply text', () => {
  const text = Array.from({ length: 25 }, (_, index) => `**Section ${index}** \u2014 ${'memory detail '.repeat(8)}`).join('\n\n');
  const chunks = sanitizeAndSplitTelegramText(text, 360);

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks.every((chunk) => chunk.length <= 360), true);
  assert.doesNotMatch(chunks.join('\n'), /\*\*|\u2014/);
  assert.match(chunks.join('\n'), /Section 24/);
});

test('disables Telegram link previews while preserving extra options', () => {
  const extra = withQuietTelegramLinks({
    parse_mode: 'HTML',
    link_preview_options: {
      url: 'https://spawner-ui-production.up.railway.app/kanban'
    }
  });

  assert.equal(extra.disable_web_page_preview, true);
  assert.equal(extra.parse_mode, 'HTML');
  assert.equal(extra.link_preview_options.url, 'https://spawner-ui-production.up.railway.app/kanban');
  assert.equal(extra.link_preview_options.is_disabled, true);
});
