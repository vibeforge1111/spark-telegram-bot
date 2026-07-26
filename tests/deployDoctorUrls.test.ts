import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

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

const malformedBot = runDoctor('bot', {
  BOT_TOKEN: 'dummy-bot-token',
  ADMIN_TELEGRAM_IDS: '12345',
  SPARK_GATEWAY_STATE_DIR: '/data/gateway',
  TELEGRAM_RELAY_URL: 'not-a-url',
  SPAWNER_UI_URL: 'http://spawner-ui.railway.internal:3000',
  SPAWNER_UI_PUBLIC_URL: 'https://spawner.example.test',
  TELEGRAM_RELAY_HOST: '::'
});
assert.equal(malformedBot.status, 1);
assert.match(malformedBot.stdout, /FAIL TELEGRAM_RELAY_URL: must be a valid http\/https URL/);

const malformedSpawner = runDoctor('spawner', {
  HOST: '0.0.0.0',
  SPARK_HOSTED_PRIVATE_PREVIEW: '1',
  SPARK_WORKSPACE_ID: 'workspace-demo',
  SPARK_WORKSPACE_ROOT: '/data/workspace',
  SPAWNER_STATE_DIR: '/data/spawner-state',
  MISSION_CONTROL_WEBHOOK_URLS: 'not-a-url/spawner-events'
});
assert.equal(malformedSpawner.status, 1);
assert.match(malformedSpawner.stdout, /FAIL MISSION_CONTROL_WEBHOOK_URLS: must be a valid http\/https URL/);
console.log('ok - deploy doctor rejects malformed service URLs');
