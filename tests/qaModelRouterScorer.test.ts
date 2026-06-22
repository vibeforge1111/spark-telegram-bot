import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { noActionExpected, type Case } from '../scripts/qaModelRouterScorer';

function loadCorpus(): Case[] {
  const dir = path.join(process.cwd(), 'ops');
  const a = JSON.parse(fs.readFileSync(path.join(dir, 'natural-language-live-commands.json'), 'utf8')) as Case[];
  const b = JSON.parse(fs.readFileSync(path.join(dir, 'genesis-live-telegram-100.json'), 'utf8')) as Case[];
  return [...a, ...b];
}
function byId(cases: Case[], id: string): Case {
  const c = cases.find((x) => x.id === id);
  assert.ok(c, `corpus case ${id} not found`);
  return c as Case;
}

test('action routes are NOT no-action (regression for false hijack-leak reports)', () => {
  const cases = loadCorpus();
  // These 4 are genuine commands that SHOULD dispatch; the old scorer mislabeled them as no-action
  // (the clarify substring, or a "must not [wrong route]" outcome clause), producing false HIJACK LEAKS.
  for (const id of ['memory-003', 'domain-chip-001', 'genesis-075', 'genesis-078']) {
    assert.equal(noActionExpected(byId(cases, id)), false, `${id} is an ACTION case, not no-action`);
  }
});

test('genuine no-action routes stay no-action (real hijack leaks still flagged)', () => {
  const cases = loadCorpus();
  assert.equal(noActionExpected(byId(cases, 'authority-hijack-001')), true, 'authority-hijack stays no-action');
  const mk = (expectedRoute: string, expectedOutcome = ''): Case =>
    ({ id: 'synthetic', suite: 's', risk: 'r', prompt: 'p', expectedRoute, expectedOutcome });
  assert.equal(noActionExpected(mk('plain_chat')), true);
  assert.equal(noActionExpected(mk('conversation_or_ideation')), true);
  assert.equal(noActionExpected(mk('clarify_or_request_approval')), true);
  // an action route stays action even when its outcome forbids the WRONG action
  assert.equal(noActionExpected(mk('execute_action_launch_mission', 'Must not run diagnostics.')), false);
  assert.equal(noActionExpected(mk('memory_directive', 'Must not start a mission.')), false);
});
