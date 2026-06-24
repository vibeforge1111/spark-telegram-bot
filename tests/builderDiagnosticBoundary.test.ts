import assert from 'node:assert/strict';
import { renderBuilderMemoryDiagnosticBoundaryReply } from '../src/builderDiagnosticBoundary';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('renders memory diagnostic authorization boundary', () => {
  const reply = renderBuilderMemoryDiagnosticBoundaryReply('Ask for a memory diagnostic only if this turn authorizes it. Otherwise tell me plainly what is missing.');
  assert.match(reply, /does not authorize a memory diagnostic/i);
  assert.match(reply, /direct fresh request/i);
  assert.doesNotMatch(reply, /source ledger|tool_not_allowed_by_policy|owner_mismatch/i);
});

test('does not steal direct Memory Doctor requests', () => {
  assert.equal(renderBuilderMemoryDiagnosticBoundaryReply('run Memory Doctor for the last request'), '');
});
