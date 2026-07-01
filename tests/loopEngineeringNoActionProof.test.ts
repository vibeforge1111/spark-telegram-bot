import assert from 'node:assert/strict';
import { parseNaturalRecursiveCommandIntent, isSparkWorkflowBugHuntRequest } from '../src/conversationIntent';
import { isLoopEngineeringNoActionProofQuestion, renderLoopEngineeringNoActionProofReply } from '../src/loopEngineeringNoActionProof';

const prompt = "Quick QA no-action check: I'm not asking you to create, run, repair, or publish anything. In one or two sentences, what proof would you require before a Domain Chip Labs Loop Engineering run can be considered safe to run?";

assert.equal(parseNaturalRecursiveCommandIntent(prompt), null);
assert.equal(isSparkWorkflowBugHuntRequest(prompt), true);
console.log('ok - Loop Engineering no-action proof prompt stays QA planning evidence, not recursive sessions');

const reply = renderLoopEngineeringNoActionProofReply();
assert.match(reply, /A Domain Chip is a reusable Spark playbook/i);
assert.match(reply, /private|local/i);
assert.match(reply, /benchmark cases/i);
assert.match(reply, /held-out/i);
assert.match(reply, /watchtower/i);
assert.match(reply, /rollback/i);
assert.match(reply, /ask for the proof checklist|next/i);
assert.doesNotMatch(reply, /router|provider|trace|local path|release metadata/i);
console.log('ok - Loop Engineering no-action proof reply defines Domain Chip for first-time users');

const blindScorePrompt = 'I am mentioning benchmark, autoloop, and mission, but do not start anything. How would Spark avoid blindly giving a high score to a new Domain Chip?';
assert.equal(parseNaturalRecursiveCommandIntent(blindScorePrompt), null);
assert.equal(isSparkWorkflowBugHuntRequest(blindScorePrompt), true);
assert.equal(isLoopEngineeringNoActionProofQuestion(blindScorePrompt), true);
const blindScoreReply = renderLoopEngineeringNoActionProofReply(blindScorePrompt);
assert.match(blindScoreReply, /keep the chip in review/i);
assert.match(blindScoreReply, /baseline/i);
assert.match(blindScoreReply, /candidate/i);
assert.match(blindScoreReply, /held-out\/trap\/no-op/i);
assert.match(blindScoreReply, /blind judge/i);
assert.match(blindScoreReply, /adversary and safety verdicts/i);
assert.match(blindScoreReply, /watchtower/i);
assert.match(blindScoreReply, /rollback/i);
assert.match(blindScoreReply, /promising candidate, not proven improvement/i);
assert.doesNotMatch(blindScoreReply, /router|provider|trace|local path|release metadata/i);
console.log('ok - benchmark/autoloop no-action prompt blocks blind high-score claims');

const missingHeldOutPrompt = 'If the creator agent says the chip improved but the blind judge cannot see held-out proof, what should Spark say?';
assert.equal(parseNaturalRecursiveCommandIntent(missingHeldOutPrompt), null);
assert.equal(isSparkWorkflowBugHuntRequest(missingHeldOutPrompt), true);
assert.equal(isLoopEngineeringNoActionProofQuestion(missingHeldOutPrompt), true);
const missingHeldOutReply = renderLoopEngineeringNoActionProofReply(missingHeldOutPrompt);
assert.match(missingHeldOutReply, /not proven improvement/i);
assert.match(missingHeldOutReply, /blind judge/i);
assert.match(missingHeldOutReply, /held-out/i);
assert.doesNotMatch(missingHeldOutReply, /router|provider|trace|local path|release metadata/i);
console.log('ok - missing held-out blind-judge proof remains review-only');
