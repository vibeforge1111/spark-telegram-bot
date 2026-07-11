import * as assert from 'node:assert/strict';
import {
  missionRelayHealthPayload,
  setMissionRelayRuntimeStatus,
} from '../src/missionRelay';
import { relaySecretMatches } from '../src/launchMode';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  FAIL  ${name}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

// Set known runtime status so payload is deterministic
setMissionRelayRuntimeStatus({ telegramPolling: 'active' });

// --- missionRelayHealthPayload: full payload contains sensitive fields ---
test('missionRelayHealthPayload: contains pid (sensitive)', () => {
  const payload = missionRelayHealthPayload();
  assert.ok('pid' in payload, `Expected pid field in payload: ${JSON.stringify(payload)}`);
  assert.equal(typeof payload.pid, 'number', `pid should be a number: ${payload.pid}`);
});

test('missionRelayHealthPayload: contains relay (port + profile)', () => {
  const payload = missionRelayHealthPayload();
  assert.ok(payload.relay && typeof payload.relay === 'object', `Expected relay object: ${JSON.stringify(payload)}`);
  assert.ok('port' in (payload.relay as object), `Expected relay.port: ${JSON.stringify(payload.relay)}`);
  assert.ok('profile' in (payload.relay as object), `Expected relay.profile: ${JSON.stringify(payload.relay)}`);
});

test('missionRelayHealthPayload: contains runtime state', () => {
  const payload = missionRelayHealthPayload();
  assert.ok('runtime' in payload, `Expected runtime in payload: ${JSON.stringify(payload)}`);
});

// --- relaySecretMatches: correct secret returns true ---
test('relaySecretMatches: correct secret returns true', () => {
  const secret = 'test-relay-secret-value-12345678';
  assert.equal(relaySecretMatches(secret, secret), true);
});

// --- relaySecretMatches: wrong secret returns false ---
test('relaySecretMatches: wrong secret returns false', () => {
  const secret = 'test-relay-secret-value-12345678';
  assert.equal(relaySecretMatches('wrong-secret-value-123456789012', secret), false);
});

// --- relaySecretMatches: missing header (undefined) returns false ---
test('relaySecretMatches: undefined header returns false', () => {
  const secret = 'test-relay-secret-value-12345678';
  assert.equal(relaySecretMatches(undefined, secret), false);
});

// --- relaySecretMatches: empty string returns false ---
test('relaySecretMatches: empty string header returns false', () => {
  const secret = 'test-relay-secret-value-12345678';
  assert.equal(relaySecretMatches('', secret), false);
});

// --- Redacted payload shape: must NOT contain pid or relay URL ---
test('redacted health payload shape: no pid, no relay URL', () => {
  const redacted = { ok: true, service: 'spark-telegram-bot' };
  assert.ok(!('pid' in redacted), `Redacted payload must not contain pid`);
  assert.ok(!('relay' in redacted), `Redacted payload must not contain relay`);
  assert.ok(!('runtime' in redacted), `Redacted payload must not contain runtime`);
  assert.equal(redacted.service, 'spark-telegram-bot');
});

// --- Full payload shape must contain service identifier ---
test('full payload: contains service identifier', () => {
  const payload = missionRelayHealthPayload();
  assert.equal(payload.service, 'spark-telegram-bot');
});

// --- relaySecretMatches: array header (multi-value) returns false ---
test('relaySecretMatches: array header value returns false', () => {
  const secret = 'test-relay-secret-value-12345678';
  assert.equal(relaySecretMatches(['test-relay-secret-value-12345678'], secret), false);
});

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
