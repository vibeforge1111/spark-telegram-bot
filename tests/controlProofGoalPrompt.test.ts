import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

const ROOT = resolve(__dirname, '..');
const PROMPT_PATH = resolve(ROOT, 'docs/SPARK_CONTROL_PROOF_GOAL_PROMPT_2026-06-24.md');
const PLAN_PATH = resolve(ROOT, 'docs/SPARK_CONTROL_PROOF_PLAN_2026-06-24.md');
const NL_AUDIT_PATH = resolve(ROOT, 'docs/SPARK_NATURAL_LANGUAGE_SUITE_HARNESS_CORE_AUDIT_2026-06-24.md');

test('control-proof goal prompt stays under the handoff limit', () => {
  const prompt = readFileSync(PROMPT_PATH, 'utf8');

  assert.ok(prompt.length < 4000, `goal prompt is ${prompt.length} chars; must stay under 4000`);
});

test('control-proof goal prompt preserves proof-first operating constraints', () => {
  const prompt = readFileSync(PROMPT_PATH, 'utf8');

  assert.match(prompt, /First reduce proof gaps and trace-join gaps\./);
  assert.match(prompt, /Do not expand UI, media support, or new features unless they directly close a measured control-proof gap\./);
  assert.match(prompt, /Treat every issue as proof first, implementation second, publishing last\./);
  assert.match(prompt, /Do not push, merge, publish, or open\/update PRs unless explicitly asked and the local proof gate is satisfied\./);
  assert.match(prompt, /Refresh evidence only from a clean\/source-committed state\./);
  assert.match(prompt, /Full release claims require `Gate scope: full release pack` and `Release-check scope: full release readiness`/);
  assert.match(prompt, /selected-case gates prove selected cases only/);
});

test('control-proof plan documents current proof repair and release boundaries', () => {
  const plan = readFileSync(PLAN_PATH, 'utf8');

  assert.match(plan, /control:proof:repair:final-answer/);
  assert.match(plan, /--repair-stale-proof-panels/);
  assert.match(plan, /clean embedded fresh-strict audit evidence/);
  assert.match(plan, /Release gate: ready/);
  assert.match(plan, /Gate scope: full release pack/);
  assert.match(plan, /Release-check scope: full release readiness/);
  assert.match(plan, /Release-check scope: selected cases only; not a full release claim/);
  assert.match(plan, /Publish gate: not ready/);
  assert.match(plan, /do not turn release-ready behavior proof into a publish or registry claim/);
  assert.match(plan, /ref-only evidence as joined when a redacted proof ref is present/);
  assert.match(plan, /trace-only rows stay under `Evidence trace-only` and must not be counted as `Evidence joined`/);
  assert.match(plan, /matching `Legacy gap backing` detail row with complete backing/);
  assert.match(plan, /proof panels must name `incomplete legacy gap backing` in `Blocking gap planes`/);
});

test('natural-language refurbishment keeps promotion proof-first', () => {
  const audit = readFileSync(NL_AUDIT_PATH, 'utf8');

  assert.match(audit, /Builder catalog contract: `claim_scope=legacy_route_shape`, `release_gate=none`/);
  assert.match(audit, /Telegram legacy NL packets and templates: `claim_scope=legacy_breadth`, `release_gate=none`/);
  assert.match(audit, /Promotion remains proof-first\./);
  assert.match(audit, /Promotion gap: `none` for legacy breadth, or `name measured control-proof or trace-join gap before promotion`/);
  assert.match(audit, /Do not use an old NL prompt to justify expanded UI, media handling, or new composition features unless the mapped case directly closes a measured control-proof or trace-join gap\./);
  assert.match(audit, /Treat the `Promotion gap` column as the proof-first stop sign/);
  assert.match(audit, /keep it as legacy breadth or archive it until a proof gap names the missing authority, side effect, trace join, proof join, reply shape, or live Telegram evidence\./);
});
