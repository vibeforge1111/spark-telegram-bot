import assert from 'node:assert/strict';
import { formatChipCreateProcessError, parseChipCreateJson } from '../src/chipCreate';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('parses successful chip create JSON', () => {
  const result = parseChipCreateJson(JSON.stringify({
    ok: true,
    chip_key: 'domain-chip-ascii-art',
    chip_path: 'C:\\Users\\USER\\.spark\\chips\\domain-chip-ascii-art',
    router_invokable: true,
    warnings: [],
    error: null,
  }));

  assert.deepEqual(result, {
    ok: true,
    chipKey: 'domain-chip-ascii-art',
    chipPath: 'C:\\Users\\USER\\.spark\\chips\\domain-chip-ascii-art',
    routerInvokable: true,
    warnings: [],
    error: undefined,
  });
});

test('extracts JSON error from failed Python stdout', () => {
  const message = formatChipCreateProcessError({
    message: 'Command failed: python -m spark_intelligence.cli chips create',
    stdout: JSON.stringify({
      ok: false,
      chip_key: null,
      chip_path: null,
      router_invokable: false,
      warnings: [],
      error: 'chip-labs root not found: C:\\Users\\USER\\.spark\\domain-chip-labs',
    }),
    stderr: '',
  });

  assert.equal(message, 'chip-labs root not found: C:\\Users\\USER\\.spark\\domain-chip-labs');
});
