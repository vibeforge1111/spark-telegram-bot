import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('recursive bridge subprocesses inherit effective Level 5 runtime env', () => {
  const source = readFileSync(path.join(__dirname, '..', 'src', 'recursive.ts'), 'utf8');
  assert.match(source, /import \{ effectiveLevel5RuntimeEnv \} from '\.\/level5RuntimeEnv';/);
  assert.equal(
    (source.match(/effectiveLevel5RuntimeEnv\(\{ \.\.\.process\.env \}\)/g) || []).length,
    3
  );
  assert.doesNotMatch(source, /const env: NodeJS\.ProcessEnv = \{ \.\.\.process\.env \};/);
  assert.doesNotMatch(source, /const env: NodeJS\.ProcessEnv = \{\s*\.\.\.process\.env\s*\};/);
});
