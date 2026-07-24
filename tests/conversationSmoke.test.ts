import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  formatConversationSmokeSummary,
  readConversationSmokeScenarios,
  runConversationSmokeScenarios
} from '../src/conversationSmoke';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const fixturePath = path.join(__dirname, '..', 'ops', 'realtime-conversation-smoke.json');

test('realtime conversation smoke fixture covers broad trigger and non-trigger routing', () => {
  const scenarios = readConversationSmokeScenarios(fixturePath);
  const summary = runConversationSmokeScenarios(scenarios);
  const report = formatConversationSmokeSummary(summary);

  assert.equal(summary.failed, 0, report);
  assert.equal(summary.turnCount, 75);
  assert.ok(summary.scenarioCount >= 18);
  assert.match(report, /operator-safe-actions\/level5-temp-file-smoke -> operator\.safe_action/);
  assert.match(report, /provider-and-explicit-runs\/codex-provider -> natural_run/);
  assert.match(report, /external-research-triggers\/openclaw-hermes-research -> external_research\.inspect/);
  assert.match(report, /build-word-versus-build-intent\/upgrade-strategy -> plain_chat/);
});

test('conversation smoke parser rejects empty scenario lists', () => {
  assert.throws(
    () => readConversationSmokeScenarios(path.join(__dirname, '..', 'package.json')),
    /fixture must be a JSON array/i
  );
});

test('conversation smoke parser rejects malformed JSON without exposing its path', () => {
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spark-conversation-smoke-'));
  const malformedPath = path.join(fixtureDir, 'private-fixture.json');
  fs.writeFileSync(malformedPath, '{"not":');
  try {
    assert.throws(
      () => readConversationSmokeScenarios(malformedPath),
      (error: unknown) => {
        assert.match(String(error), /contains invalid JSON/i);
        assert.doesNotMatch(String(error), /private-fixture/);
        return true;
      }
    );
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  }
});
