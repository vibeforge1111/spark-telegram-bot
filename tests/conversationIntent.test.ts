import assert from 'node:assert/strict';
import {
  buildIdeationFallbackReply,
  buildIdeationSystemHint,
  buildMemoryBridgeUnavailableReply,
  extractPlainChatMemoryDirective,
  isMemoryAcknowledgementReply,
  isLowInformationLlmReply,
  shouldSuppressBuilderReplyForPlainChat,
  shouldPreferConversationalIdeation
} from '../src/conversationIntent';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('routes collaborative mission wording to conversation instead of command help', () => {
  assert.equal(
    shouldPreferConversationalIdeation(
      "I want to build something fun with Spark, but I don't know exactly what yet. I like playful tools, tiny games, and things that feel like a mission dashboard. Can you help me shape an idea before building?"
    ),
    true
  );
});

test('keeps explicit build specs on the build path', () => {
  assert.equal(
    shouldPreferConversationalIdeation(
      'Build this at C:\\Users\\USER\\Desktop\\spark-thing: Files: index.html, app.js. No build step.'
    ),
    false
  );
});

test('keeps mission-control product refinement in conversation', () => {
  assert.equal(
    shouldPreferConversationalIdeation(
      'Solo first. I like Mission Control Dashboard, but make it more playful and game-like, not just tasks. Maybe it should turn daily goals into little missions with status, energy, streaks, and a launch sequence. What would the first version be?'
    ),
    true
  );
});

test('adds domain chip guidance for chip ideation', () => {
  const hint = buildIdeationSystemHint(
    'I want to create a new advanced domain chip with Spark. Help me shape the chip first before creating it.'
  );

  assert.match(hint, /advanced Spark domain chip/);
  assert.match(hint, /Do not start a build/);
});

test('detects empty or generic LLM failures', () => {
  assert.equal(isLowInformationLlmReply(''), true);
  assert.equal(isLowInformationLlmReply("I'm here, but I couldn't generate a response right now."), true);
  assert.equal(isLowInformationLlmReply('Working Memory'), true);
  assert.equal(isLowInformationLlmReply('Spark Researcher returned no concrete guidance for this message.'), true);
  assert.equal(isLowInformationLlmReply('What would you like help with?'), true);
  assert.equal(isLowInformationLlmReply('Nothing active'), true);
  assert.equal(isLowInformationLlmReply('Here is a real idea.'), false);
});

test('suppresses memory acknowledgements for normal chat replies', () => {
  assert.equal(isMemoryAcknowledgementReply('Noted: "yes i was wondering how is the chat with you"'), true);
  assert.equal(
    isMemoryAcknowledgementReply('I have saved memory about preferred Spark reply style: "concise but warm"'),
    true
  );
  assert.equal(shouldSuppressBuilderReplyForPlainChat('Noted: "yes i was wondering how is the chat with you"'), true);
  assert.equal(
    shouldSuppressBuilderReplyForPlainChat('Spark Researcher returned no concrete guidance for this message.'),
    true
  );
  assert.equal(shouldSuppressBuilderReplyForPlainChat('I am doing well. The chat is working normally.'), false);
});

test('extracts explicit plain-chat memory directives', () => {
  assert.equal(
    extractPlainChatMemoryDirective('can you remember that you are a QA agent'),
    'you are a QA agent'
  );
  assert.equal(extractPlainChatMemoryDirective('remember: my preferred reply style is concise'), 'my preferred reply style is concise');
  assert.equal(extractPlainChatMemoryDirective('what do you remember about me'), null);
  assert.equal(extractPlainChatMemoryDirective('do you have memory right now'), null);
});

test('memory fallback does not claim a no-op save succeeded', () => {
  const reply = buildMemoryBridgeUnavailableReply('remember');

  assert.match(reply, /could not confirm/i);
  assert.match(reply, /spark verify --deep/);
  assert.doesNotMatch(reply, /remember:/i);
  assert.doesNotMatch(reply, /got it/i);
});

test('provides a conversational fallback for mission dashboard refinement', () => {
  const reply = buildIdeationFallbackReply(
    'Solo first. I like Mission Control Dashboard, but make it more playful and game-like, not just tasks. What would the first version be?'
  );

  assert.match(reply, /daily command center/);
  assert.match(reply, /not a task list/);
  assert.doesNotMatch(reply, /Nothing active/);
});
