import assert from 'node:assert/strict';
import { maskSecret, redactForLog, redactText } from '../src/redaction';

const openAiKeyFixture = `sk-${'abcdefghijklmnopqrstuvwxyz'}123456`;
const telegramTokenFixture = ['1234567890', 'AA' + 'B'.repeat(34)].join(':');

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
    '"password":"super-secret-value"',
    'postgres://user:pass@localhost/db',
  ].join('\n');
  const redacted = redactText(text);
  assert(!redacted.includes('abcdefghijklmnopqrstuvwxyz123456'));
  assert(!redacted.includes(telegramTokenFixture));
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
