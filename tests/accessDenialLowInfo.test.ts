import assert from 'node:assert/strict';
import { isLowInformationLlmReply } from '../src/conversationIntent';
assert.equal(isLowInformationLlmReply('access is not authorized for this channel'), false);
console.log('ok - access denial text is not classified low-information');
