import assert from 'node:assert/strict';
import { renderReleaseDecisionModelAnswer } from '../src/providerRuntimeReply';

const roles = [
  { role: 'chat', provider: 'codex', model: 'gpt-5.6' },
  { role: 'mission', provider: 'openai', model: 'grok-4.1-fast' }
];

const reply = renderReleaseDecisionModelAnswer(
  roles,
  'Which model is handling release decisions?'
);
assert.match(reply || '', /Chat is using GPT-5\.6 through Codex/);
assert.match(reply || '', /mission role.*Grok 4\.1-fast.*OpenAI-compatible/is);
assert.match(reply || '', /human approval still owns the release/i);
assert.equal(renderReleaseDecisionModelAnswer(roles, 'Are providers healthy?'), null);
