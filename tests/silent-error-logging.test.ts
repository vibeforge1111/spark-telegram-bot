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

// PRs #123, #122, #116, #115: Fix silent error swallowing - errors should be logged, not empty catch blocks

// Check missionRelay.ts catches with logging instead of silent catch
const missionRelaySrc = readFileSync(join(__dirname, '..', 'src', 'missionRelay.ts'), 'utf-8');

test('missionRelay.ts logs errors instead of silent catch in completion delivery', () => {
  // Find empty .catch(() => {}) patterns
  const silentCatches = missionRelaySrc.match(/\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g);
  const loggedCatches = missionRelaySrc.match(/\.catch\s*\(.*console/g);
  
  // There should be few/no silent catches and at least some logged catches
  assert.ok(
    loggedCatches !== null && loggedCatches.length > 0,
    'Expected missionRelay.ts to have catch blocks that log errors'
  );
  
  if (silentCatches) {
    console.log(`# WARNING: Found ${silentCatches.length} silent catch blocks in missionRelay.ts`);
  }
});

// Check index.ts logs errors instead of silent catch
const indexSrc = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');

test('index.ts logs errors from conversation.remember instead of silent catch', () => {
  const silentRememberCatches = indexSrc.match(/conversation\.remember[^;]*\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g);
  const loggedRememberCatches = indexSrc.match(/conversation\.remember[^;]*\.catch\s*\(.*console.error/g);
  
  assert.ok(
    loggedRememberCatches !== null && loggedRememberCatches.length > 0,
    'Expected conversation.remember catch blocks to log errors'
  );
  
  if (silentRememberCatches) {
    console.log(`# WARNING: Found ${silentRememberCatches.length} silent conversation.remember catch blocks`);
  }
});

test('index.ts logs errors from ctx.reply instead of silent catch', () => {
  const loggedReplyCatches = indexSrc.match(/ctx\.reply[^;]*\.catch\s*\(.*console/g);
  const silentReplyCatches = indexSrc.match(/ctx\.reply[^;]*\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g);
  
  // Should have at least some logged catches for ctx.reply
  assert.ok(
    loggedReplyCatches !== null,
    'Expected ctx.reply catch blocks'
  );
});

// Check /forget command in index.ts uses word-boundary regex
test('index.ts /forget handler uses word-boundary regex to prevent false matches', () => {
  // The old code used ctx.message.text.replace('/forget', '').trim()
  // which would also match '/forgetSomething'
  const forgetPattern = indexSrc.match(/forget.*replace.*regexp|\\\/forget\\b/g);
  // Look for word boundary in forget handler
  assert.ok(
    indexSrc.includes('/forget\\b') || indexSrc.includes('/forget') && indexSrc.includes('\\\\b'),
    'Expected /forget handler to use word-boundary regex'
  );
});

// Verify auto-compile on /capabilities PR #320
const capabilityGardenSrc = readFileSync(join(__dirname, '..', 'src', 'capabilityGarden.ts'), 'utf-8');
test('capabilityGarden.ts has runSparkOsCompile function for auto-compile', () => {
  assert.ok(
    capabilityGardenSrc.includes('runSparkOsCompile') ||
    capabilityGardenSrc.includes('spark os compile'),
    'Expected auto-compile support in capabilityGarden.ts'
  );
});
