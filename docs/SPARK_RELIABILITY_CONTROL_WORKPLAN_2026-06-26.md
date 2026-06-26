# Spark Reliability Control Workplan

Date: 2026-06-26
Status: active control program

## Purpose

This doc keeps the reliability work organized while the active goal prompt stays compact enough to paste into a writable Codex lane.

The current rule is proof first: reduce proof gaps, trace-join gaps, and hidden-source influence before expanding UI, media support, rich composition, or other new features.

Current writable-lane prompt: `docs/SPARK_RELIABILITY_CONTROL_GOAL_PROMPT_2026-06-27.md`.

## Current Baseline

Already built or documented:

- Legacy source inventory: `docs/SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26.md`
- Render firewall: `docs/SPARK_TELEGRAM_RENDER_FIREWALL_2026-06-26.md`
- Trace join checker: `docs/SPARK_TRACE_JOIN_CHECKER_2026-06-26.md`
- Proof capsule coverage: `docs/SPARK_PROOF_CAPSULE_COVERAGE_2026-06-26.md`
- Reliability eval coverage: `docs/SPARK_RELIABILITY_EVAL_COVERAGE_2026-06-26.md`
- Legacy prompt surface gate: `docs/SPARK_LEGACY_PROMPT_SURFACE_2026-06-26.md`
- Capability evidence: `docs/SPARK_CAPABILITY_EVIDENCE_2026-06-26.md`
- Surface eval: `docs/SPARK_SURFACE_EVAL_2026-06-26.md`
- Natural-language suite audit: `docs/SPARK_NATURAL_LANGUAGE_SUITE_HARNESS_CORE_AUDIT_2026-06-24.md`
- Current canary evidence: `outputs/live-canary-full/live-canary-summary.md`

Current proof state:

- Full behavior proof is release-ready in `outputs/live-canary-full/live-canary-summary.md` when it says `Gate scope: full release pack` and `Release gate: ready`.
- Selected-case packets are focused evidence only. If their refresh context shows transient publish handoffs, use the full release packet for release or publish handoff authority.
- Live trace-join proof is ready when `npm run control:proof:live-trace` shows four or more real SparkRecursive_bot Telegram rows joined through user intent, route decision, action/no-action, and reply/proof evidence, with four no-action/read-only rows from the safe prompt set.
- On 2026-06-27, `npm run control:proof:reliability`, `npx ts-node tests/controlProofLiveCanaryPack.test.ts`, `npx ts-node tests/controlProofGoalPrompt.test.ts`, and `npm run build` passed locally.
- After commit `bd7dba9`, the source/docs/test slice is locally verified, but a full canary evidence refresh must wait if `npm run control:proof:live-trace` reports stale SparkRecursive_bot rows. The canary refresh command now refuses to overwrite observation or summary packets when refreshed packet evidence is missing or invalid; do not commit regenerated canary packets from stale or unjoined live trace evidence.
- The proof-capsule coverage gate now also rejects weak policy summaries. Direct capsule policies must say they emit, attach, create, or record a proof capsule or delivery/reply proof; joined policies must say they join or preserve downstream proof; no-action policies must prove fresh no-action evidence.
- Publish readiness remains separate. `Publish gate: not ready` means owner handoffs remain open and must not be described as registry or publish readiness.

Current open handoffs:

- Publish handoffs listed in the full canary summary.
- Historical Builder trace-health lifecycle resolution listed in the full canary summary.
- Local runtime test artifact handoff listed in the full canary summary.

## Current Proof Battery

Run this battery before claiming the current reliability phase remains behavior-release ready:

```bash
npm run control:proof:reliability
```

Expanded form:

```bash
npm run control:proof:audit -- --sample 100 --fresh-strict
npm run control:proof:live-trace
npm run control:proof:source-inventory
npm run control:proof:render-firewall
npm run control:proof:capsules -- --strict
npm run control:proof:evals -- --strict
npm run control:proof:legacy-prompts -- --strict
npm run control:proof:capabilities -- --strict
npm run control:proof:surface -- --strict
```

The battery must stay clean for missing evidence, trace joins, proof capsules, incomplete legacy backing, latest proof gaps, raw leaks, robotic reasons, stack-like leaks, live route joins, source-inventory classification, render-firewall redaction, action-capable proof policy coverage, old-edge eval coverage, legacy prompt/UI summary leaks, capability last-success and last-failure/boundary evidence, and ordinary-reply surface quality. Backed historical legacy gaps may remain visible only when the fresh-strict audit says the backing is complete, latest gaps are zero, and release blocking is no.

## Active Task Order

1. Reduce proof gaps and trace-join gaps.
   - Preserve live trace proof as a release gate.
   - Make missing, stale, mismatched, or unjoined live rows fail loudly.
   - Keep `npm run control:proof:live-trace` as the strict proof gate.

2. Lock hidden-source boundaries.
   - Keep legacy plans classified as active, read-only evidence, archive candidate, or delete candidate.
   - Keep old plans out of ordinary prompts and UI summaries unless explicitly inspected.
   - Preserve backed historical gaps as history, not fresh Harness authority.

3. Require proof capsules on action-capable routes.
   - Every action-capable path must emit or join one proof capsule.
   - Proof policies must explain the proof path strongly enough for future maintainers to see whether the route emits proof, joins downstream proof, or proves fresh no-action.
   - No-action turns must explicitly prove no action happened.
   - Action without proof stays a release blocker.

4. Expand evals only where they close measured gaps.
   - Keep `do not run`, `just explain`, build/mission mentions, stale memory conflicts, images, audio, streaming/rich messages, and publish handoffs represented.
   - Do not add broad UI/media/composition work unless the missing eval or proof join is named first.

5. Refresh evidence and docs after each slice.
   - Update the relevant doc in the same commit or an adjacent commit.
   - Refresh live canary packets when source, tests, or docs alter release evidence.
   - Commit small, reviewable steps.

## Documentation Rule

When new behavior lands, update the active implementation doc and this workplan if the task order or baseline changes. Update the docs index when a new document becomes part of the control map. Do not let old Spark docs silently define the current system; mark historical material as historical instead of rewriting it into current authority.

New documentation should organize current proof, next action, and release meaning. It should not create a parallel authority path, soften gates, or present feature expansion as reliability work unless the measured control-proof gap is named. Treat documentation as source-adjacent proof: if a doc claim changes a gate, baseline, or release meaning, test it and commit it as deliberately as code.

## Done For This Phase

This phase is done only when:

- Fresh live route rows join user intent, route decision, action/no-action, and reply/proof evidence.
- Hidden context cannot reach ordinary Telegram replies.
- Action-capable routes have proof capsules or explicit no-action proof.
- Legacy sources are classified and kept out of fresh prompts unless inspected.
- The canary packet says the scoped release gate is ready, with publish readiness kept separate.
