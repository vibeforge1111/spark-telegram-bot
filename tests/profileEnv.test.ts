import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { applySparkTelegramProfileSecrets, sparkConfigModulesDir, sparkSecretPythonBridgeCommand } from '../src/profileEnv';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('loads profile secrets through Spark internal keychain fetch', () => {
  const command = sparkSecretPythonBridgeCommand('telegram.profiles.spark-agi.bot_token', {
    SPARK_CLI_SRC: 'C:\\spark-cli\\src',
    SPARK_BUILDER_PYTHON: 'C:\\Python313\\python.exe'
  } as NodeJS.ProcessEnv);

  assert.equal(command.python, 'C:\\Python313\\python.exe');
  assert.equal(command.args[0], '-c');
  assert.equal(command.args[2], 'telegram.profiles.spark-agi.bot_token');
  assert.match(command.args[1], /from spark_cli\.cli import fetch_secret/);
  assert.doesNotMatch(command.args[1], /secrets get|--reveal/);
});

test('prefers explicit Spark CLI Python over Builder Python', () => {
  const command = sparkSecretPythonBridgeCommand('telegram.profiles.testerthebester.bot_token', {
    SPARK_CLI_PYTHON: 'C:\\SparkPython\\python.exe',
    SPARK_BUILDER_PYTHON: 'C:\\Python313\\python.exe'
  } as NodeJS.ProcessEnv);

  assert.equal(command.python, 'C:\\SparkPython\\python.exe');
});

test('uses SPARK_HOME for generated module env files', () => {
  const configDir = sparkConfigModulesDir({ SPARK_HOME: 'C:\\SparkHome' } as NodeJS.ProcessEnv);

  assert.equal(configDir, path.join('C:\\SparkHome', 'config', 'modules'));
});

test('runtime health wrapper forwards profile arguments', () => {
  const wrapper = readFileSync('scripts/run-health-runtime.cjs', 'utf-8');

  assert.match(wrapper, /process\.argv\.slice\(2\)/);
  assert.match(wrapper, /\.\.\.forwardedArgs/);
});

test('profile secret loader falls back to global relay secret', () => {
  const env = {
    TEST_BOT_TOKEN: '123:test-profile-token'
  } as NodeJS.ProcessEnv;

  applySparkTelegramProfileSecrets('spark-recursive', env, (secretId) => {
    if (secretId === 'telegram.relay_secret') return 'relay-secret-from-global';
    return null;
  });

  assert.equal(env.BOT_TOKEN, '123:test-profile-token');
  assert.equal(env.TELEGRAM_RELAY_SECRET, 'relay-secret-from-global');
  assert.equal(env.SPARK_PROFILE_RELAY_SECRET_MISSING, undefined);
});

test('profile relay secret overrides global relay secret', () => {
  const env = {
    TEST_BOT_TOKEN: '123:test-profile-token'
  } as NodeJS.ProcessEnv;

  applySparkTelegramProfileSecrets('spark-agi', env, (secretId) => {
    if (secretId === 'telegram.profiles.spark-agi.relay_secret') return 'relay-secret-from-profile';
    if (secretId === 'telegram.relay_secret') return 'relay-secret-from-global';
    return null;
  });

  assert.equal(env.TELEGRAM_RELAY_SECRET, 'relay-secret-from-profile');
});
