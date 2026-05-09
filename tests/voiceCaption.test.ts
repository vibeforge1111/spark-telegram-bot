import assert from 'node:assert/strict';
import { formatVoiceMediaCaption, TELEGRAM_VOICE_CAPTION_MAX_CHARS } from '../src/voiceCaption';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('prefers the formatted Builder response over flattened spoken text', () => {
  const caption = formatVoiceMediaCaption({
    responseText: [
      "Here's the honest layout.",
      '',
      'Where I run',
      '- Telegram is my primary surface.',
      '',
      'Memory',
      '- I carry persistent state across turns.'
    ].join('\n'),
    spokenText: "Here's the honest layout. Where I run. Telegram is my primary surface. Memory. I carry persistent state across turns."
  });

  assert.equal(
    caption,
    [
      "Here's the honest layout.",
      '',
      'Where I run',
      '- Telegram is my primary surface.',
      '',
      'Memory',
      '- I carry persistent state across turns.'
    ].join('\n')
  );
});

test('composes long single-line captions into readable paragraphs', () => {
  const caption = formatVoiceMediaCaption({
    responseText:
      "Here's the honest layout. Where I run. Telegram is my primary surface. I'm a conversational operator, not a standalone app. Everything flows through this chat. Memory. I carry persistent state across turns - your active focus, plans, test facts, preferences. Domain chips. I have specialized modules wired in for specific tasks. Spawner. I can route build work when a mission is explicit."
  });

  assert.ok(caption);
  assert.match(caption, /\n\n/);
  assert.match(caption, /Where I run\. Telegram is my primary surface\./);
  assert.match(caption, /Memory\. I carry persistent state/);
  assert.match(caption, /Domain chips\. I have specialized modules/);
});

test('keeps Telegram voice captions inside the caption limit', () => {
  const caption = formatVoiceMediaCaption({
    responseText: Array.from({ length: 80 }, (_, index) => `Section ${index}. ${'Useful context '.repeat(8)}`).join(' '),
  });

  assert.ok(caption);
  assert.equal(caption.length <= TELEGRAM_VOICE_CAPTION_MAX_CHARS, true);
  assert.match(caption, /\.\.\.$/);
});

test('does not create four-dot endings when truncating at a sentence boundary', () => {
  const caption = formatVoiceMediaCaption({
    responseText: [
      'Domain chips are specialists I can call in when something specific comes up.',
      'You do not have to think about that part.',
      'It just runs.',
      'This extra sentence forces a clean caption trim.'
    ].join(' '),
    maxChars: 145,
  });

  assert.ok(caption);
  assert.doesNotMatch(caption, /\.\.\.\.$/);
  assert.match(caption, /runs\.\.\.$|part\.\.\.$/);
});
