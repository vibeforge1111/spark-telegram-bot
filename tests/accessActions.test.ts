import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  accessActionNeedsConfirmation,
  buildSparkAccessActionKeyboard,
  buildSparkAccessChangeKeyboard,
  buildSparkAccessConfirmationKeyboard,
  buildSparkAccessLevel5ConfirmKeyboard,
  accessActionNeedsSparkRestart,
  formatSparkAccessAutomaticRestartNotice,
  formatSparkAccessActionConfirmationPrompt,
  formatSparkAccessActionFailureReply,
  formatSparkAccessActionReply,
  runSparkAccessAction,
  runSparkAccessActionDetailed,
} from '../src/accessActions';

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
  await test('default action runner promotes stale read-only env from persisted Level 5 guardrails', async () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-level5-action-env-'));
    const binDir = path.join(tempRoot, 'bin');
    const sparkHome = path.join(tempRoot, 'spark-home');
    const modulesDir = path.join(sparkHome, 'config', 'modules');
    const envCapturePath = path.join(tempRoot, 'child-env.json');
    const oldPath = process.env.PATH;
    const oldSparkHome = process.env.SPARK_HOME;
    const oldSandbox = process.env.SPARK_CODEX_SANDBOX;
    const oldHighAgency = process.env.SPARK_ALLOW_HIGH_AGENCY_WORKERS;
    const oldExternalPaths = process.env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS;
    try {
      await import('node:fs/promises').then(({ mkdir }) => mkdir(modulesDir, { recursive: true }));
      await import('node:fs/promises').then(({ mkdir }) => mkdir(binDir, { recursive: true }));
      writeFileSync(
        path.join(modulesDir, 'spark-telegram-bot.env'),
        [
          'SPARK_ALLOW_HIGH_AGENCY_WORKERS=1',
          'SPARK_ALLOW_EXTERNAL_PROJECT_PATHS=1',
          'SPARK_CODEX_SANDBOX=danger-full-access',
          '',
        ].join('\n'),
        'utf8'
      );
      writeFileSync(
        path.join(binDir, 'spark'),
        [
          '#!/bin/sh',
          `printf '{"sandbox":"%s","highAgency":"%s","externalPaths":"%s"}\\n' "$SPARK_CODEX_SANDBOX" "$SPARK_ALLOW_HIGH_AGENCY_WORKERS" "$SPARK_ALLOW_EXTERNAL_PROJECT_PATHS" > "${envCapturePath.replace(/"/g, '\\"')}"`,
          'printf \'{"ok":true,"effective_access_level":5,"level5":{"service_enabled":true,"activation_state":"active_for_services","effective_codex_sandbox":"danger-full-access"},"state_machine":{"service_can_operate_whole_computer":true}}\\n\'',
          ''
        ].join('\n'),
        'utf8'
      );
      chmodSync(path.join(binDir, 'spark'), 0o755);
      process.env.PATH = `${binDir}${path.delimiter}${oldPath || ''}`;
      process.env.SPARK_HOME = sparkHome;
      process.env.SPARK_CODEX_SANDBOX = 'read-only';
      delete process.env.SPARK_ALLOW_HIGH_AGENCY_WORKERS;
      delete process.env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS;

      const result = await runSparkAccessActionDetailed('level5_enable');
      const childEnv = JSON.parse(readFileSync(envCapturePath, 'utf8')) as Record<string, string>;

      assert.equal(result.payload?.ok, true);
      assert.equal(childEnv.sandbox, 'danger-full-access');
      assert.equal(childEnv.highAgency, '1');
      assert.equal(childEnv.externalPaths, '1');
      assert.match(result.reply, /whole-computer operator mode is active/i);
    } finally {
      if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
      if (oldSparkHome === undefined) delete process.env.SPARK_HOME; else process.env.SPARK_HOME = oldSparkHome;
      if (oldSandbox === undefined) delete process.env.SPARK_CODEX_SANDBOX; else process.env.SPARK_CODEX_SANDBOX = oldSandbox;
      if (oldHighAgency === undefined) delete process.env.SPARK_ALLOW_HIGH_AGENCY_WORKERS; else process.env.SPARK_ALLOW_HIGH_AGENCY_WORKERS = oldHighAgency;
      if (oldExternalPaths === undefined) delete process.env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS; else process.env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS = oldExternalPaths;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  await test('default action runner promotes stale read-only env from the active Telegram profile guardrails', async () => {
    const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-level5-action-profile-env-'));
    const binDir = path.join(tempRoot, 'bin');
    const sparkHome = path.join(tempRoot, 'spark-home');
    const modulesDir = path.join(sparkHome, 'config', 'modules');
    const envCapturePath = path.join(tempRoot, 'child-env.json');
    const oldPath = process.env.PATH;
    const oldSparkHome = process.env.SPARK_HOME;
    const oldProfile = process.env.SPARK_TELEGRAM_PROFILE;
    const oldSandbox = process.env.SPARK_CODEX_SANDBOX;
    const oldHighAgency = process.env.SPARK_ALLOW_HIGH_AGENCY_WORKERS;
    const oldExternalPaths = process.env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS;
    try {
      await import('node:fs/promises').then(({ mkdir }) => mkdir(modulesDir, { recursive: true }));
      await import('node:fs/promises').then(({ mkdir }) => mkdir(binDir, { recursive: true }));
      writeFileSync(
        path.join(modulesDir, 'spark-telegram-bot.recursive.env'),
        [
          'BOT_NAME=recursive',
          'BOT_TOKEN=fake-recursive-token',
          'SPARK_ALLOW_HIGH_AGENCY_WORKERS=1',
          'SPARK_ALLOW_EXTERNAL_PROJECT_PATHS=1',
          'SPARK_CODEX_SANDBOX=danger-full-access',
          '',
        ].join('\n'),
        'utf8'
      );
      writeFileSync(
        path.join(binDir, 'spark'),
        [
          '#!/bin/sh',
          `printf '{"sandbox":"%s","highAgency":"%s","externalPaths":"%s","profile":"%s"}\\n' "$SPARK_CODEX_SANDBOX" "$SPARK_ALLOW_HIGH_AGENCY_WORKERS" "$SPARK_ALLOW_EXTERNAL_PROJECT_PATHS" "$SPARK_TELEGRAM_PROFILE" > "${envCapturePath.replace(/"/g, '\\"')}"`,
          'printf \'{"ok":true,"effective_access_level":5,"level5":{"service_enabled":true,"activation_state":"active_for_services","effective_codex_sandbox":"danger-full-access"},"state_machine":{"service_can_operate_whole_computer":true}}\\n\'',
          ''
        ].join('\n'),
        'utf8'
      );
      chmodSync(path.join(binDir, 'spark'), 0o755);
      process.env.PATH = `${binDir}${path.delimiter}${oldPath || ''}`;
      process.env.SPARK_HOME = sparkHome;
      process.env.SPARK_TELEGRAM_PROFILE = 'recursive';
      process.env.SPARK_CODEX_SANDBOX = 'read-only';
      delete process.env.SPARK_ALLOW_HIGH_AGENCY_WORKERS;
      delete process.env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS;

      const result = await runSparkAccessActionDetailed('level5_enable');
      const childEnv = JSON.parse(readFileSync(envCapturePath, 'utf8')) as Record<string, string>;

      assert.equal(result.payload?.ok, true);
      assert.equal(childEnv.profile, 'recursive');
      assert.equal(childEnv.sandbox, 'danger-full-access');
      assert.equal(childEnv.highAgency, '1');
      assert.equal(childEnv.externalPaths, '1');
      assert.match(result.reply, /whole-computer operator mode is active/i);
    } finally {
      if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
      if (oldSparkHome === undefined) delete process.env.SPARK_HOME; else process.env.SPARK_HOME = oldSparkHome;
      if (oldProfile === undefined) delete process.env.SPARK_TELEGRAM_PROFILE; else process.env.SPARK_TELEGRAM_PROFILE = oldProfile;
      if (oldSandbox === undefined) delete process.env.SPARK_CODEX_SANDBOX; else process.env.SPARK_CODEX_SANDBOX = oldSandbox;
      if (oldHighAgency === undefined) delete process.env.SPARK_ALLOW_HIGH_AGENCY_WORKERS; else process.env.SPARK_ALLOW_HIGH_AGENCY_WORKERS = oldHighAgency;
      if (oldExternalPaths === undefined) delete process.env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS; else process.env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS = oldExternalPaths;
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  await test('runs workspace setup through the Spark CLI JSON action', async () => {
    const reply = await runSparkAccessAction('workspace_setup', async (args, timeoutMs) => {
      assert.deepEqual(args, ['access', 'setup', '--json']);
      assert.equal(timeoutMs, 60_000);
      return {
        stdout: JSON.stringify({
          ok: true,
          effective_access_level: 4,
          recommended: { id: 'spark_workspace' },
          next: 'spark access status',
        }),
        stderr: '',
      };
    });

    assert.match(reply, /Safe workspace setup is ready/);
    assert.match(reply, /Effective access level: 4/);
    assert.match(reply, /Recommended lane: spark_workspace/);
  });

  await test('keeps Docker smoke and Level 5 behind confirmation', () => {
    assert.equal(accessActionNeedsConfirmation('workspace_setup'), false);
    assert.equal(accessActionNeedsConfirmation('docker_doctor'), false);
    assert.equal(accessActionNeedsConfirmation('docker_smoke'), true);
    assert.equal(accessActionNeedsConfirmation('level5_enable'), true);
    assert.equal(accessActionNeedsConfirmation('level5_disable'), true);
  });

  await test('formats Level 5 setup as restart-required operator guidance', () => {
    const reply = formatSparkAccessActionReply('level5_enable', {
      ok: true,
      level5: { activation_state: 'restart_required' },
      next: 'spark restart',
    });

    assert.match(reply, /Level 5 guardrails were configured/);
    assert.match(reply, /Activation state: restart_required/);
    assert.match(reply, /reload Telegram and Spawner/);
    assert.match(reply, /Next: spark restart/);
  });

  await test('marks Level 5 access changes as automatic Spark restart candidates', async () => {
    assert.equal(accessActionNeedsSparkRestart('workspace_setup', { next: 'spark restart' }), false);
    assert.equal(
      accessActionNeedsSparkRestart('level5_enable', {
        level5: { activation_state: 'restart_required' },
        next: 'spark restart',
      }),
      true
    );

    const result = await runSparkAccessActionDetailed('level5_enable', async () => ({
      stdout: JSON.stringify({
        ok: true,
        level5: { activation_state: 'restart_required' },
        state_machine: { requires_restart: true },
        next: 'spark restart',
      }),
      stderr: '',
    }));

    assert.equal(result.needsSparkRestart, true);
    assert.match(formatSparkAccessAutomaticRestartNotice('level5_enable'), /do not need Terminal or PowerShell/);
    assert.match(formatSparkAccessAutomaticRestartNotice('level5_enable'), /is Level 5 active\?/);
    assert.match(formatSparkAccessAutomaticRestartNotice('level5_disable'), /\/access/);
  });

  await test('runs Level 5 setup with high-agency guardrails and reports active services', async () => {
    const result = await runSparkAccessActionDetailed('level5_enable', async (args, timeoutMs) => {
      assert.deepEqual(args, ['access', 'setup', '--level', '5', '--enable-high-agency', '--json']);
      assert.equal(timeoutMs, 60_000);
      return {
        stdout: JSON.stringify({
          ok: true,
          effective_access_level: 5,
          level5: {
            service_enabled: true,
            activation_state: 'active_for_services',
            service_codex_sandbox: 'danger-full-access',
            effective_codex_sandbox: 'danger-full-access',
            configured_codex_sandbox: 'danger-full-access',
          },
          state_machine: {
            service_can_operate_whole_computer: true,
          },
        }),
        stderr: '',
      };
    });

    assert.equal(result.needsSparkRestart, false);
    assert.match(result.reply, /Level 5 guardrails were configured/);
    assert.match(result.reply, /whole-computer operator mode is active/i);
    assert.match(result.reply, /Effective Codex sandbox: danger-full-access/);
    assert.doesNotMatch(result.reply, /needs to reload/i);
  });

  await test('does not present Level 5 as full access when effective sandbox is read-only', () => {
    const reply = formatSparkAccessActionReply('level5_enable', {
      ok: true,
      effective_access_level: 5,
      level5: {
        service_enabled: true,
        activation_state: 'active_for_services',
        service_codex_sandbox: 'danger-full-access',
        effective_codex_sandbox: 'read-only',
        configured_codex_sandbox: 'danger-full-access',
      },
      state_machine: {
        service_can_operate_whole_computer: true,
      },
    });

    assert.match(reply, /full access is blocked/i);
    assert.match(reply, /Attention: effective Codex sandbox is read-only, so Level 5 is not full-access yet/);
    assert.doesNotMatch(reply, /Whole-computer operator mode is active/);
    assert.doesNotMatch(reply, /Effective Codex sandbox: danger-full-access/);
  });

  await test('requires effective Level 5 sandbox proof instead of falling back to configured service sandbox', () => {
    const reply = formatSparkAccessActionReply('level5_enable', {
      ok: true,
      effective_access_level: 5,
      level5: {
        service_enabled: true,
        activation_state: 'active_for_services',
        service_codex_sandbox: 'danger-full-access',
        configured_codex_sandbox: 'danger-full-access',
      },
      state_machine: {
        service_can_operate_whole_computer: true,
      },
    });

    assert.match(reply, /full access is blocked/i);
    assert.match(reply, /Attention: effective Codex sandbox is unknown, so Level 5 is not full-access yet/);
    assert.doesNotMatch(reply, /Whole-computer operator mode is active/);
    assert.doesNotMatch(reply, /Effective Codex sandbox: danger-full-access/);
  });

  await test('returns a useful Telegram-safe message when CLI requires interactive access confirmation', async () => {
    const result = await runSparkAccessActionDetailed('level5_disable', async () => {
      const error = new Error('Command failed: spark access disable-level5 --json') as Error & { stderr?: string };
      error.stderr = [
        'Spark blocked a sensitive action because this shell is non-interactive.',
        'Run the command again in an interactive terminal so Spark can ask for confirmation.'
      ].join('\n');
      throw error;
    });

    assert.equal(result.payload?.ok, false);
    assert.match(result.reply, /interactive confirmation/i);
    assert.match(result.reply, /spark access disable-level5/);
    assert.doesNotMatch(result.reply, /configuration problem/i);
  });

  await test('preserves structured Spark JSON from a non-zero CLI exit', async () => {
    const result = await runSparkAccessActionDetailed('docker_doctor', async () => {
      const error = new Error('Command failed: spark access docker-doctor --json') as Error & { stdout?: string };
      error.stdout = JSON.stringify({ ok: false, error: 'Docker is not reachable.', next: 'Start Docker and check again.' });
      throw error;
    });

    assert.equal(result.payload?.ok, false);
    assert.match(result.reply, /Docker sandbox is not ready yet/i);
    assert.match(result.reply, /Start Docker and check again/i);
    assert.doesNotMatch(result.reply, /Command failed/i);
    assert.equal(result.needsSparkRestart, false);
  });

  await test('formats workspace setup failures with safe recovery guidance', () => {
    const reply = formatSparkAccessActionFailureReply(
      'workspace_setup',
      new Error('Command failed from /Users/operator/private-workspace with token sk-test-secret')
    );

    assert.match(reply, /Safe workspace setup could not complete/);
    assert.match(reply, /Send \/diagnose here/);
    assert.match(reply, /spark access setup --json/);
    assert.match(reply, /Do not paste tokens/);
    assert.doesNotMatch(reply, /\/Users\/operator|sk-test-secret|Spark access action failed:/);
  });

  await test('formats Docker smoke as no-secret sandbox evidence', () => {
    const reply = formatSparkAccessActionReply('docker_smoke', {
      ok: true,
      next: 'Docker no-secret sandbox smoke passed.',
    });

    assert.match(reply, /Docker sandbox smoke passed/);
    assert.match(reply, /without Spark secrets/);
    assert.match(reply, /Docker socket/);
  });

  await test('renders access action buttons without noisy Level 5 internals', () => {
    const developerKeyboard = buildSparkAccessActionKeyboard('developer').reply_markup.inline_keyboard;
    const developerCallbacks = developerKeyboard.flat().map((button) => button.callback_data);
    const developerLabels = developerKeyboard.flat().map((button) => button.text);

    assert.deepEqual(developerCallbacks, [
      'spark_access:workspace_setup',
      'spark_access:docker_doctor',
      'spark_access:docker_smoke',
    ]);
    assert.deepEqual(developerLabels, [
      'Set up safe workspace',
      'Check runner',
      'Test sandbox',
    ]);

    const operatorKeyboard = buildSparkAccessActionKeyboard('operator').reply_markup.inline_keyboard;
    const operatorCallbacks = operatorKeyboard.flat().map((button) => button.callback_data);
    const operatorLabels = operatorKeyboard.flat().map((button) => button.text);

    assert.deepEqual(operatorCallbacks, developerCallbacks);
    assert.deepEqual(operatorLabels, developerLabels);
    assert.ok(!operatorCallbacks.includes('spark_access:level5_enable'));
    assert.ok(!operatorCallbacks.includes('spark_access:level5_disable'));
    assert.ok(!operatorLabels.includes('Return to Level 4'));
  });

  await test('renders compact access-change buttons after choosing a level', () => {
    const developerKeyboard = buildSparkAccessChangeKeyboard('developer')?.reply_markup.inline_keyboard.flat().map((button) => button.callback_data);

    assert.deepEqual(developerKeyboard, ['spark_access:workspace_setup']);
    assert.equal(buildSparkAccessChangeKeyboard('operator'), undefined);
    assert.equal(buildSparkAccessChangeKeyboard('agent'), undefined);
  });

  await test('renders one-tap confirmation for access level 5', () => {
    const keyboard = buildSparkAccessLevel5ConfirmKeyboard().reply_markup.inline_keyboard;

    assert.equal(keyboard[0][0].text, 'Confirm Access Level 5');
    assert.equal(keyboard[0][0].callback_data, 'spark_access_level:operator:confirm');
  });

  await test('renders confirm button for guarded access actions', () => {
    const prompt = formatSparkAccessActionConfirmationPrompt('level5_enable');
    const keyboard = buildSparkAccessConfirmationKeyboard('level5_enable').reply_markup.inline_keyboard;

    assert.match(prompt, /whole-computer operator mode/);
    assert.match(prompt, /tap Confirm/);
    assert.equal(keyboard[0][0].text, 'Confirm Access Level 5');
    assert.equal(keyboard[0][0].callback_data, 'spark_access:level5_enable:confirm');
  });
})();
