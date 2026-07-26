import assert from 'node:assert/strict';
import {
  DEFAULT_SPAWNER_UI_URL,
  normalizeSpawnerUrlEnv,
  resolveProjectPreviewBaseUrl,
  resolveSpawnerPublicUrl,
  resolveTelegramSpawnerSurfaceUrl,
  resolveSpawnerUiUrl
} from '../src/spawnerUrl';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('uses canonical Spawner URL first', () => {
  const env = {
    SPAWNER_UI_URL: 'http://spawner-ui.railway.internal:3000',
    SPARK_SPAWNER_URL: 'http://legacy-spawner.railway.internal:3000'
  } as NodeJS.ProcessEnv;

  assert.equal(resolveSpawnerUiUrl(env), 'http://spawner-ui.railway.internal:3000');
});

test('accepts SPARK_SPAWNER_URL as a compatibility alias', () => {
  const env = {
    SPARK_SPAWNER_URL: 'http://spawner-ui.railway.internal:3000'
  } as NodeJS.ProcessEnv;

  assert.equal(resolveSpawnerUiUrl(env), 'http://spawner-ui.railway.internal:3000');
});

test('normalizes alias into canonical env for older call sites', () => {
  const env = {
    SPARK_SPAWNER_URL: 'http://spawner-ui.railway.internal:3000'
  } as NodeJS.ProcessEnv;

  normalizeSpawnerUrlEnv(env);

  assert.equal(env.SPAWNER_UI_URL, 'http://spawner-ui.railway.internal:3000');
});

test('uses public URL for Telegram-facing links', () => {
  const env = {
    SPARK_SPAWNER_URL: 'http://spawner-ui.railway.internal:3000',
    SPAWNER_UI_PUBLIC_URL: 'https://spawner-demo.up.railway.app'
  } as NodeJS.ProcessEnv;

  assert.equal(resolveSpawnerPublicUrl(env), 'https://spawner-demo.up.railway.app');
  assert.equal(resolveProjectPreviewBaseUrl(env), 'https://spawner-demo.up.railway.app');
});

test('uses local Spawner URL for native Telegram interaction surfaces by default', () => {
  const env = {
    SPAWNER_UI_URL: 'http://127.0.0.1:3333',
    SPAWNER_UI_PUBLIC_URL: 'https://mission.sparkswarm.ai'
  } as NodeJS.ProcessEnv;

  assert.equal(resolveTelegramSpawnerSurfaceUrl(env), 'http://127.0.0.1:3333');
});

test('allows an explicit Telegram Spawner surface override', () => {
  const env = {
    SPAWNER_UI_URL: 'http://127.0.0.1:3333',
    SPAWNER_UI_PUBLIC_URL: 'https://mission.sparkswarm.ai',
    SPAWNER_TELEGRAM_SURFACE_URL: 'https://operator-access.example.test'
  } as NodeJS.ProcessEnv;

  assert.equal(resolveTelegramSpawnerSurfaceUrl(env), 'https://operator-access.example.test');
});

test('falls back to local Spawner URL', () => {
  assert.equal(resolveSpawnerUiUrl({} as NodeJS.ProcessEnv), DEFAULT_SPAWNER_UI_URL);
  assert.equal(resolveSpawnerUiUrl({ SPAWNER_UI_URL: '   ' } as NodeJS.ProcessEnv), DEFAULT_SPAWNER_UI_URL);
  assert.equal(
    resolveSpawnerUiUrl({
      SPAWNER_UI_URL: '   ',
      SPARK_SPAWNER_URL: '  http://legacy-spawner.internal:3333  '
    } as NodeJS.ProcessEnv),
    'http://legacy-spawner.internal:3333'
  );
});
