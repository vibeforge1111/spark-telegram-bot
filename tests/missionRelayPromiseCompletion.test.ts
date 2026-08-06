import assert from 'node:assert/strict';
import { formatProviderCompletionForTelegram } from '../src/missionRelay';

const message = formatProviderCompletionForTelegram({
  providerLabel: 'openai',
  missionId: 'spark-promised-preflight',
  verbosity: 'normal',
  response: "I'll run the protected preflight path only: verify the sealed bundle and exact PR head, then return either a public-safe approval receipt or a bounded blocker."
});

assert.match(message, /execution is still pending/i);
assert.doesNotMatch(message, /✨|finished that cleanly|wrapped that up|completed successfully/i);
console.log('ok - future-tense provider promise is not presented as completed work');
