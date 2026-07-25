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

test('installable artifact binds and bundles the private Harness Core workspace', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
  const harnessPackage = JSON.parse(readFileSync('vendor/harness-core/package.json', 'utf8'));

  assert.deepEqual(packageJson.workspaces, ['vendor/harness-core']);
  assert.equal(packageJson.dependencies?.['@spark/harness-core'], harnessPackage.version);
  assert.ok(packageJson.bundleDependencies?.includes('@spark/harness-core'));
});
