import assert from 'node:assert/strict';
import { gatewayOwnershipConflictMessage } from '../src/gatewayOwnership';

const message = gatewayOwnershipConflictMessage();
assert.match(message, /another live instance/i);
assert.match(message, /lease/i);
assert.doesNotMatch(message, /\bpid\b|hostname|:\d+/i);
console.log('ok - gateway ownership conflicts hide host and process identity');
