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
    'Authorization: Token custom-token-secret-value',
    'Authorization: ApiKey custom-apikey-secret-value',
    `BOT_TOKEN=${telegramTokenFixture}`,
    `--access-token ${swarmCliTokenFixture}`,
    '"password":"super-secret-value"',
    'postgres://user:pass@localhost/db',
  ].join('\n');
  const redacted = redactText(text);
  assert(!redacted.includes('abcdefghijklmnopqrstuvwxyz123456'));
  assert(!redacted.includes('custom-token-secret-value'));
  assert(!redacted.includes('custom-apikey-secret-value'));
  assert(!redacted.includes(telegramTokenFixture));
  assert(!redacted.includes(swarmCliTokenFixture));
  assert(!redacted.includes('super-secret-value'));
  assert(!redacted.includes('user:pass'));
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

test('redacts unix absolute paths', () => {
  const paths = [
    '/home/user/project/src/index.ts',
    '/tmp/spark-12345/output.json',
    '/root/.ssh/id_rsa',
    '/var/log/syslog',
    '/opt/app/config.yaml',
    '/etc/nginx/nginx.conf',
    '/srv/www/htdocs/index.html',
  ];
  for (const p of paths) {
    const redacted = redactText(`Error at ${p}`);
    assert(!redacted.includes(p), `path not redacted: ${p}`);
    assert(redacted.includes('[REDACTED_PATH]'), `missing [REDACTED_PATH] for: ${p}`);
  }
});

test('redacts windows absolute paths', () => {
  const paths = [
    'C:\\Users\\admin\\AppData\\Local\\temp\\file.txt',
    'C:\\Users\\john\\Desktop\\project\\main.ts',
    'D:\\Program Files\\app\\bin.exe',
    'C:\\Windows\\System32\\cmd.exe',
    'C:\\ProgramData\\app\\config.json',
  ];
  for (const p of paths) {
    const redacted = redactText(`Error at ${p}`);
    assert(!redacted.includes(p), `path not redacted: ${p}`);
    assert(redacted.includes('[REDACTED_PATH]'), `missing [REDACTED_PATH] for: ${p}`);
  }
});

test('does not redact normal words containing path segments', () => {
  const text = 'The variable name is temporary and the root cause is clear';
  const redacted = redactText(text);
  assert.equal(redacted, text);
});

test('redacts paths inside error stacks via redactForLog', () => {
  const error = new Error('ENOENT: no such file or directory');
  (error as any).stack = 'Error: ENOENT: no such file or directory\n' +
    '    at Object.readFileSync (/home/user/app/node_modules/fs/index.js:42:15)\n' +
    '    at loadConfig (/home/user/app/src/config.ts:15:3)';
  const rendered = String(redactForLog(error));
  assert(!rendered.includes('/home/user/app'), 'unix path leaked from error stack');
  assert(rendered.includes('[REDACTED_PATH]'));
});
