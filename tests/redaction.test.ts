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

test('redacts authorization header variants without depending on Bearer syntax', () => {
  const credentials = [
    'custom-token-secret-value-123456',
    'custom-apikey-secret-value-123456',
    'custom-oauth-secret-value-123456',
    'dXNlcjpwYXNzd29yZC1zZWNyZXQ=',
  ];
  const redacted = redactText([
    `Authorization: Token ${credentials[0]}`,
    `authorization: ApiKey ${credentials[1]}`,
    `Authorization: OAuth ${credentials[2]}`,
    `Proxy-Authorization: Basic ${credentials[3]}`,
  ].join('\n'));

  for (const credential of credentials) {
    assert(!redacted.includes(credential));
  }
  assert.match(redacted, /Authorization: Token /);
  assert.match(redacted, /authorization: ApiKey /);
  assert.match(redacted, /Authorization: OAuth /);
  assert.match(redacted, /Proxy-Authorization: Basic /);
});

test('redacts quoted authorization fields in structured log text', () => {
  const secret = 'structured-authorization-secret-value-123456';
  const redacted = redactText(`{"authorization":"Bearer ${secret}","status":401}`);

  assert(!redacted.includes(secret));
  assert.match(redacted, /"authorization":"Bearer /);
  assert.match(redacted, /"status":401/);
});

test('redacts bare fe provider keys without hiding ordinary feature flags', () => {
  const openAiFederatedKey = `fe_oa_${'A'.repeat(24)}`;
  const bringKey = `fe_bri_${'B'.repeat(24)}`;
  const mcpKey = `fe_mcp_${'C'.repeat(24)}`;
  const redacted = redactText([
    `provider key ${openAiFederatedKey}`,
    `bring key ${bringKey}`,
    `mcp key ${mcpKey}`,
    'feature_flag_enabled=true',
  ].join('\n'));

  assert(!redacted.includes(openAiFederatedKey));
  assert(!redacted.includes(bringKey));
  assert(!redacted.includes(mcpKey));
  assert(redacted.includes('feature_flag_enabled=true'));
});

test('redacts GLM and MiniMax token formats used by Spark providers', () => {
  const glm = `glm-${'a'.repeat(28)}`;
  const minimax = `eyJ${'b'.repeat(48)}`;
  const redacted = redactText(`zai=${glm} minimax=${minimax}`);

  assert(!redacted.includes(glm));
  assert(!redacted.includes(minimax));
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

test('redacts common unix, macOS, container, and file URL paths', () => {
  const paths = [
    '/home/user/project/src/index.ts:42:15',
    '/Users/alchemist/Spark Bot/config.json',
    '/private/var/folders/task/output.json',
    '/workspace/spark/dist/index.js',
    '/app/runtime/config.yaml',
    '/Volumes/Private Build/report.md',
    'file:///tmp/spark/report.json',
    '~/spark/private.env',
  ];
  for (const localPath of paths) {
    const redacted = redactText(`Local file unavailable: "${localPath}"`);
    assert.doesNotMatch(redacted, /(?:alchemist|private\.env|spark\/dist|report\.json|config\.yaml)/i);
    assert.match(redacted, /\[REDACTED_PATH\]/);
  }
});

test('redacts Windows drive, forward-slash, UNC, and extended paths', () => {
  const paths = [
    String.raw`C:\Users\admin\Desktop\spark\main.ts`,
    'D:/projects/spark/private.json',
    String.raw`\\server\share\spark\secret.txt`,
    String.raw`\\?\C:\private\spark\trace.log`,
  ];
  for (const localPath of paths) {
    const redacted = redactText(`Local file unavailable: "${localPath}"`);
    assert.doesNotMatch(redacted, /(?:admin|projects|server|secret\.txt|trace\.log)/i);
    assert.match(redacted, /\[REDACTED_PATH\]/);
  }
});

test('preserves public URLs, slash commands, cron, and ordinary prose', () => {
  const text = [
    'Docs: https://example.com/home/user/help',
    'Board: https://spark.example/Users/guide?tab=/tmp/demo',
    'Run /schedule "0 9 * * *" mission Review priorities',
    'Use /tmp as an example root, not a concrete private file.',
  ].join('\n');
  assert.equal(redactText(text), text);
});

test('path redaction is idempotent and applies inside Error stacks', () => {
  const error = new Error('ENOENT');
  error.stack = 'Error: ENOENT\n    at load (/home/user/app/src/config.ts:15:3)';
  const once = String(redactForLog(error));
  assert.doesNotMatch(once, /\/home\/user/);
  assert.match(once, /\[REDACTED_PATH\]/);
  assert.equal(redactText(once), once);
});
