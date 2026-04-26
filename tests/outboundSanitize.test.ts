import assert from 'node:assert/strict';
import { sanitizeOutbound, stripMarkdownEmphasis } from '../src/outboundSanitize';

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

test('keeps bullets while removing bold emphasis', () => {
  assert.equal(
    sanitizeOutbound('* **Lean dashboard first** - ship it fast'),
    '* Lean dashboard first - ship it fast'
  );
});

test('still replaces dash family characters', () => {
  assert.equal(sanitizeOutbound('One — two – three'), 'One - two - three');
});
