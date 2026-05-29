import assert from 'node:assert/strict';

process.env.SPARK_BOT_TEST_MODE = '1';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
process.env.TELEGRAM_RELAY_SECRET = process.env.TELEGRAM_RELAY_SECRET || 'group-addressing-test-relay-secret-123456';

async function run(): Promise<void> {
  const { isAddressedGroupText } = await import('../src/index');
  const botInfo = { id: 42, username: 'SEJTeamBot' };

  assert.equal(
    isAddressedGroupText({ chat: { type: 'supergroup' }, message: {}, botInfo }, 'plain team chatter'),
    false
  );
  assert.equal(
    isAddressedGroupText({ chat: { type: 'supergroup' }, message: {}, botInfo }, '@SEJTeamBot please check'),
    true
  );
  assert.equal(
    isAddressedGroupText({ chat: { type: 'supergroup' }, message: {}, botInfo }, 'Spark please check'),
    true
  );
  assert.equal(
    isAddressedGroupText({ chat: { type: 'group' }, message: { reply_to_message: { from: { id: 42 } } }, botInfo }, 'replying here'),
    true
  );
  assert.equal(
    isAddressedGroupText({ chat: { type: 'private' }, message: {}, botInfo }, 'plain private chat'),
    true
  );

  console.log('ok - group text only addresses Spark when tagged, prefixed, or replying to bot');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
