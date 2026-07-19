import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConversationMemory } from '../src/conversation';
import {
  containsSensitiveCredentialMaterial,
  credentialSafetyReply,
  isCredentialSetupQuestion,
  sanitizeCredentialMemoryText
} from '../src/credentialSafety';
import { resetJsonStateForTests } from '../src/jsonState';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const credentialSamples = [
  'remember this: my password is sunshine123',
  'save my API key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz',
  'store this GitHub token github_pat_11AA22BB33CC44DD55EE',
  'my access token is abcdefghijklmnopqrstuvwxyz123456',
  '-----BEGIN PRIVATE KEY-----'
];

async function main(): Promise<void> {
  await test('detects credential material without treating setup questions as secrets', () => {
    for (const sample of credentialSamples) {
      assert.equal(containsSensitiveCredentialMaterial(sample), true, sample);
    }
    assert.equal(containsSensitiveCredentialMaterial('How do I set up an API key for Spark?'), false);
    assert.equal(containsSensitiveCredentialMaterial('I prefer password-manager reminders'), false);
  });

  await test('replaces the whole persisted turn instead of retaining a partial credential', () => {
    for (const sample of credentialSamples) {
      const sanitized = sanitizeCredentialMemoryText(sample);
      assert.equal(sanitized, '[sensitive credential omitted from Telegram memory]');
      assert.doesNotMatch(sanitized, /sunshine|sk-ant|github_pat|abcdef|private key/i);
    }
  });

  await test('renders a natural refusal without echoing credential material', () => {
    const reply = credentialSafetyReply('Please remember my password is sunshine123');
    assert.ok(reply);
    assert.match(reply!, /won't store|cannot store/i);
    assert.match(reply!, /rotate|change/i);
    assert.doesNotMatch(reply!, /sunshine123/);
  });

  await test('routes credential setup questions to real local setup guidance', () => {
    assert.equal(isCredentialSetupQuestion('How do I set up my OpenAI API key in Spark?'), true);
    assert.equal(isCredentialSetupQuestion('spark credentials list'), true);
    const reply = credentialSafetyReply('How do I set up my OpenAI API key in Spark?');
    assert.ok(reply);
    assert.match(reply!, /local terminal/i);
    assert.match(reply!, /spark setup/i);
    assert.match(reply!, /do not paste|don't paste/i);
    assert.doesNotMatch(reply!, /spark credentials (?:set|list|delete)/i);
  });

  await test('ConversationMemory never persists raw credential turns or notes', async () => {
    const previous = process.env.SPARK_GATEWAY_STATE_DIR;
    const dir = mkdtempSync(path.join(tmpdir(), 'spark-credential-memory-'));
    process.env.SPARK_GATEWAY_STATE_DIR = dir;
    resetJsonStateForTests();
    try {
      const memory = new ConversationMemory();
      const user = { id: 71234, first_name: 'Credential QA' };
      await memory.remember(user, 'remember this: my password is sunshine123');
      await memory.learnAboutUser(user, 'User asked Spark to remember: API key sk-ant-api03-abcdefghijklmnopqrstuvwxyz');
      const context = await memory.getContext(user, 'what did I say?');
      assert.match(context, /sensitive credential omitted/i);
      assert.doesNotMatch(context, /sunshine123|sk-ant-api03|abcdefghijklmnopqrstuvwxyz/i);
    } finally {
      resetJsonStateForTests();
      if (previous === undefined) delete process.env.SPARK_GATEWAY_STATE_DIR;
      else process.env.SPARK_GATEWAY_STATE_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

void main();
