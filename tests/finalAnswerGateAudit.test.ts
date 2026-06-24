import assert from 'node:assert/strict';
import { buildHarnessProofCapsule } from '../src/harnessProofCapsule';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('final-answer suppression audit redacts path-like Builder trace refs', async () => {
  const indexModule: any = await import('../src/index');
  const proofCapsule = buildHarnessProofCapsule({
    turnRef: 'turn:sha256:finalansweraudit',
    route: 'plain_chat',
    owner: 'spark-telegram-bot',
    intent: { kind: 'plain_chat', confidence: 'explicit', noExecution: true },
    authority: {
      decision: 'blocked',
      contract: 'spark.turn_intent.v1',
      riskTier: 'read',
      reasonSummary: 'Final-answer gate suppressed a Builder reply and used local chat fallback.'
    },
    governor: { decision: 'deny', verified: true },
    execution: { status: 'blocked', tool: 'answer.compose', mutationClass: 'read_only' },
    reply: { delivered: false, shape: 'none', rawReasonsHidden: true },
    joins: { telegram: 'joined', builder: 'joined' }
  });

  const record = indexModule.buildFinalAnswerGateSuppressionRecord({
    chatId: 8319079055,
    userId: 8319079055,
    suppressionReason: 'low_information',
    builderRoutingDecision: 'researcher_advisory',
    builderBridgeMode: 'external_configured',
    builderReply: 'Working Memory',
    requestId: 'telegram:749543765',
    traceRef: '/Users/example/private/traces/raw-builder.jsonl',
    proofCapsule,
    fallbackRoute: 'local_chat'
  }, new Date('2026-06-24T14:28:08.000Z'));

  assert.match(String(record.trace_ref), /^trace:sha256:[a-f0-9]{16}$/);
  assert.doesNotMatch(JSON.stringify(record), /\/Users\/example|raw-builder\.jsonl/);
});

test('final-answer suppression audit keeps safe trace refs stable', async () => {
  const indexModule: any = await import('../src/index');
  const record = indexModule.buildFinalAnswerGateSuppressionRecord({
    chatId: 8319079055,
    userId: 8319079055,
    suppressionReason: 'plain_chat_suppression',
    builderRoutingDecision: 'plain_chat',
    builderBridgeMode: 'test',
    builderReply: 'Suppressed.',
    requestId: 'req-final-gate',
    traceRef: 'trace:req-final-gate',
    fallbackRoute: 'local_chat'
  }, new Date('2026-06-24T14:28:08.000Z'));

  assert.equal(record.trace_ref, 'trace:req-final-gate');
});

test('final-answer suppression audit derives a trace ref from proof capsules', async () => {
  const indexModule: any = await import('../src/index');
  const proofCapsule = buildHarnessProofCapsule({
    turnRef: 'turn:sha256:proofonlytrace',
    route: 'model_switch.mission_provider',
    owner: 'spark-telegram-bot',
    intent: { kind: 'model_switch.mission_provider', confidence: 'explicit', noExecution: false },
    authority: {
      decision: 'blocked',
      contract: 'spark.turn_intent.v1',
      riskTier: 'write',
      reasonSummary: 'Final-answer gate suppressed a Builder reply and used local chat fallback.'
    },
    governor: { decision: 'deny', verified: true },
    execution: { status: 'blocked', tool: 'model.switch', mutationClass: 'read_only' },
    reply: { delivered: false, shape: 'none', rawReasonsHidden: true },
    joins: { telegram: 'joined', builder: 'joined' }
  });

  const record = indexModule.buildFinalAnswerGateSuppressionRecord({
    chatId: 8319079055,
    userId: 8319079055,
    suppressionReason: 'route_menu',
    builderRoutingDecision: 'disambiguation_shortcircuit',
    builderBridgeMode: 'disambiguation_shortcircuit',
    builderReply: 'Suppressed route menu.',
    requestId: 'telegram:749543832',
    proofCapsule,
    fallbackRoute: 'local_chat'
  }, new Date('2026-06-24T17:28:16.000Z'));

  assert.match(String(record.trace_ref), /^trace:sha256:[a-f0-9]{16}$/);
  assert.equal(record.harness_proof_ref, proofCapsule.turnRef);
});
