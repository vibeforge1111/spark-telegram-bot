import assert from 'node:assert/strict';
import { maskSecret, redactForLog, redactIdentifier, redactText } from '../src/redaction';

const openAiKeyFixture = `sk-${'abcdefghijklmnopqrstuvwxyz'}123456`;
const telegramTokenFixture = ['1234567890', 'AA' + 'B'.repeat(34)].join(':');
const swarmCliTokenFixture = `sscli_v1.${'a'.repeat(48)}.${'b'.repeat(43)}`;

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('masks long secrets with prefix and suffix only', () => {
  assert.equal(maskSecret(openAiKeyFixture), 'sk-abc...3456');
});

test('redacts common credential shapes', () => {
  const text = [
    `OPENAI_API_KEY=${openAiKeyFixture}`,
    'Authorization: Bearer github_pat_1234567890abcdefghijklmnopqrstuvwxyz',
    `BOT_TOKEN=${telegramTokenFixture}`,
    `--access-token ${swarmCliTokenFixture}`,
    '"password":"super-secret-value"',
    'postgres://user:pass@localhost/db',
  ].join('\n');
  const redacted = redactText(text);
  assert(!redacted.includes('abcdefghijklmnopqrstuvwxyz123456'));
  assert(!redacted.includes(telegramTokenFixture));
  assert(!redacted.includes(swarmCliTokenFixture));
  assert(!redacted.includes('super-secret-value'));
  assert(!redacted.includes('user:pass'));
});

test('redacts private key blocks', () => {
  const begin = '-----BEGIN ' + 'PRIVATE KEY-----';
  const end = '-----END ' + 'PRIVATE KEY-----';
  const redacted = redactText(`x\n${begin}\nabc\n${end}\ny`);
  assert.equal(redacted, 'x\n[REDACTED_PRIVATE_KEY]\ny');
});

test('redacts Error values for logs', () => {
  const error = new Error(`failed with ZAI_API_KEY=${openAiKeyFixture}`);
  const rendered = String(redactForLog(error));
  assert(!rendered.includes('abcdefghijklmnopqrstuvwxyz123456'));
});

test('redacts stable Telegram identifiers without raw IDs', () => {
  const ref = redactIdentifier(8319079055, 'user');
  assert.match(ref, /^user_[a-f0-9]{16}$/);
  assert.equal(redactIdentifier(8319079055, 'user'), ref);
  assert(!ref.includes('8319079055'));
  assert.equal(redactIdentifier(null, 'user'), 'unknown');
});
test('redactTelegramIds strips telegram: prefixed numeric IDs', () => {
  const { redactTelegramIds } = require('../src/redaction');
  const input = 'Memory Doctor: healthy. Request: telegram:768628429. Brain: visible.';
  const output = redactTelegramIds(input);
  assert(!output.includes('768628429'), 'Telegram ID should be redacted');
  assert(output.includes('[TELEGRAM_ID_REDACTED]'), 'Should contain redaction marker');
});

test('redactTelegramIds strips multiple Telegram IDs in one message', () => {
  const { redactTelegramIds } = require('../src/redaction');
  const input = 'user telegram:768628429 and admin telegram:1145923083 both connected';
  const output = redactTelegramIds(input);
  assert(!output.includes('768628429'), 'First ID should be redacted');
  assert(!output.includes('1145923083'), 'Second ID should be redacted');
});

test('redactTelegramIds does not affect normal text without IDs', () => {
  const { redactTelegramIds } = require('../src/redaction');
  const input = 'Memory Doctor: healthy. No issues found. Brain visibility 81/100.';
  const output = redactTelegramIds(input);
  assert.equal(output, input, 'Normal text should pass through unchanged');
});
