import assert from 'node:assert/strict';
import { renderExternalResearchBoundaryReply } from '../src/externalResearchBoundary';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('renders no-browse external research boundary', () => {
  const reply = renderExternalResearchBoundaryReply('Can you research the current OpenAI model docs? Do not browse yet; tell me what permission/source boundary applies.');
  assert.match(reply, /without browsing/);
  assert.match(reply, /current public source directly/);
  assert.match(reply, /no external network call/);
});

test('does not steal normal research requests', () => {
  assert.equal(renderExternalResearchBoundaryReply('Research the current OpenAI model docs.'), '');
});
