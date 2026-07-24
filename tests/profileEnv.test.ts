import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  loadEnvFileIntoProcess,
  loadSparkTelegramProfileEnv,
  resolveSparkCliCommand,
  resolveSparkHome,
  sparkConfigModulesDir,
  sparkSecretPythonBridgeCommand
} from '../src/profileEnv';

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

test('internal secret reads do not override the operator approval policy', () => {
  const source = readFileSync('src/profileEnv.ts', 'utf-8');

  assert.doesNotMatch(source, /SPARK_APPROVAL_ENFORCE/);
  assert.match(source, /from spark_cli\.cli import fetch_secret/);
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

test('resolves Spark home and installed CLI from a non-default prefix', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'spark-prefix-'));
  try {
    const executable = path.join(home, 'bin', process.platform === 'win32' ? 'spark.cmd' : 'spark');
    mkdirSync(path.dirname(executable), { recursive: true });
    writeFileSync(executable, '');
    const env = { SPARK_HOME: home } as NodeJS.ProcessEnv;

    assert.equal(resolveSparkHome(env), home);
    assert.equal(resolveSparkCliCommand(env), executable);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('honors an available PATH Spark command before the installed fallback', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'spark-path-precedence-'));
  try {
    const bin = path.join(root, 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, process.platform === 'win32' ? 'spark.cmd' : 'spark'), '');
    assert.equal(resolveSparkCliCommand({ PATH: bin, SPARK_HOME: path.join(root, 'home') }), process.platform === 'win32' ? 'spark.cmd' : 'spark');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('uses the SPARK_HOME-installed CLI source for secret reads', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'spark-cli-prefix-'));
  try {
    const cliSrc = path.join(home, 'tools', 'spark-cli', 'src');
    mkdirSync(cliSrc, { recursive: true });

    const command = sparkSecretPythonBridgeCommand('telegram.bot_token', {
      SPARK_HOME: home,
      SPARK_CLI_PYTHON: 'python3'
    } as NodeJS.ProcessEnv);

    assert.match(command.args[1], new RegExp(cliSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('keeps secret bridge fallback under SPARK_HOME instead of Desktop', () => {
  const home = path.join(tmpdir(), 'spark-cli-managed-fallback');
  const command = sparkSecretPythonBridgeCommand('telegram.bot_token', {
    SPARK_HOME: home,
    SPARK_CLI_PYTHON: 'python3'
  } as NodeJS.ProcessEnv);

  assert.match(command.args[1], new RegExp(path.join(home, 'tools', 'spark-cli', 'src').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(command.args[1], /Desktop[\\/]spark-cli/);
});

test('loads matching quoted env values without retaining wrapper quotes', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'spark-profile-quotes-'));
  try {
    const file = path.join(home, 'quoted.env');
    writeFileSync(file, [
      'DOUBLE_QUOTED="relay secret value"',
      "SINGLE_QUOTED='profile value'",
      'MISMATCHED="keep-this\'',
      'PLAIN=plain-value',
      'PADDED= value with outer spaces   ',
      'QUOTED_PADDED= " keep inner spaces "   '
    ].join('\n'));
    const env = {} as NodeJS.ProcessEnv;

    loadEnvFileIntoProcess(file, env);

    assert.equal(env.DOUBLE_QUOTED, 'relay secret value');
    assert.equal(env.SINGLE_QUOTED, 'profile value');
    assert.equal(env.MISMATCHED, '"keep-this\'');
    assert.equal(env.PLAIN, 'plain-value');
    assert.equal(env.PADDED, 'value with outer spaces');
    assert.equal(env.QUOTED_PADDED, ' keep inner spaces ');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('ignores an env path that becomes unreadable instead of crashing startup', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'spark-profile-unreadable-'));
  try {
    const env = { EXISTING: 'preserved' } as NodeJS.ProcessEnv;
    loadEnvFileIntoProcess(home, env);
    assert.deepEqual(env, { EXISTING: 'preserved' });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('runtime health wrapper forwards profile arguments', () => {
  const wrapper = readFileSync('scripts/run-health-runtime.cjs', 'utf-8');

  assert.match(wrapper, /process\.argv\.slice\(2\)/);
  assert.match(wrapper, /\.\.\.forwardedArgs/);
});

test('main Telegram runtime loads profile env before override env', () => {
  const source = readFileSync('src/index.ts', 'utf-8');
  const bootstrap = readFileSync('src/bootstrapEnv.ts', 'utf-8');
  const bootstrapImport = source.indexOf("import './bootstrapEnv';");
  const firstRuntimeImport = source.indexOf("import { execFile }");
  const profileLoad = bootstrap.indexOf('loadSparkTelegramProfileEnv(process.argv.slice(2), process.env, {');
  const overrideLoad = bootstrap.indexOf("loadEnv({ path: path.join(__dirname, '..', '.env.override'), override: true });");

  assert.equal(source.includes("import 'dotenv/config';"), false);
  assert.equal(bootstrapImport, 0);
  assert.ok(firstRuntimeImport > bootstrapImport);
  assert.notEqual(profileLoad, -1);
  assert.notEqual(overrideLoad, -1);
  assert.ok(profileLoad < overrideLoad);
});

test('named Telegram profiles do not load default source env fallback', () => {
  const bootstrap = readFileSync('src/bootstrapEnv.ts', 'utf-8');

  assert.match(bootstrap, /if \(!loadedTelegramProfile \|\| loadedTelegramProfile === 'default'\)/);
  assert.match(bootstrap, /path\.join\(__dirname, '\.\.', '\.env'\)/);
  assert.match(bootstrap, /override: false/);
});

test('main Telegram runtime exits before polling when profile token is missing', () => {
  const source = readFileSync('src/index.ts', 'utf-8');
  const missingProfileGuard = source.indexOf('const missingProfileToken = process.env.SPARK_PROFILE_TOKEN_MISSING?.trim();');
  const telegrafLaunch = source.indexOf('const bot = new Telegraf');

  assert.notEqual(missingProfileGuard, -1);
  assert.notEqual(telegrafLaunch, -1);
  assert.ok(missingProfileGuard < telegrafLaunch);
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

test('Telegram profile env refreshes Level 5 guardrails without preserving generic non-primary bot token', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'spark-profile-level5-env-'));
  try {
    const modulesDir = path.join(home, 'config', 'modules');
    mkdirSync(modulesDir, { recursive: true });
    writeFileSync(
      path.join(modulesDir, 'spark-telegram-bot.recursive.env'),
      [
        'BOT_TOKEN=recursive:test',
        'SPARK_ALLOW_HIGH_AGENCY_WORKERS=1',
        'SPARK_ALLOW_EXTERNAL_PROJECT_PATHS=1',
        'SPARK_CODEX_SANDBOX=danger-full-access'
      ].join('\n')
    );

    const env = {
      SPARK_HOME: home,
      SPARK_TELEGRAM_PROFILE: 'recursive',
      SPARK_ALLOW_HIGH_AGENCY_WORKERS: '0',
      SPARK_ALLOW_EXTERNAL_PROJECT_PATHS: '0',
      SPARK_CODEX_SANDBOX: 'read-only',
      BOT_TOKEN: 'already-loaded:test'
    } as NodeJS.ProcessEnv;
    const profile = loadSparkTelegramProfileEnv([], env, { preserveExisting: true });

    assert.equal(profile, 'recursive');
    assert.equal(env.BOT_TOKEN, undefined);
    assert.equal(env.SPARK_PROFILE_TOKEN_MISSING, 'telegram.profiles.recursive.bot_token');
    assert.equal(env.SPARK_ALLOW_HIGH_AGENCY_WORKERS, '1');
    assert.equal(env.SPARK_ALLOW_EXTERNAL_PROJECT_PATHS, '1');
    assert.equal(env.SPARK_CODEX_SANDBOX, 'danger-full-access');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
