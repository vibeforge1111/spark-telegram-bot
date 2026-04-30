import assert from 'node:assert/strict';
import {
  buildConversationFrame,
  buildConversationFrameFromState,
  emptyRollingConversationFrameState,
  estimateTokens,
  renderConversationFrameContext,
  renderConversationFrameDiagnostics,
  updateRollingConversationFrameState,
  type ConversationTurn
} from '../src/conversationFrame';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('budgets reliable 200k effective context on larger model windows', () => {
  const frame = buildConversationFrame('hello', [], {
    modelContextWindowTokens: 400_000,
    targetEffectiveContextTokens: 200_000
  });

  assert.equal(frame.budget.safeInputBudgetTokens, 200_000);
  assert.equal(frame.budget.requiresLargerModelForFullTarget, false);
  assert.equal(frame.budget.compactionTriggerTokens, 260_000);
});

test('does not pretend a 200k model reliably holds a full 200k assembled input', () => {
  const frame = buildConversationFrame('hello', [], {
    modelContextWindowTokens: 200_000,
    targetEffectiveContextTokens: 200_000
  });

  assert.equal(frame.budget.requiresLargerModelForFullTarget, true);
  assert.equal(Number(frame.budget.safeInputBudgetTokens) < 200_000, true);
});

test('resolves access shorthand from recent access context', () => {
  const frame = buildConversationFrame('Change it to 4', [
    { role: 'user', text: 'Change my access level to three please' },
    { role: 'assistant', text: 'Done - I changed this chat to Level 3 - Research + Build.' }
  ]);

  assert.equal(frame.referenceResolution.kind, 'access_level');
  assert.equal(frame.referenceResolution.value, '4');
  assert.equal(frame.focusStack[0].kind, 'access_level');
});

test('resolves numbered references against the latest assistant list', () => {
  const frame = buildConversationFrame('I like the second one, can we expand that?', [
    { role: 'user', text: 'What could we build?' },
    {
      role: 'assistant',
      text: ['A few directions:', '1. Spark Command Palette', '2. Domain Chip Workbench', '3. Spark Timeline'].join('\n')
    }
  ]);

  assert.equal(frame.referenceResolution.kind, 'list_item');
  assert.equal(frame.referenceResolution.value, 'Domain Chip Workbench');
  assert.match(renderConversationFrameContext(frame), /resolved_reference/);
  assert.match(renderConversationFrameContext(frame), /Domain Chip Workbench/);
});

test('list references beat older access focus when both are in context', () => {
  const frame = buildConversationFrame('Let\'s do the second one', [
    { role: 'user', text: 'Change my access level to three please' },
    { role: 'assistant', text: 'Done - I changed this chat to Level 3 - Research + Build.' },
    { role: 'user', text: 'Change it to 4' },
    { role: 'assistant', text: 'Done - I changed this chat to Level 4 - Full Access.' },
    { role: 'user', text: 'Give me three build ideas for a memory dashboard' },
    {
      role: 'assistant',
      text: [
        'Three concrete directions:',
        '1. Recall Audit Board',
        '2. Memory Timeline Explorer',
        '3. Live Stress-Test Panel'
      ].join('\n')
    }
  ]);

  assert.equal(frame.referenceResolution.kind, 'list_item');
  assert.equal(frame.referenceResolution.value, 'Memory Timeline Explorer');
});

test('short action option references use newer list context instead of access context', () => {
  const frame = buildConversationFrame('Let\'s do two', [
    { role: 'user', text: 'Change my access level to three please' },
    { role: 'assistant', text: 'Done - I changed this chat to Level 3 - Research + Build.' },
    { role: 'user', text: 'Give me three build ideas for a memory dashboard' },
    {
      role: 'assistant',
      text: [
        'Three concrete directions:',
        '1. Recall Audit Board',
        '2. Memory Timeline Explorer',
        '3. Live Stress-Test Panel'
      ].join('\n')
    }
  ]);

  assert.equal(frame.referenceResolution.kind, 'list_item');
  assert.equal(frame.referenceResolution.value, 'Memory Timeline Explorer');
});

test('short option references ignore assistant clarification question lists', () => {
  const frame = buildConversationFrame('Let\'s do two', [
    {
      role: 'user',
      text: 'I am choosing between: 1. recall audit board 2. memory timeline explorer 3. live stress-test panel'
    },
    {
      role: 'assistant',
      text: [
        'Memory Timeline Explorer. Good pick.',
        '',
        'Before I spec it out:',
        '1. Panel inside Spawner UI, or standalone page?',
        '2. Just visualization for now, or do you want interaction like clicking a memory to see its full history chain?'
      ].join('\n')
    }
  ]);

  assert.equal(frame.referenceResolution.kind, 'list_item');
  assert.equal(frame.referenceResolution.value, 'memory timeline explorer');
});

test('access shorthand still works when no list reference is present', () => {
  const frame = buildConversationFrame('Actually make it four', [
    { role: 'user', text: 'Change my access level to three please' },
    { role: 'assistant', text: 'Done - I changed this chat to Level 3 - Research + Build.' }
  ]);

  assert.equal(frame.referenceResolution.kind, 'access_level');
  assert.equal(frame.referenceResolution.value, '4');
});

test('keeps hot turns while compacting older context', () => {
  const turns: ConversationTurn[] = Array.from({ length: 20 }, (_, index) => ({
    role: 'user',
    text: `older planning turn ${index}`
  }));
  const frame = buildConversationFrame('what were we doing?', turns, {
    hotMinTurns: 6,
    hotTargetTokens: 40
  });

  assert.equal(frame.hotTurns.length >= 6, true);
  assert.match(frame.warmSummary, /Older user goals/);
  assert.equal(Number(frame.budget.assembledEstimatedTokens) >= estimateTokens(frame.warmSummary), true);
});

test('persists rolling compaction state across turn updates', () => {
  let state = emptyRollingConversationFrameState();
  for (let index = 0; index < 18; index += 1) {
    state = updateRollingConversationFrameState(state, {
      role: 'user',
      text: `planning turn ${index}`,
      turnId: `u${index}`
    }, {
      hotMinTurns: 4,
      hotTargetTokens: 20
    });
  }

  assert.equal(state.hotTurns.length >= 4, true);
  assert.match(state.warmSummary, /Older user goals/);
  assert.equal(state.compactionEvents.length > 0, true);
  assert.match(renderConversationFrameDiagnostics(state), /Compaction events/);
});

test('builds frames from persistent rolling artifacts, not only immediate turns', () => {
  let state = emptyRollingConversationFrameState();
  state = updateRollingConversationFrameState(state, {
    role: 'assistant',
    text: ['A few directions:', '1. Spark Command Palette', '2. Domain Chip Workbench'].join('\n')
  });

  const frame = buildConversationFrameFromState('the second one', state);

  assert.equal(frame.referenceResolution.kind, 'list_item');
  assert.equal(frame.referenceResolution.value, 'Domain Chip Workbench');
  assert.equal(Number(frame.budget.rollingCompactionEvents) >= 0, true);
});

test('keeps exact list artifacts after a long compacted conversation', () => {
  let state = emptyRollingConversationFrameState();
  state = updateRollingConversationFrameState(state, {
    role: 'assistant',
    text: [
      'Memory dashboard options:',
      '1. Recall Audit Board',
      '2. Memory Timeline Explorer',
      '3. Live Stress-Test Panel'
    ].join('\n'),
    turnId: 'options'
  }, {
    hotMinTurns: 8,
    hotTargetTokens: 80
  });

  for (let index = 0; index < 90; index += 1) {
    state = updateRollingConversationFrameState(state, {
      role: index % 2 === 0 ? 'user' : 'assistant',
      text: `long planning turn ${index} about performance, memory quality, and rollout checks`,
      turnId: `long-${index}`
    }, {
      hotMinTurns: 8,
      hotTargetTokens: 80
    });
  }

  const frame = buildConversationFrameFromState('Let\'s do the second one', state, {
    hotMinTurns: 8,
    hotTargetTokens: 80
  });

  assert.equal(frame.referenceResolution.kind, 'list_item');
  assert.equal(frame.referenceResolution.value, 'Memory Timeline Explorer');
  assert.equal(state.compactionEvents.length > 0, true);
  assert.equal(state.warmSummary.length > 0, true);
});

test('newer list artifacts outrank older list artifacts after compaction', () => {
  let state = emptyRollingConversationFrameState();
  state = updateRollingConversationFrameState(state, {
    role: 'assistant',
    text: ['Old options:', '1. Old Alpha', '2. Old Beta'].join('\n'),
    turnId: 'old-list'
  });
  for (let index = 0; index < 35; index += 1) {
    state = updateRollingConversationFrameState(state, {
      role: 'user',
      text: `middle context turn ${index}`,
      turnId: `middle-${index}`
    }, {
      hotMinTurns: 6,
      hotTargetTokens: 60
    });
  }
  state = updateRollingConversationFrameState(state, {
    role: 'assistant',
    text: ['New options:', '1. New Timeline', '2. New Evaluator'].join('\n'),
    turnId: 'new-list'
  });

  const frame = buildConversationFrameFromState('pick the second one', state, {
    hotMinTurns: 6,
    hotTargetTokens: 60
  });

  assert.equal(frame.referenceResolution.kind, 'list_item');
  assert.equal(frame.referenceResolution.value, 'New Evaluator');
});

test('renders bounded prompt context under a tight token limit', () => {
  const turns: ConversationTurn[] = Array.from({ length: 80 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    text: `turn ${index} ${'context '.repeat(40)}`,
    turnId: `t${index}`
  }));
  const frame = buildConversationFrame('summarize where we are', turns, {
    hotMinTurns: 8,
    hotTargetTokens: 400
  });
  const rendered = renderConversationFrameContext(frame, 350);

  assert.equal(estimateTokens(rendered) <= 360, true);
  assert.match(rendered, /\[Spark Conversation Frame\]/);
  assert.match(rendered, /truncated|hot_turns|warm_summary/);
});

test('builds a long rolling frame within the Telegram turn budget', () => {
  let state = emptyRollingConversationFrameState();
  const started = Date.now();
  for (let index = 0; index < 300; index += 1) {
    state = updateRollingConversationFrameState(state, {
      role: index % 2 === 0 ? 'user' : 'assistant',
      text: `soak test turn ${index} with enough words to exercise token estimates and rolling compaction behavior`,
      turnId: `soak-${index}`
    }, {
      hotMinTurns: 10,
      hotTargetTokens: 160
    });
  }
  const frame = buildConversationFrameFromState('what are we doing now?', state, {
    hotMinTurns: 10,
    hotTargetTokens: 160
  });
  const elapsedMs = Date.now() - started;

  assert.equal(elapsedMs < 1000, true);
  assert.equal(frame.hotTurns.length >= 10, true);
  assert.equal(Number(frame.budget.assembledEstimatedTokens) < Number(frame.budget.safeInputBudgetTokens), true);
});
