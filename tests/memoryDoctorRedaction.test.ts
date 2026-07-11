import assert from 'node:assert/strict';
import { redactMemoryDoctorOutput } from '../src/memoryDoctorBridge';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('redactMemoryDoctorOutput strips Telegram ID from memory doctor output', () => {
  const input = 'Memory Doctor: healthy. Request: telegram:768628429. Brain: visible.';
  const output = redactMemoryDoctorOutput(input);
  assert(!output.includes('768628429'), 'Telegram ID should be redacted');
  assert(output.includes('[TELEGRAM_ID_REDACTED]'), 'Should contain redaction marker');
});

test('redactMemoryDoctorOutput strips visibility score', () => {
  const input = 'Brain: visibility 81/100, 2 gaps detected.';
  const output = redactMemoryDoctorOutput(input);
  assert(!output.includes('81/100'), 'Visibility score should be redacted');
  assert(output.includes('[SCORE_REDACTED]'), 'Should contain score redaction marker');
});

test('redactMemoryDoctorOutput strips benchmark score', () => {
  const input = 'Benchmark: 67/100, weakest=doctor_intake:fail.';
  const output = redactMemoryDoctorOutput(input);
  assert(!output.includes('67/100'), 'Benchmark score should be redacted');
  assert(!output.includes('doctor_intake:fail'), 'Weakest slot should be redacted');
});

test('redactMemoryDoctorOutput strips multiple IDs in one output', () => {
  const input = 'Request: telegram:768628429. Admin: telegram:1145923083.';
  const output = redactMemoryDoctorOutput(input);
  assert(!output.includes('768628429'), 'First ID should be redacted');
  assert(!output.includes('1145923083'), 'Second ID should be redacted');
});

test('redactMemoryDoctorOutput passes normal text unchanged', () => {
  const input = 'Memory Doctor: healthy. No issues detected.';
  const output = redactMemoryDoctorOutput(input);
  assert.equal(output, input, 'Normal text should pass through unchanged');
});
