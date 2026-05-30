import assert from 'node:assert/strict';
import {
  classifyTelegramIntentV2,
  parseTelegramIntentConstraintsV2,
  shouldEnforceTelegramIntentGateV2
} from '../src/telegramIntentGate';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const startupCanaryPrompt = [
  'Run a startup self-improvement canary from Telegram.',
  'Do not publish, merge, or claim public/network readiness.',
  'Take this founder problem: every new channel creates support, delivery, and focus fatigue.',
  'First produce a baseline answer, then run the startup self-improvement loop, critique it, produce an improved answer, and run a blind jury comparison.',
  'Return the baseline answer, improved answer, jury verdict, what changed in the agent, and what still blocks a fully closed startup self-improvement loop.'
].join(' ');

test('keeps publication constraints separate from execution for startup canaries', () => {
  const constraints = parseTelegramIntentConstraintsV2(startupCanaryPrompt);

  assert.equal(constraints.noExecution, false);
  assert.equal(constraints.noPublish, true);
  assert.equal(constraints.noMerge, true);
  assert.equal(constraints.noPublicClaim, true);
  assert.equal(constraints.noNetworkAbsorptionClaim, true);
  assert.equal(constraints.localOnly, true);
});

test('routes startup answer-improvement canary before proof cards or generic self-awareness', () => {
  const decision = classifyTelegramIntentV2(startupCanaryPrompt);

  assert.equal(decision.schema_version, 'spark.telegram.intent_decision.v2');
  assert.equal(decision.kind, 'answer_improvement_canary');
  assert.equal(decision.route, 'startup.answer_improvement_canary');
  assert.equal(decision.owner_system, 'spark-intelligence-builder');
  assert.equal(decision.enforcement, 'enforce_safe');
  assert.equal(shouldEnforceTelegramIntentGateV2(decision, {} as NodeJS.ProcessEnv), true);
  assert.deepEqual(
    decision.blocked_candidates.map((candidate) => candidate.route),
    ['startup.proof_readout', 'spark.self_improvement']
  );
});

test('blocks running a canary when the current turn says do not run it', () => {
  const decision = classifyTelegramIntentV2(
    'Run a startup self-improvement canary. Do not run it, just explain the proof boundary.'
  );

  assert.equal(decision.kind, 'status_or_proof_readout');
  assert.equal(decision.route, 'startup.proof_readout');
  assert.equal(decision.constraints.noExecution, true);
  assert.equal(decision.blocked_candidates[0]?.route, 'startup.answer_improvement_canary');
});

test('routes startup proof/status questions to the proof readout', () => {
  const decision = classifyTelegramIntentV2(
    'Did the startup agent actually improve, not just scores, and what is still blocked before public-ready or network-absorbable?'
  );

  assert.equal(decision.kind, 'status_or_proof_readout');
  assert.equal(decision.route, 'startup.proof_readout');
  assert.equal(decision.owner_system, 'spark-telegram-bot');
});

test('does not steal named Recursive Startup YC proof questions', () => {
  const decision = classifyTelegramIntentV2('Did Startup YC improve?');

  assert.equal(decision.kind, 'recursive_or_swarm');
  assert.equal(decision.route, 'recursive.status');
  assert.equal(decision.enforcement, 'observe');
  assert.equal(decision.natural_route?.route, 'recursive.status');
});

test('routes founder operating questions to startup advice', () => {
  const decision = classifyTelegramIntentV2(
    'Should we add another channel if response quality is weak and the support team is backed up?'
  );

  assert.equal(decision.kind, 'advisor_answer');
  assert.equal(decision.route, 'startup.founder_advice');
  assert.equal(decision.owner_system, 'spark-intelligence-builder');
});

test('routes explicit memory writes before startup and self-improvement detectors', () => {
  const decision = classifyTelegramIntentV2(
    'Remember that startup canaries must show baseline and improved answers before claiming improvement.'
  );

  assert.equal(decision.kind, 'memory_write');
  assert.equal(decision.route, 'memory.write');
  assert.equal(decision.owner_system, 'domain-chip-memory');
  assert.match(String(decision.payload.directive), /startup canaries/i);
});

test('routes access status and help through gate-owned safe routes', () => {
  const status = classifyTelegramIntentV2('What is my Spark access level?');
  const help = classifyTelegramIntentV2('What can Spark access levels do?');

  assert.equal(status.kind, 'access_status');
  assert.equal(status.route, 'access.status');
  assert.equal(help.kind, 'access_help');
  assert.equal(help.route, 'access.help');
});

test('can be put in shadow mode without enforcing safe routes', () => {
  const decision = classifyTelegramIntentV2(startupCanaryPrompt);

  assert.equal(
    shouldEnforceTelegramIntentGateV2(decision, { SPARK_TELEGRAM_INTENT_GATE_V2: 'shadow' } as NodeJS.ProcessEnv),
    false
  );
});
