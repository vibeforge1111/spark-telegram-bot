# Spark Harness Contract

Status: Milestone 0.1 active

## Role Of This Repo

`spark-telegram-bot` is the primary ingress surface for Spark Harness.

Telegram should:

- normalize the inbound turn
- classify candidates
- build `TurnIntentEnvelopeV1`
- authorize safe route execution from that envelope
- compose the human Telegram reply

Telegram should not:

- let raw keywords execute action
- let memory authorize action
- let stale pending state authorize action
- let Builder or Spawner re-decide from raw text after Telegram already created a no-action envelope

## Current Implementation

- `src/harnessContract.ts` defines the first TypeScript contract slice.
- `tests/harnessContract.test.ts` locks down no-action, startup canary, memory evidence, and missing-envelope behavior.
- `src/index.ts` builds a turn envelope before Intent Gate V2 safe route execution.
- Safe routes call `authorizeToolCallFromEnvelope(...)` before handling the route.

## Shared Source Of Truth

Spark-wide TurnIntent rules are documented locally in:

- `docs/TURNINTENT_HARNESS_RULESET.md`
- `docs/TURNINTENT_AGENTS_ADOPTION.md`

The proposed shared private contract repo is:

`/Users/alchemistab/Documents/Codex/2026-05-30/we-have-been-working-on-achieving/work/spark-harness-contracts`

Remote:

`https://github.com/vibeforge1111/spark-harness-contracts`

Until that repo is promoted, Telegram owns the first runnable TypeScript implementation.

## Next Control-Proof Slice

The June 24 control-proof docs live in:

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_CONTROL_PROOF_PLAN_2026-06-24.md`
- `docs/SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md`
- `docs/SPARK_CONTROL_PROOF_GOAL_PROMPT_2026-06-24.md`

They define the next work after R28: docs organization, read-only preflight audit, Harness proof capsules, trace-continuity audit, Telegram surface repair, typed media envelopes, and the live canary pack.

## Acceptance For Next Slice

- Telegram fixtures come from the shared contract repo.
- Builder parses the same fixture envelope shape.
- Spawner parses the same fixture envelope shape.
- Route selected equals route executed.
- No-action prompts block mission, file, publish, schedule, memory write, and chip creation unless explicitly selected by the envelope.
