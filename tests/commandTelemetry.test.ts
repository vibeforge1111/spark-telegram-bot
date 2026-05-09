import assert from 'node:assert/strict';
import { telegramCommandTelemetryLine } from '../src/commandTelemetry';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('renders redacted command telemetry without message text', () => {
  const line = telegramCommandTelemetryLine({
    command: '/diagnose',
    phase: 'replied',
    profile: 'spark-agi',
    userId: 8319079055,
    chatId: 8319079055,
    chatType: 'private'
  });

  assert.equal(
    line,
    '[Command] command=/diagnose phase=replied profile=spark-agi user=8319079055 chat=8319079055 chat_type=private'
  );
});

test('normalizes missing and spaced fields', () => {
  const line = telegramCommandTelemetryLine({
    command: 'custom command',
    phase: 'failed',
    errorName: 'Timeout Error'
  });

  assert.equal(
    line,
    '[Command] command=custom_command phase=failed profile=unknown user=unknown chat=unknown chat_type=unknown error=Timeout_Error'
  );
});
