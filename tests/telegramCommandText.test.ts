import assert from 'node:assert/strict';
import { test } from 'node:test';
import { telegramCommandPayload, telegramWikiPageQuery } from '../src/telegramCommandText';

test('strips direct and group-addressed command prefixes', () => {
  assert.equal(telegramCommandPayload('/remember keep replies concise', 'remember'), 'keep replies concise');
  assert.equal(
    telegramCommandPayload('/remember@SparkRecursive_bot keep replies concise', 'remember'),
    'keep replies concise'
  );
  assert.equal(
    telegramCommandPayload('/creator@SparkRecursive_bot status mission-creator-123', 'creator'),
    'status mission-creator-123'
  );
});

test('does not strip a longer command that only shares a prefix', () => {
  assert.equal(
    telegramCommandPayload('/rememberLater keep replies concise', 'remember'),
    '/rememberLater keep replies concise'
  );
});

test('recognizes an explicit Markdown page request without widening wiki routing', () => {
  assert.equal(telegramWikiPageQuery('/wiki architecture/runtime.md'), 'architecture/runtime.md');
  assert.equal(
    telegramWikiPageQuery('/wiki@SparkRecursive_bot notes/release-30.md'),
    'notes/release-30.md'
  );
  assert.equal(telegramWikiPageQuery('/wiki list pages'), null);
  assert.equal(telegramWikiPageQuery('/wiki ../secrets.txt'), null);
});
