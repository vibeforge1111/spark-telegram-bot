import assert from 'node:assert/strict';
import { decideNaturalRoute } from '../src/naturalRouteDecision';
import {
  naturalRouteExecutionOutcome,
  naturalRouteTelemetryLine,
  renderNaturalRouteDecisionReply
} from '../src/naturalRouteTelemetry';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('renders redacted route telemetry without raw text or payload content', () => {
  const decision = decideNaturalRoute('remember that I prefer concise Telegram replies');
  const line = naturalRouteTelemetryLine({
    decision,
    phase: 'shadow',
    profile: 'spark agi',
    userId: 8319079055,
    chatId: 8319079055,
    chatType: 'private',
    admin: true
  });

  assert.equal(
    line,
    '[NaturalRoute] phase=shadow route=memory.write owner=spark-intelligence-builder confidence=explicit context=latest_message confirm=false signals=plain_chat_memory_directive blocked=none profile=spark_agi user=8319079055 chat=8319079055 chat_type=private admin=true'
  );
  assert.doesNotMatch(line, /concise|Telegram replies|prefer/i);
});

test('renders a non-executing admin probe reply', () => {
  const decision = decideNaturalRoute('run another round', {
    recentMessages: ['We are working on Spark QA Operator and path:spark-qa-operator.']
  });
  const reply = renderNaturalRouteDecisionReply(decision);

  assert.match(reply, /Natural route probe/);
  assert.match(reply, /Route: recursive.start/);
  assert.match(reply, /Needs confirmation: yes/);
  assert.match(reply, /No command was executed/);
  assert.doesNotMatch(reply, /path:spark-qa-operator/);
});

test('renders redacted execution comparison telemetry', () => {
  const decision = decideNaturalRoute('Build this at C:\\Users\\USER\\Desktop\\spark-timer: a tiny timer app');
  const line = naturalRouteTelemetryLine({
    decision,
    phase: 'execute',
    profile: 'spark agi',
    userId: 8319079055,
    chatId: 8319079055,
    chatType: 'private',
    admin: true,
    executedRoute: 'spawner.build',
    executedOwner: 'spawner-ui',
    executedAction: 'spawner.build',
    outcome: naturalRouteExecutionOutcome(decision, 'spawner.build')
  });

  assert.match(line, /phase=execute/);
  assert.match(line, /route=spawner\.build/);
  assert.match(line, /executed=spawner\.build/);
  assert.match(line, /outcome=matched/);
  assert.doesNotMatch(line, /tiny timer app|spark-timer/i);
});

test('marks shadow and execution disagreement without payload text', () => {
  const decision = decideNaturalRoute('remember that I prefer concise Telegram replies');

  assert.equal(naturalRouteExecutionOutcome(decision, 'spawner.build'), 'mismatch');
});
