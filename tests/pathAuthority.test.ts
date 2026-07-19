import assert from 'node:assert/strict';
import path from 'node:path';
import { parseSafeOperatorAction } from '../src/operatorActions';
import { loadSparkTelegramProfileEnv, safeTelegramProfileName } from '../src/profileEnv';
import { resolveStatePath } from '../src/jsonState';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('state filenames stay single-segment under the configured gateway root', () => {
  const previous = process.env.SPARK_GATEWAY_STATE_DIR;
  process.env.SPARK_GATEWAY_STATE_DIR = path.join(path.sep, 'tmp', 'spark-state-root');
  try {
    assert.equal(
      resolveStatePath('.spark-safe-state.json'),
      path.join(process.env.SPARK_GATEWAY_STATE_DIR, '.spark-safe-state.json')
    );
    for (const unsafe of [
      '',
      '.',
      '..',
      '../escape.json',
      '..\\escape.json',
      'nested/escape.json',
      'nested\\escape.json',
      '/tmp/escape.json',
      'C:\\temp\\escape.json',
      'bad\0name.json'
    ]) {
      assert.throws(() => resolveStatePath(unsafe), /invalid state filename/i, unsafe);
    }
  } finally {
    if (previous === undefined) delete process.env.SPARK_GATEWAY_STATE_DIR;
    else process.env.SPARK_GATEWAY_STATE_DIR = previous;
  }
});

test('Telegram profile names are accepted exactly or rejected, never rewritten', () => {
  for (const valid of ['primary', 'spark-agi', 'recursive_2']) {
    assert.equal(safeTelegramProfileName(valid), valid);
  }
  for (const unsafe of ['../primary', '..\\primary', '/tmp/evil', 'C:\\tmp\\evil', 'primary/../../evil', 'primary.env', '', '.']) {
    assert.equal(safeTelegramProfileName(unsafe), null, unsafe);
  }
});

test('invalid Telegram profiles fail closed before env or secret loading', () => {
  const env = {
    SPARK_TELEGRAM_PROFILE: '../primary',
    BOT_TOKEN: 'must-not-survive-invalid-profile'
  } as NodeJS.ProcessEnv;
  assert.equal(loadSparkTelegramProfileEnv([], env), null);
  assert.equal(env.BOT_TOKEN, undefined);
  assert.equal(env.SPARK_PROFILE_TOKEN_MISSING, 'invalid_telegram_profile');
});

test('operator folder inspection is bound to the active Windows Desktop owner root', () => {
  const env = { USERPROFILE: 'C:\\Users\\ALICE' } as NodeJS.ProcessEnv;
  const prompt = (target: string) =>
    `Check whether ${target} exists. If it exists, list only the first 5 top-level folder names. Do not open files or read file contents.`;

  assert.deepEqual(parseSafeOperatorAction(prompt('C:\\Users\\ALICE\\Desktop'), env), {
    kind: 'folder_list',
    folderPath: 'C:\\Users\\ALICE\\Desktop',
    limit: 5
  });
  assert.equal(parseSafeOperatorAction(prompt('C:\\Users\\BOB\\Desktop'), env), null);
  assert.equal(parseSafeOperatorAction(prompt('C:\\Windows\\Desktop'), env), null);
  assert.equal(parseSafeOperatorAction(prompt('C:\\Users\\ALICE\\Documents\\Desktop'), env), null);
});

test('operator folder inspection honors an explicit Windows project root', () => {
  const env = { SPARK_PROJECT_ROOT: 'D:\\Spark\\Workspace' } as NodeJS.ProcessEnv;
  const prompt = (target: string) =>
    `Check whether ${target} exists. If it exists, list only the first 3 top-level folder names. Do not open files or read file contents.`;
  assert.deepEqual(parseSafeOperatorAction(prompt('D:\\Spark\\Workspace'), env), {
    kind: 'folder_list',
    folderPath: 'D:\\Spark\\Workspace',
    limit: 3
  });
  assert.equal(parseSafeOperatorAction(prompt('D:\\Other\\Workspace'), env), null);
});

test('Level 5 smoke files are bound to the active Windows temporary root', () => {
  const env = { USERPROFILE: 'C:\\Users\\ALICE' } as NodeJS.ProcessEnv;
  const prompt = (target: string) =>
    `Run a safe Level 5 smoke test: create a tiny file at ${target}, write "level5 ok", read it back, then delete it. Do not touch anything else. Tell me each step.`;
  assert.ok(parseSafeOperatorAction(prompt('C:\\Users\\ALICE\\AppData\\Local\\Temp\\spark-telegram-level5-smoke.txt'), env));
  assert.equal(parseSafeOperatorAction(prompt('C:\\Users\\BOB\\AppData\\Local\\Temp\\spark-telegram-level5-smoke.txt'), env), null);
});
