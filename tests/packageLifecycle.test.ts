import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const manifest = JSON.parse(
  readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

assert.equal(manifest.scripts?.start, 'node dist/index.js');
assert.equal(manifest.scripts?.prestart, undefined);
assert.equal(manifest.dependencies?.typescript, undefined);
assert.match(manifest.devDependencies?.typescript || '', /^\^5\./);

console.log('ok - production start uses packaged dist without a runtime TypeScript compiler');
