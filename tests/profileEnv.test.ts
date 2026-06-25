import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadSparkTelegramProfileEnv, sparkConfigModulesDir, sparkSecretPythonBridgeCommand } from '../src/profileEnv';

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

test('main Telegram runtime loads profile env before override env', () => {
  const source = readFileSync('src/index.ts', 'utf-8');
  const profileLoad = source.indexOf('loadSparkTelegramProfileEnv(process.argv.slice(2), process.env, { preserveExisting: true });');
  const overrideLoad = source.indexOf("loadEnv({ path: path.join(__dirname, '..', '.env.override'), override: true });");

  assert.notEqual(profileLoad, -1);
  assert.notEqual(overrideLoad, -1);
  assert.ok(profileLoad < overrideLoad);
});

test('Telegram profile env loads streaming defaults without overriding explicit runtime env', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'spark-profile-env-'));
  try {
    const modulesDir = path.join(home, 'config', 'modules');
    mkdirSync(modulesDir, { recursive: true });
    writeFileSync(
      path.join(modulesDir, 'spark-telegram-bot.env'),
      [
        'SPARK_TELEGRAM_PROFILE=primary',
        'SPARK_TELEGRAM_CHAT_STREAMING=1',
        'SPARK_TELEGRAM_RICH_MESSAGES=1',
        'SPARK_TELEGRAM_DRAFT_METHOD=rich',
        'SPARK_TELEGRAM_DRAFT_PREVIEW_FULL_REPLIES=1'
      ].join('\n')
    );
    writeFileSync(
      path.join(modulesDir, 'spark-telegram-bot.primary.env'),
      [
        'SPARK_TELEGRAM_DRAFT_INTERVAL_MS=500',
        'ADMIN_TELEGRAM_IDS=999'
      ].join('\n')
    );

    const env = {
      SPARK_HOME: home,
      SPARK_TELEGRAM_PROFILE: 'primary',
      ADMIN_TELEGRAM_IDS: '123',
      BOT_TOKEN: '123:test',
      TEST_BOT_TOKEN: '0:test-token'
    } as NodeJS.ProcessEnv;
    const profile = loadSparkTelegramProfileEnv([], env, { preserveExisting: true });

    assert.equal(profile, 'primary');
    assert.equal(env.SPARK_TELEGRAM_CHAT_STREAMING, '1');
    assert.equal(env.SPARK_TELEGRAM_RICH_MESSAGES, '1');
    assert.equal(env.SPARK_TELEGRAM_DRAFT_METHOD, 'rich');
    assert.equal(env.SPARK_TELEGRAM_DRAFT_PREVIEW_FULL_REPLIES, '1');
    assert.equal(env.SPARK_TELEGRAM_DRAFT_INTERVAL_MS, '500');
    assert.equal(env.ADMIN_TELEGRAM_IDS, '123');
    assert.equal(env.BOT_TOKEN, '123:test');
    assert.equal(env.SPARK_PROFILE_TOKEN_MISSING, undefined);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
