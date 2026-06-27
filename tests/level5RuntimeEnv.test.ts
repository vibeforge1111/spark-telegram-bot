import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { effectiveLevel5RuntimeEnv, level5RuntimeGuardrailsActive } from '../src/level5RuntimeEnv';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

void (async () => {
  await test('promotes stale read-only Telegram process env from persisted Level 5 guardrails', async () => {
    const sparkHome = await mkdtemp(path.join(os.tmpdir(), 'spark-level5-runtime-env-'));
    const modulesDir = path.join(sparkHome, 'config', 'modules');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(modulesDir, { recursive: true }));
    await writeFile(
      path.join(modulesDir, 'spark-telegram-bot.env'),
      [
        'SPARK_ALLOW_HIGH_AGENCY_WORKERS=1',
        'SPARK_ALLOW_EXTERNAL_PROJECT_PATHS=1',
        'SPARK_CODEX_SANDBOX=danger-full-access',
        '',
      ].join('\n'),
      'utf8'
    );

    const staleEnv: Record<string, string | undefined> = {
      SPARK_HOME: sparkHome,
      SPARK_CODEX_SANDBOX: 'read-only',
    };
    const env = effectiveLevel5RuntimeEnv(staleEnv);

    assert.equal(env.SPARK_ALLOW_HIGH_AGENCY_WORKERS, '1');
    assert.equal(env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS, '1');
    assert.equal(env.SPARK_CODEX_SANDBOX, 'danger-full-access');
    assert.equal(level5RuntimeGuardrailsActive({ SPARK_HOME: sparkHome, SPARK_CODEX_SANDBOX: 'read-only' }), true);
  });

  await test('does not promote partial persisted Level 5 guardrails', async () => {
    const sparkHome = await mkdtemp(path.join(os.tmpdir(), 'spark-level5-runtime-env-partial-'));
    const modulesDir = path.join(sparkHome, 'config', 'modules');
    await import('node:fs/promises').then(({ mkdir }) => mkdir(modulesDir, { recursive: true }));
    await writeFile(
      path.join(modulesDir, 'spark-telegram-bot.env'),
      [
        'SPARK_ALLOW_HIGH_AGENCY_WORKERS=1',
        'SPARK_CODEX_SANDBOX=danger-full-access',
        '',
      ].join('\n'),
      'utf8'
    );

    const staleEnv: Record<string, string | undefined> = {
      SPARK_HOME: sparkHome,
      SPARK_CODEX_SANDBOX: 'read-only',
    };
    const env = effectiveLevel5RuntimeEnv(staleEnv);

    assert.equal(env.SPARK_CODEX_SANDBOX, 'read-only');
    assert.equal(level5RuntimeGuardrailsActive({ SPARK_HOME: sparkHome, SPARK_CODEX_SANDBOX: 'read-only' }), false);
  });
})();
