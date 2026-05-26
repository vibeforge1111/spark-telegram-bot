import assert from 'node:assert/strict';

process.env.SPARK_BOT_TEST_MODE = '1';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || '0:telegram-command-parsing-test';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  const { extractTelegramCommandArgs } = await import('../src/index');

  await test('extractTelegramCommandArgs with basic arguments', () => {
    assert.equal(extractTelegramCommandArgs('/remember hello world', 'remember'), 'hello world');
    assert.equal(extractTelegramCommandArgs('/recall topic', 'recall'), 'topic');
  });

  await test('extractTelegramCommandArgs with @botname command suffixes', () => {
    assert.equal(extractTelegramCommandArgs('/remember@SparkBot hello world', 'remember'), 'hello world');
    assert.equal(extractTelegramCommandArgs('/recall@SparkBot topic', 'recall'), 'topic');
    assert.equal(extractTelegramCommandArgs('/forget@SomeOtherBot target', 'forget'), 'target');
  });

  await test('extractTelegramCommandArgs with leading/trailing spaces', () => {
    assert.equal(extractTelegramCommandArgs('   /remember   hello world   ', 'remember'), 'hello world');
    assert.equal(extractTelegramCommandArgs('\t/recall\ttopic\t', 'recall'), 'topic');
  });

  await test('extractTelegramCommandArgs with empty args', () => {
    assert.equal(extractTelegramCommandArgs('/remember', 'remember'), '');
    assert.equal(extractTelegramCommandArgs('/remember@SparkBot', 'remember'), '');
    assert.equal(extractTelegramCommandArgs('   /remember@SparkBot   ', 'remember'), '');
  });

  await test('extractTelegramCommandArgs with multiline args', () => {
    assert.equal(extractTelegramCommandArgs('/remember line1\nline2', 'remember'), 'line1\nline2');
    assert.equal(extractTelegramCommandArgs('/remember@SparkBot line1\r\nline2', 'remember'), 'line1\r\nline2');
  });

  await test('extractTelegramCommandArgs with mixed whitespace edge cases', () => {
    assert.equal(extractTelegramCommandArgs('/remember\t\targ\n\r', 'remember'), 'arg');
    assert.equal(extractTelegramCommandArgs('/remember@SparkBot\narg', 'remember'), 'arg');
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

