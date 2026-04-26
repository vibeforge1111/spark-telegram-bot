import assert from 'node:assert/strict';
import { maskSecret, redactForLog, redactText } from '../src/redaction';

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
  assert.equal(maskSecret('sk-abcdefghijklmnopqrstuvwxyz123456'), 'sk-abc...3456');
});

test('redacts common credential shapes', () => {
  const text = [
    'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456',
    'Authorization: Bearer github_pat_1234567890abcdefghijklmnopqrstuvwxyz',
    'BOT_TOKEN=8667732512:AAGSJos3lAPBzeB9G7GTMWdi7XkFhsBlxco',
    '"password":"super-secret-value"',
    'postgres://user:pass@localhost/db',
  ].join('\n');
  const redacted = redactText(text);
  assert(!redacted.includes('abcdefghijklmnopqrstuvwxyz123456'));
  assert(!redacted.includes('AAGSJos3lAPBzeB9G7GTMWdi7XkFhsBlxco'));
  assert(!redacted.includes('super-secret-value'));
  assert(!redacted.includes('user:pass'));
});

test('redacts private key blocks', () => {
  const redacted = redactText('x\n-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\ny');
  assert.equal(redacted, 'x\n[REDACTED_PRIVATE_KEY]\ny');
});

test('redacts Error values for logs', () => {
  const error = new Error('failed with ZAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456');
  const rendered = String(redactForLog(error));
  assert(!rendered.includes('abcdefghijklmnopqrstuvwxyz123456'));
});
