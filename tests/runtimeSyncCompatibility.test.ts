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
  assert.match(testRunner, /const SKIP = new Map/);
  assert.match(testRunner, /fs\.readdirSync\(testsDir\)/);
  assert.match(testRunner, /fileName\.endsWith\('\.test\.ts'\)/);
  assert.match(testRunner, /scheduleParser\.test\.ts/);
  assert.match(testRunner, /Superseded legacy SPARK_MODEL_ROUTER parser/);
  assert.match(testRunner, /SPARK_TURN_TRACE_PATH/);
  assert.match(testRunner, /SPARK_NATURAL_ROUTE_LEDGER/);
  assert.match(script, /dir:\s*'src'/);
  assert.match(script, /dir:\s*'dist'/);
  assert.match(script, /dir:\s*'ops'/);
  assert.match(script, /dir:\s*'vendor\/harness-core'/);
  assert.match(script, /--check/);
});
