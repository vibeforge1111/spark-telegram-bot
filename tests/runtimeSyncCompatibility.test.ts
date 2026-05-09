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

  assert.match(script, /ops\/capability-natural-language-matrix\.json/);
  assert.match(script, /package-lock\.json/);
  assert.match(script, /tsconfig\.json/);
  assert.match(script, /spark\.toml/);
  assert.match(script, /dir:\s*'src'/);
  assert.match(script, /dir:\s*'dist'/);
  assert.match(script, /dir:\s*'ops'/);
  assert.match(script, /--check/);
});
