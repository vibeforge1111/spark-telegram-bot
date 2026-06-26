# Spark Control Proof Docs Index

Date: 2026-06-24
Status: working documentation map

## Purpose

This is the organizing layer for the control-proof work. Use it before running the goal prompt so Spark starts from current documentation, a read-only audit baseline, and the new R28 rule: Harness Core decides; tracing proves.

Entry condition: reduce proof gaps and trace-join gaps before expanding UI, media support, or new visible features. A new surface belongs in this work only when it directly closes a measured control-proof gap.

## Canonical Docs

Read these in order:

1. `docs/TURNINTENT_HARNESS_RULESET.md`
   - Permanent Spark-wide authority rules.
   - Source for no-action boundaries, high-agency action classes, and release gates.

2. `docs/SPARK_HARNESS_CONTRACT.md`
   - Telegram's role in the shared Harness contract.
   - Source for repo boundaries and next-slice acceptance.

3. `docs/SPARK_CONTROL_PROOF_PLAN_2026-06-24.md`
   - Full work plan: proof panel, trace continuity, Telegram surface repair, media inputs, live canaries.

4. `docs/SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md`
   - Read-only audit to run before using the goal prompt.
   - Source for evidence locations and gap classes.

5. `docs/SPARK_CONTROL_PROOF_PREFLIGHT_RESULT_2026-06-24.md`
   - Latest captured read-only baseline.
   - Source for the first implementation slice and current gap register.

6. `docs/SPARK_CONTROL_PROOF_GOAL_PROMPT_2026-06-24.md`
   - Compact under-4,000-character execution prompt.
   - Use only after the preflight audit is captured or intentionally skipped.

7. `docs/SPARK_NATURAL_LANGUAGE_SUITE_HARNESS_CORE_AUDIT_2026-06-24.md`
   - Audit of the older `nl:live` and Genesis natural-language suites.
   - Source for the decision to keep them as broad regression catalogs, not the new control-proof release gate.

8. `docs/TELEGRAM_COMPOSITION_STANDARD.md`
   - Human surface rules for Telegram.
   - Source for repairing policy-shaped replies.

9. `docs/LIVE_CHAT_STREAMING_DESIGN.md`
   - Streaming and Rich Message architecture.
   - Source for keeping Telegram drafts presentation-only.

10. `docs/QA_OPERATOR_TELEGRAM_RECURSION.md`
   - Recursive/QA Operator Telegram behavior.
   - Source for SparkRecursive_bot-specific canaries.

11. `docs/VOICE_RUNTIME_ARCHITECTURE.md`
   - Voice path context.
   - Source for voice trace continuity.

## Documentation Rule

Do not let old Spark docs silently define the new system.

When a doc conflicts with the R28/Harness Core model:

1. Add a "New control-proof note" near the relevant section.
2. Link to the newer canonical doc.
3. Preserve old historical context when useful.
4. Do not rewrite history to make older docs look current.
5. Do not delete old docs just because they are stale; mark what supersedes them.

## New Spark Language

Use this wording consistently:

- Harness Core is authority.
- Tracing is proof, not permission.
- Memory is evidence, not permission.
- Pending state is evidence, not permission.
- Telegram drafts are presentation-only.
- High-agency action without proof is a release blocker.
- User-facing replies hide raw internals unless raw details are requested.

Avoid old-style wording that implies:

- keyword matches authorize work
- memory can approve action
- trace rows can grant permission
- provider success proves user authorization
- a mission id is enough to resume or mutate work
- diagnostic cards are the default shape for ordinary chat

## Required Doc Updates During Execution

Each implementation slice should update docs in the same commit or an adjacent commit:

- Proof capsule changes update `SPARK_CONTROL_PROOF_PLAN_2026-06-24.md`.
- Trace audit commands update `SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md`.
- Telegram copy rules update `TELEGRAM_COMPOSITION_STANDARD.md`.
- Streaming or Rich Message behavior updates `LIVE_CHAT_STREAMING_DESIGN.md`.
- Recursive/QA Operator behavior updates `QA_OPERATOR_TELEGRAM_RECURSION.md`.
- Harness boundary changes update `TURNINTENT_HARNESS_RULESET.md` or `SPARK_HARNESS_CONTRACT.md`.
- Voice behavior updates `VOICE_RUNTIME_ARCHITECTURE.md`.
- Natural-language suite usage changes update `SPARK_NATURAL_LANGUAGE_SUITE_HARNESS_CORE_AUDIT_2026-06-24.md`.

## Done Definition

The documentation is current when:

- A new contributor can find the plan, the prompt, the audit, and the release gate from this index.
- No canonical doc says tracing, memory, keywords, pending state, provider output, or mission ids authorize action.
- Every shipped control-proof slice has matching tests and matching docs.
- The live canary suite links to current docs and records where proof should appear.
- Builder trace-health docs distinguish active producer failures from historical integrity debt; current release evidence must show whether high-severity debt is unresolved now or only historical.
