import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('runtime sync includes capability upgrade/eval fixtures', () => {
  const script = readFileSync('scripts/sync-runtime.cjs', 'utf-8');
  const testRunner = readFileSync('scripts/run-tests.cjs', 'utf-8');

  assert.match(script, /ops\/capability-natural-language-matrix\.json/);
  assert.match(script, /package-lock\.json/);
  assert.match(script, /tsconfig\.json/);
  assert.match(script, /spark\.toml/);
  assert.match(script, /\.spark['"],\s*['"]state['"],\s*['"]installed\.json/);
  assert.match(script, /SPARK_TELEGRAM_RUNTIME_ROOT/);
  assert.match(testRunner, /tests\/telegramVoiceBridge\.test\.ts/);
  assert.match(script, /dir:\s*'src'/);
  assert.match(script, /dir:\s*'dist'/);
  assert.match(script, /dir:\s*'ops'/);
  assert.match(script, /dir:\s*'vendor\/harness-core'/);
  assert.match(script, /dir:\s*'node_modules\/@spark\/harness-core'/);
  assert.match(script, /recursive:\s*true/);
  assert.match(script, /TEXT_SYNC_EXTENSIONS/);
  assert.match(script, /replace\(\/\\r\\n\?\/g,\s*'\\n'\)/);
  assert.match(script, /--check/);
});
