import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  buildContextualImageUpdate,
  imageMessageHasCaption,
  isTelegramImageMessage,
  telegramImageMemoryText
} from '../src/telegramImageBridge';

test('detects Telegram photo messages as image input', () => {
  assert.equal(isTelegramImageMessage({ photo: [{ file_id: 'small' }] }), true);
});

test('detects Telegram image documents only by mime type', () => {
  assert.equal(isTelegramImageMessage({ document: { file_id: 'doc', mime_type: 'image/png' } }), true);
  assert.equal(isTelegramImageMessage({ document: { file_id: 'doc', mime_type: 'application/pdf' } }), false);
});

test('formats image memory text from captions and filenames', () => {
  assert.equal(
    telegramImageMemoryText({ caption: 'Read this screenshot' }),
    '[image] Read this screenshot'
  );
  assert.equal(
    telegramImageMemoryText({ document: { file_name: 'screenshot.png', mime_type: 'image/png' } }),
    '[image] screenshot.png'
  );
  assert.equal(telegramImageMemoryText({ photo: [{ file_id: 'photo' }] }), '[image]');
});

test('detects whether image messages already have captions', () => {
  assert.equal(imageMessageHasCaption({ caption: 'read this' }), true);
  assert.equal(imageMessageHasCaption({ caption: '   ' }), false);
  assert.equal(imageMessageHasCaption({ photo: [{ file_id: 'photo' }] }), false);
});

test('adds recent context as caption for captionless image updates', () => {
  const update = {
    update_id: 10,
    message: {
      message_id: 20,
      photo: [{ file_id: 'photo' }]
    }
  };

  const enriched = buildContextualImageUpdate(update, [
    'User: can you inspect the next screenshot?',
    'Assistant: yes, send it here.'
  ]);

  const caption = (enriched.message as any).caption;
  assert.match(caption, /shared this image without a caption/);
  assert.match(caption, /can you inspect the next screenshot/);
  assert.equal((update.message as any).caption, undefined);
});

test('keeps explicit image captions unchanged', () => {
  const update = {
    message: {
      caption: 'Read this exact screenshot',
      photo: [{ file_id: 'photo' }]
    }
  };

  const enriched = buildContextualImageUpdate(update, ['User: previous request']);

  assert.equal((enriched.message as any).caption, 'Read this exact screenshot');
});
