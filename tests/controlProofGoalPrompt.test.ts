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
const RELIABILITY_CONTROL_WORKPLAN_PATH = resolve(ROOT, 'docs/SPARK_RELIABILITY_CONTROL_WORKPLAN_2026-06-26.md');
const RELIABILITY_CONTROL_GOAL_PROMPT_PATH = resolve(ROOT, 'docs/SPARK_RELIABILITY_CONTROL_GOAL_PROMPT_2026-06-26.md');
const RELIABILITY_GOAL_PROMPT_PATH = resolve(ROOT, 'docs/SPARK_RELIABILITY_LADDER_GOAL_PROMPT_2026-06-26.md');
const RENDER_FIREWALL_PATH = resolve(ROOT, 'docs/SPARK_TELEGRAM_RENDER_FIREWALL_2026-06-26.md');
const TRACE_JOIN_CHECKER_PATH = resolve(ROOT, 'docs/SPARK_TRACE_JOIN_CHECKER_2026-06-26.md');
const PROOF_CAPSULE_COVERAGE_PATH = resolve(ROOT, 'docs/SPARK_PROOF_CAPSULE_COVERAGE_2026-06-26.md');
const RELIABILITY_EVAL_COVERAGE_PATH = resolve(ROOT, 'docs/SPARK_RELIABILITY_EVAL_COVERAGE_2026-06-26.md');
const LEGACY_PROMPT_SURFACE_PATH = resolve(ROOT, 'docs/SPARK_LEGACY_PROMPT_SURFACE_2026-06-26.md');
const CAPABILITY_EVIDENCE_PATH = resolve(ROOT, 'docs/SPARK_CAPABILITY_EVIDENCE_2026-06-26.md');
const SURFACE_EVAL_PATH = resolve(ROOT, 'docs/SPARK_SURFACE_EVAL_2026-06-26.md');
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
  assert.match(index, /SPARK_RELIABILITY_CONTROL_WORKPLAN_2026-06-26\.md/);
  assert.match(index, /SPARK_RELIABILITY_CONTROL_GOAL_PROMPT_2026-06-26\.md/);
  assert.match(index, /SPARK_RELIABILITY_LADDER_GOAL_PROMPT_2026-06-26\.md/);
  assert.match(index, /Prefer the newer reliability control goal prompt for active lanes/);
  assert.match(index, /SPARK_TELEGRAM_RENDER_FIREWALL_2026-06-26\.md/);
  assert.match(index, /SPARK_TRACE_JOIN_CHECKER_2026-06-26\.md/);
  assert.match(index, /SPARK_PROOF_CAPSULE_COVERAGE_2026-06-26\.md/);
  assert.match(index, /SPARK_RELIABILITY_EVAL_COVERAGE_2026-06-26\.md/);
  assert.match(index, /SPARK_LEGACY_PROMPT_SURFACE_2026-06-26\.md/);
  assert.match(index, /SPARK_CAPABILITY_EVIDENCE_2026-06-26\.md/);
  assert.match(index, /SPARK_SURFACE_EVAL_2026-06-26\.md/);
  assert.match(index, /Legacy source status changes update `SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26\.md`/);
  assert.match(index, /Trace join checker behavior updates `SPARK_TRACE_JOIN_CHECKER_2026-06-26\.md`/);
  assert.match(index, /Proof capsule coverage behavior updates `SPARK_PROOF_CAPSULE_COVERAGE_2026-06-26\.md`/);
  assert.match(index, /Reliability eval coverage behavior updates `SPARK_RELIABILITY_EVAL_COVERAGE_2026-06-26\.md`/);
  assert.match(index, /Legacy prompt\/UI summary surface behavior updates `SPARK_LEGACY_PROMPT_SURFACE_2026-06-26\.md`/);
  assert.match(index, /Capability evidence behavior updates `SPARK_CAPABILITY_EVIDENCE_2026-06-26\.md`/);
  assert.match(index, /Surface eval behavior updates `SPARK_SURFACE_EVAL_2026-06-26\.md`/);
  assert.match(index, /Telegram render-firewall behavior updates `SPARK_TELEGRAM_RENDER_FIREWALL_2026-06-26\.md`/);
  assert.match(index, /Legacy plans, catalogs, runbooks, and handoffs are classified before they influence a fresh turn/);
});

test('active reliability control goal prompt stays compact and proof-first', () => {
  const promptDoc = readFileSync(RELIABILITY_CONTROL_GOAL_PROMPT_PATH, 'utf8');
  const prompt = promptDoc.match(/```text\n([\s\S]*?)\n```/)?.[1] ?? '';

  assert.ok(prompt.length > 0, 'active reliability control goal prompt block missing');
  assert.ok(prompt.length < 4000, `active reliability prompt is ${prompt.length} chars; must stay under 4000`);
  assert.match(prompt, /First reduce proof gaps and trace-join gaps\./);
  assert.match(prompt, /Do not expand UI, media support, or new features unless they directly close a measured control-proof gap\./);
  assert.match(prompt, /Current live gap: `npm run control:proof:live-trace` still needs real SparkRecursive_bot Telegram text turns/);
  assert.match(prompt, /Natural-language suite: keep the old NL catalog as fast breadth coverage and promotion source material/);
  assert.match(prompt, /Do not widen media, UI, or composition scope until proof gaps and trace joins are reduced/);
  assert.match(prompt, /Canary evidence distinguishes scoped release readiness from publish readiness/);
});

test('active reliability control workplan records status and task order', () => {
  const workplan = readFileSync(RELIABILITY_CONTROL_WORKPLAN_PATH, 'utf8');

  assert.match(workplan, /Current blocker:/);
  assert.match(workplan, /Live trace-join proof still needs real SparkRecursive_bot Telegram text turns/);
  assert.match(workplan, /Active Task Order/);
  assert.match(workplan, /Reduce proof gaps and trace-join gaps/);
  assert.match(workplan, /Lock hidden-source boundaries/);
  assert.match(workplan, /Require proof capsules on action-capable routes/);
  assert.match(workplan, /Expand evals only where they close measured gaps/);
  assert.match(workplan, /Refresh evidence and docs after each slice/);
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
  assert.match(inventory, /`docs\/SPARK_TELEGRAM_RENDER_FIREWALL_2026-06-26\.md` \| active/);
  assert.match(inventory, /`docs\/SPARK_TRACE_JOIN_CHECKER_2026-06-26\.md` \| active/);
  assert.match(inventory, /`docs\/SPARK_PROOF_CAPSULE_COVERAGE_2026-06-26\.md` \| active/);
  assert.match(inventory, /`docs\/SPARK_RELIABILITY_EVAL_COVERAGE_2026-06-26\.md` \| active/);
  assert.match(inventory, /`docs\/SPARK_LEGACY_PROMPT_SURFACE_2026-06-26\.md` \| active/);
  assert.match(inventory, /`docs\/SPARK_CAPABILITY_EVIDENCE_2026-06-26\.md` \| active/);
  assert.match(inventory, /`docs\/SPARK_SURFACE_EVAL_2026-06-26\.md` \| active/);
  assert.match(inventory, /`docs\/LAUNCH_CONVERSATION_QA_2026-05-08\.md` \| archive candidate/);
  assert.match(inventory, /None in this pass/);
  assert.match(inventory, /Keep the render firewall covered by tests/);
  assert.match(inventory, /Keep the end-to-end trace join checker covered/);
  assert.match(inventory, /Keep proof-capsule coverage checked/);
  assert.match(inventory, /Keep reliability eval coverage checked/);
  assert.match(inventory, /Keep the legacy prompt surface gate covered/);
  assert.match(inventory, /Keep capability evidence checked/);
  assert.match(inventory, /Keep the surface eval checked/);
});

test('render firewall doc records ordinary and inspect boundaries', () => {
  const doc = readFileSync(RENDER_FIREWALL_PATH, 'utf8');

  assert.match(doc, /The render firewall is the Telegram delivery boundary for ordinary replies/);
  assert.match(doc, /This is not a copy-style rule/);
  assert.match(doc, /`ordinary`: default for natural replies/);
  assert.match(doc, /`inspect`: allowed for explicit proof\/status\/diagnose\/raw\/review\/picker surfaces/);
  assert.match(doc, /raw reason codes such as `tool_not_allowed_by_policy`/);
  assert.match(doc, /raw proof refs such as `turn:sha256:\.\.\.`/);
  assert.match(doc, /Inspect replies may keep proof and trace refs when useful/);
  assert.match(doc, /ctx\.reply/);
  assert.match(doc, /trace join checker: user intent -> route decision -> action\/no-action -> reply/);
});

test('trace join checker doc records route-to-reply proof boundary', () => {
  const doc = readFileSync(TRACE_JOIN_CHECKER_PATH, 'utf8');

  assert.match(doc, /user intent -> route decision -> action\/no-action -> reply/);
  assert.match(doc, /separate from the per-plane trace continuity audit/);
  assert.match(doc, /spark\.nlp\.route_execution\.v1/);
  assert.match(doc, /npm run control:proof:trace-join -- --strict/);
  assert.match(doc, /request and trace join keys/);
  assert.match(doc, /proof join when a Harness proof ref is present/);
  assert.match(doc, /An empty route sample is not clean proof/);
  assert.match(doc, /Do not backfill them unless the backing evidence proves the exact request, trace, proof, action\/no-action, and reply join/);
});

test('proof capsule coverage doc records action-capable policy boundary', () => {
  const doc = readFileSync(PROOF_CAPSULE_COVERAGE_PATH, 'utf8');

  assert.match(doc, /every action-capable Telegram plane has exactly one declared proof path/);
  assert.match(doc, /npm run control:proof:capsules -- --strict/);
  assert.match(doc, /direct_capsule/);
  assert.match(doc, /joined_capsule/);
  assert.match(doc, /explicit_no_action/);
  assert.match(doc, /Duplicate proof paths are treated as drift/);
  assert.match(doc, /control:proof:trace-join/);
});

test('reliability eval coverage doc records old-edge eval categories', () => {
  const doc = readFileSync(RELIABILITY_EVAL_COVERAGE_PATH, 'utf8');

  assert.match(doc, /do not run/);
  assert.match(doc, /just explain/);
  assert.match(doc, /build\/mission mentions/);
  assert.match(doc, /stale memory conflicts/);
  assert.match(doc, /streaming\/rich messages/);
  assert.match(doc, /publish handoffs/);
  assert.match(doc, /npm run control:proof:evals -- --strict/);
});

test('legacy prompt surface doc records prompt and summary boundary', () => {
  const doc = readFileSync(LEGACY_PROMPT_SURFACE_PATH, 'utf8');

  assert.match(doc, /npm run control:proof:legacy-prompts -- --strict/);
  assert.match(doc, /prompt-facing source files/);
  assert.match(doc, /human canary summary markdown/);
  assert.match(doc, /does not scan docs, tests, ops scripts, or raw JSON evidence packets/);
  assert.match(doc, /Do not silence the failure by renaming old evidence as current authority/);
});

test('capability evidence doc records last-success and boundary proof', () => {
  const doc = readFileSync(CAPABILITY_EVIDENCE_PATH, 'utf8');

  assert.match(doc, /npm run control:proof:capabilities -- --strict/);
  assert.match(doc, /last-success/);
  assert.match(doc, /last-failure\/boundary/);
  assert.match(doc, /full SparkRecursive_bot control-proof canary packet/);
  assert.match(doc, /Do not fix this by claiming registry visibility/);
});

test('surface eval doc records human-feel reply gate', () => {
  const doc = readFileSync(SURFACE_EVAL_PATH, 'utf8');

  assert.match(doc, /npm run control:proof:surface -- --strict/);
  assert.match(doc, /logically correct and still fail/);
  assert.match(doc, /generic chatbot phrases/);
  assert.match(doc, /proof panels/);
  assert.match(doc, /ordinary replies/);
});

test('reliability ladder goal prompt sequences enforcement before expansion', () => {
  const promptDoc = readFileSync(RELIABILITY_GOAL_PROMPT_PATH, 'utf8');
  const prompt = promptDoc.match(/```text\n([\s\S]*?)\n```/)?.[1] || '';

  assert.ok(prompt.length > 0, 'reliability goal prompt block missing');
  assert.ok(prompt.length < 4000, `reliability goal prompt is ${prompt.length} chars; must stay under 4000`);
  assert.match(prompt, /control program, not a cleanup sprint/);
  assert.match(prompt, /Reduce proof gaps, trace-join gaps, and hidden-source influence first/);
  assert.match(prompt, /Source inventory/);
  assert.match(prompt, /Render firewall/);
  assert.match(prompt, /every action-capable route must emit or join exactly one appropriate proof capsule/);
  assert.match(prompt, /user intent -> route decision -> action\/no-action -> reply/);
  assert.match(prompt, /do not run/);
  assert.match(prompt, /just explain/);
  assert.match(prompt, /last-success and last-failure evidence per capability/);
  assert.match(prompt, /logically correct but robotic replies fail/);
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
