import assert from 'node:assert/strict';
import {
  rewriteSpawnerSurfaceStandaloneQuestion,
  sanitizeOutbound,
  stripMarkdownEmphasis
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
