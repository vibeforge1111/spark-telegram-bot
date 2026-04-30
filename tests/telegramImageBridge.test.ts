import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isTelegramImageMessage, telegramImageMemoryText } from '../src/telegramImageBridge';

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
