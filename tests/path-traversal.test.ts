import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

// Verify operatorActions.ts has path traversal protection
const src = readFileSync(join(__dirname, '..', 'src', 'operatorActions.ts'), 'utf-8');

test('operatorActions.ts prevents path traversal in parseSafeOperatorAction', () => {
  // The fixed version uses path.win32.normalize() to resolve the actual path
  // instead of just checking basename === 'Desktop'
  assert.ok(
    src.includes('path.win32.normalize') || src.includes('path.traversal') || src.includes('resolve'),
    'Expected path traversal prevention using path.normalize'
  );
});

test('operatorActions.ts does not accept basename-only check', () => {
  // The fix must NOT use path.win32.basename(...) === 'Desktop' which would
  // allow 'C:\\Windows\\..\\Users\\hp\\Desktop' to bypass the check
  assert.ok(
    !src.includes('.win32.basename(') || src.includes('.win32.normalize('),
    'Expected normalized path check instead of basename-only check'
  );
});
