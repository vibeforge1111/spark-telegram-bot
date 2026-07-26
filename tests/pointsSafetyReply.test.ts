import assert from 'node:assert/strict';
import { renderForwardOnlyPointsSafetyAnswer } from '../src/pointsSafetyReply';

const prompt = 'We have 24,409 public team points now. Explain how the next useful adopted PR would be credited, but do not change any points or team state.';
const reply = renderForwardOnlyPointsSafetyAnswer(prompt);

assert.match(reply || '', /24,409.*immutable opening balance/i);
assert.match(reply || '', /actually adopted.*retained contributor.*team.*prior awards/is);
assert.match(reply || '', /append-only.*idempotent.*double-credit/is);
assert.match(reply || '', /no prior total.*reset or recomputed/is);
assert.match(reply || '', /did not change any points or team state/i);
assert.equal(renderForwardOnlyPointsSafetyAnswer('How many points do we have?'), null);
