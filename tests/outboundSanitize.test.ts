import assert from 'node:assert/strict';
import {
  inspectTelegramRenderFirewall,
  rewriteSpawnerSurfaceStandaloneQuestion,
  sanitizeAndSplitTelegramText,
  sanitizeOutbound,
  splitTelegramText,
  TELEGRAM_SAFE_MESSAGE_LIMIT,
  stripMarkdownEmphasis
} from '../src/outboundSanitize';
import { LEGACY_PROMPT_SURFACE_BLOCKED_REFS } from '../src/legacyPromptRefs';

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

test('firewalls raw control internals from ordinary Telegram replies', () => {
  const cleaned = sanitizeOutbound([
    'Blocked by route_not_selected_by_turn_envelope from harness_core:owner_mismatch.',
    'Proof ref: turn:sha256:abcdef1234567890 and trace:telegram-run:abcdef1234567890.',
    'Read docs/SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26.md and context_packet.',
    'Path: /Users/example/private/source.ts',
    '    at run (/Users/example/private/source.ts:12:3)'
  ].join('\n'));

  assert.doesNotMatch(cleaned, /route_not_selected_by_turn_envelope|harness_core|owner_mismatch/);
  assert.doesNotMatch(cleaned, /turn:sha256|trace:telegram-run|context_packet/);
  assert.doesNotMatch(cleaned, /SPARK_LEGACY_SOURCE_INVENTORY|\/Users\/example|source\.ts:12:3/);
  assert.match(cleaned, /internal policy reason/);
  assert.match(cleaned, /proof detail/);
  assert.match(cleaned, /trace detail/);
  assert.match(cleaned, /legacy source evidence/);
  assert.match(cleaned, /\[stack trace hidden\]/);
});

test('firewalls legacy source titles and old runbook names from ordinary replies', () => {
  const cleaned = sanitizeOutbound([
    'Use the Genesis live Telegram 100 benchmark as the source.',
    'Compare it with SPARK_QA_STARTUP_BENCH_SHOWCASE_RUNBOOK_2026-05-26.md and codex-handoffs/old-note.md.'
  ].join('\n'));

  assert.doesNotMatch(cleaned, /Genesis live Telegram 100 benchmark/i);
  assert.doesNotMatch(cleaned, /SPARK_QA_STARTUP_BENCH_SHOWCASE_RUNBOOK_2026-05-26\.md/i);
  assert.doesNotMatch(cleaned, /codex-handoffs/i);
  assert.match(cleaned, /legacy source evidence/);
});

test('firewalls every prompt-surface blocked legacy ref from ordinary replies', () => {
  for (const ref of LEGACY_PROMPT_SURFACE_BLOCKED_REFS) {
    for (const pattern of ref.patterns) {
      const cleaned = sanitizeOutbound(`Ordinary reply mentioned ${pattern} as current context.`);

      assert.equal(
        cleaned.toLowerCase().includes(pattern.toLowerCase()),
        false,
        `${ref.id} pattern ${pattern} leaked through ordinary Telegram render`
      );
      assert.match(cleaned, /legacy source evidence/);
    }
  }
});

test('allows inspect surfaces to keep proof refs while still hiding paths and stack traces', () => {
  const text = [
    'Proof ref: turn:sha256:abcdef1234567890',
    'Trace ref: trace:telegram-run:abcdef1234567890',
    'Path: /Users/example/private/source.ts',
    '    at inspect (/Users/example/private/source.ts:12:3)'
  ].join('\n');
  const issues = inspectTelegramRenderFirewall(text, { surface: 'inspect' });
  const cleaned = sanitizeOutbound(text, { surface: 'inspect' });

  assert.deepEqual(issues.map((issue) => issue.code).sort(), ['local_path', 'stack_trace']);
  assert.match(cleaned, /turn:sha256:abcdef1234567890/);
  assert.match(cleaned, /trace:telegram-run:abcdef1234567890/);
  assert.doesNotMatch(cleaned, /\/Users\/example|source\.ts:12:3/);
  assert.match(cleaned, /\[stack trace hidden\]/);
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
