import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const scriptPath = path.join(process.cwd(), 'scripts', 'deploy-doctor.mjs');
const baseEnv = {
  PATH: process.env.PATH || '',
  NODE_OPTIONS: '',
  SPARK_UI_API_KEY: 'ui-key-placeholder-00000001',
  SPARK_BRIDGE_API_KEY: 'bridge-key-placeholder-0001',
  TELEGRAM_RELAY_SECRET: 'relay-secret-placeholder-0001'
};

function runDoctor(role: 'bot' | 'spawner', env: Record<string, string>) {
  return spawnSync(process.execPath, [scriptPath, '--role', role], {
    env: { ...baseEnv, ...env },
    encoding: 'utf8'
  });
}

test('deploy doctor fails malformed bot relay URL', () => {
  const result = runDoctor('bot', {
    BOT_TOKEN: 'dummy-bot-token',
    ADMIN_TELEGRAM_IDS: '12345',
    SPARK_GATEWAY_STATE_DIR: '/data/gateway',
    TELEGRAM_RELAY_URL: 'not-a-url',
    SPAWNER_UI_URL: 'http://spawner-ui.railway.internal:3000',
    SPAWNER_UI_PUBLIC_URL: 'https://spawner.example.test',
    TELEGRAM_RELAY_HOST: '::'
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL TELEGRAM_RELAY_URL: must be a valid http\/https URL/);
});

test('deploy doctor fails malformed Spawner service URL', () => {
  const result = runDoctor('bot', {
    BOT_TOKEN: 'dummy-bot-token',
    ADMIN_TELEGRAM_IDS: '12345',
    SPARK_GATEWAY_STATE_DIR: '/data/gateway',
    TELEGRAM_RELAY_URL: 'http://spark-telegram-bot.railway.internal:8788/spawner-events',
    SPAWNER_UI_URL: 'spawner-ui',
    TELEGRAM_RELAY_HOST: '::'
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL SPAWNER_UI_URL: must be a valid http\/https URL/);
});

test('deploy doctor fails malformed mission webhook URL', () => {
  const result = runDoctor('spawner', {
    HOST: '0.0.0.0',
    SPARK_HOSTED_PRIVATE_PREVIEW: '1',
    SPARK_WORKSPACE_ID: 'workspace-demo',
    SPARK_WORKSPACE_ROOT: '/data/workspace',
    SPAWNER_STATE_DIR: '/data/spawner-state',
    MISSION_CONTROL_WEBHOOK_URLS: 'not-a-url/spawner-events'
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL MISSION_CONTROL_WEBHOOK_URLS: must be a valid http\/https URL/);
});
