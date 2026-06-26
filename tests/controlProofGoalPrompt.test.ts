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
const DOCS_INDEX_PATH = resolve(ROOT, 'docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md');
const LEGACY_SOURCE_INVENTORY_PATH = resolve(ROOT, 'docs/SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26.md');
const NL_AUDIT_PATH = resolve(ROOT, 'docs/SPARK_NATURAL_LANGUAGE_SUITE_HARNESS_CORE_AUDIT_2026-06-24.md');
const NL_PLAN_PATH = resolve(ROOT, 'ops/NATURAL_LANGUAGE_LIVE_TEST_PLAN.md');
const PREFLIGHT_RESULT_PATH = resolve(ROOT, 'docs/SPARK_CONTROL_PROOF_PREFLIGHT_RESULT_2026-06-24.md');

test('control-proof goal prompt stays under the handoff limit', () => {
  const prompt = readFileSync(PROMPT_PATH, 'utf8');

  assert.ok(prompt.length < 4000, `goal prompt is ${prompt.length} chars; must stay under 4000`);
});

test('control-proof goal prompt preserves proof-first operating constraints', () => {
  const prompt = readFileSync(PROMPT_PATH, 'utf8');

  assert.match(prompt, /Refurbish Spark around the new Harness Core by reducing proof gaps first/);
  assert.match(prompt, /Prime rule: First reduce proof gaps and trace-join gaps\./);
  assert.match(prompt, /First reduce proof gaps and trace-join gaps\./);
  assert.match(prompt, /Do not expand UI, media support, or new features unless they directly close a measured control-proof gap\./);
  assert.match(prompt, /Never try to save the day with one-off patches\./);
  assert.match(prompt, /Treat every issue as proof first, implementation second, publishing last\./);
  assert.match(prompt, /Do not push, merge, publish, or open\/update PRs unless explicitly asked and the local proof gate is satisfied\./);
  assert.match(prompt, /Refresh evidence only from a clean\/source-committed state\./);
  assert.match(prompt, /Full release claims require `Gate scope: full release pack` and `Release-check scope: full release readiness`/);
  assert.match(prompt, /selected-case gates prove selected cases only/);
});

test('docs index routes future work through the proof-first entry condition', () => {
  const index = readFileSync(DOCS_INDEX_PATH, 'utf8');

  assert.match(index, /reduce proof gaps and trace-join gaps before expanding UI, media support, or new visible features/);
  assert.match(index, /directly closes a measured control-proof gap/);
  assert.match(index, /SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26\.md/);
  assert.match(index, /Legacy source status changes update `SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26\.md`/);
  assert.match(index, /Legacy plans, catalogs, runbooks, and handoffs are classified before they influence a fresh turn/);
});

test('control-proof plan documents current proof repair and release boundaries', () => {
  const plan = readFileSync(PLAN_PATH, 'utf8');

  assert.match(plan, /control:proof:repair:final-answer/);
  assert.match(plan, /--repair-stale-proof-panels/);
  assert.match(plan, /clean embedded fresh-strict audit evidence/);
  assert.match(plan, /`Blocking gap planes`/);
  assert.match(plan, /derived `Evidence capsule gaps` row/);
  assert.match(plan, /existing proof-panel\/audit evidence/);
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
  assert.match(plan, /packet evidence is invalid under `legacy_repair_dry_run`/);
  assert.match(plan, /--summary-frozen-at-collected/);
  assert.match(plan, /only when regenerating checked-in summary fixtures/);
  assert.match(plan, /must not be used to bypass `source_snapshot`, runtime freshness, or `--refresh-runtime-evidence`/);
});

test('natural-language refurbishment keeps promotion proof-first', () => {
  const audit = readFileSync(NL_AUDIT_PATH, 'utf8');
  const plan = readFileSync(NL_PLAN_PATH, 'utf8');

  assert.match(audit, /Builder catalog contract: `claim_scope=legacy_route_shape`, `release_gate=none`/);
  assert.match(audit, /Telegram legacy NL packets and templates: `claim_scope=legacy_breadth`, `release_gate=none`/);
  assert.match(audit, /Promotion remains proof-first\./);
  assert.match(audit, /Promotion gap: `none` for legacy breadth, or `name measured control-proof or trace-join gap before promotion`/);
  assert.match(audit, /Do not use an old NL prompt to justify expanded UI, media handling, or new composition features unless the mapped case directly closes a measured control-proof or trace-join gap\./);
  assert.match(audit, /Treat the `Promotion gap` column as the proof-first stop sign/);
  assert.match(audit, /keep it as legacy breadth or archive it until a proof gap names the missing authority, side effect, trace join, proof join, reply shape, or live Telegram evidence\./);
  assert.match(plan, /Feature boundary: do not use legacy NL cases to expand UI, media support, rich composition, or new features/);
  assert.match(plan, /unless the mapped case names the measured control-proof or trace-join gap it closes/);
});

test('legacy source inventory classifies old plans before fresh-turn use', () => {
  const inventory = readFileSync(LEGACY_SOURCE_INVENTORY_PATH, 'utf8');

  assert.match(inventory, /active`, `read-only evidence`, `archive candidate`, or `delete candidate`/);
  assert.match(inventory, /Legacy material must not reach prompts, Telegram replies, UI summaries, canary release claims, or publish claims unless it is explicitly inspected and joined to current Harness Core proof/);
  assert.match(inventory, /`ops\/natural-language-live-commands\.json` \| read-only evidence/);
  assert.match(inventory, /`ops\/genesis-live-telegram-100\.json` \| read-only evidence/);
  assert.match(inventory, /`outputs\/live-canary-full\/\*` \| active/);
  assert.match(inventory, /`outputs\/live-canary-safe-first\/\*` \| active/);
  assert.match(inventory, /`docs\/LAUNCH_CONVERSATION_QA_2026-05-08\.md` \| archive candidate/);
  assert.match(inventory, /None in this pass/);
  assert.match(inventory, /Add a render firewall/);
  assert.match(inventory, /user intent -> route decision -> action\/no-action -> reply/);
});

test('preflight result marks stale safe-first recapture advice as superseded', () => {
  const result = readFileSync(PREFLIGHT_RESULT_PATH, 'utf8');

  assert.match(result, /Current-state supersession, 2026-06-26/);
  assert.match(result, /checked safe-first packet has since been recaptured\/refreshed and is selected-case ready/);
  assert.match(result, /The safe-first packet is selected-case ready only; it is not a complete release claim until the full release pack is run/);
  assert.match(result, /Release-check scope: selected cases only; not a full release claim/);
  assert.match(result, /Current-state supersession after goal prompt renewal, 2026-06-26/);
  assert.match(result, /commit `18f8c57` renewed the checked goal prompt/);
  assert.match(result, /runtime evidence collected at `2026-06-26T15:30:35\.932Z`/);
  assert.match(result, /`Gate scope: full release pack`, `Release gate: ready`, and `Publish gate: not ready`/);
  assert.match(result, /runtime evidence collected at `2026-06-26T15:31:57\.642Z` and remains selected-case proof only/);
  assert.match(result, /Continue from the full canary packet plus `npm run control:proof:audit -- --sample 100 --fresh-strict`/);
});
