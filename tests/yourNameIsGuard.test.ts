import assert from 'node:assert/strict';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`  PASS: ${name}`);
  } catch (e) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${e}`);
    process.exitCode = 1;
  }
}

// Simulate the guard logic from deliverBuilderReply / handlePlainChatMemoryDirective
function applyYourNameIsGuard(
  responseText: string,
  bridgeMode: string,
  routingDecision: string
): string {
  if (
    bridgeMode === 'memory_generic_observation' &&
    /your name is/i.test(responseText) &&
    routingDecision !== 'memory_profile_fact_observation'
  ) {
    return 'Noted.';
  }
  return responseText;
}

// --- Guard tests ---

test('your name is in generic observation → replaced with Noted.', () => {
  const result = applyYourNameIsGuard(
    'Your name is Sampson.',
    'memory_generic_observation',
    'memory_generic_observation'
  );
  assert.equal(result, 'Noted.');
});

test('your name is in profile fact observation → NOT replaced', () => {
  const result = applyYourNameIsGuard(
    'Your name is Sampson.',
    'memory_generic_observation',
    'memory_profile_fact_observation'
  );
  assert.equal(result, 'Your name is Sampson.');
});

test('your name is in non-memory bridge mode → NOT replaced', () => {
  const result = applyYourNameIsGuard(
    'Your name is Sampson.',
    'bridge_chat',
    'chat_general'
  );
  assert.equal(result, 'Your name is Sampson.');
});

test('normal reply in generic observation → NOT replaced', () => {
  const result = applyYourNameIsGuard(
    'I will always use dark mode.',
    'memory_generic_observation',
    'memory_generic_observation'
  );
  assert.equal(result, 'I will always use dark mode.');
});

test('case insensitive: YOUR NAME IS in generic observation → replaced', () => {
  const result = applyYourNameIsGuard(
    'YOUR NAME IS Sampson.',
    'memory_generic_observation',
    'memory_generic_observation'
  );
  assert.equal(result, 'Noted.');
});
