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

test('does not steal explicit domain-chip creation with source-freshness wording', () => {
  const prompt = [
    'Create a private local Domain Chip starter preview for Operations Research Watchdesk R30 Bridge QA.',
    'This is an explicit chip creation request, but preview only for now.',
    'The chip should handle evidence briefs, stale or conflicting sources, fact versus hypothesis separation, source freshness, and operator recommendations only.',
    'Do not run benchmarks, autoloops, sends, alerts, activation, publishing, registry changes, or network absorption.',
    'Show the private starter preview and ask me for go before creating files.'
  ].join(' ');

  assert.equal(renderExternalResearchBoundaryReply(prompt), '');
});

test('still protects no-browse source boundary questions', () => {
  const reply = renderExternalResearchBoundaryReply('Do not browse yet; what source boundary applies if I ask for current docs?');
  assert.match(reply, /without browsing/);
});
