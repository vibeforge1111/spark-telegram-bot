# Spark Harness Core Contract

Status: Harness Core VNext/Governor adoption active

## Role Of This Repo

`spark-telegram-bot` is the primary natural-language ingress and final human
reply surface for Spark Harness Core.

Telegram should:

- normalize the inbound turn as evidence
- preserve request, chat, user, route, and trace identifiers
- adapt legacy Telegram turn data into `TurnIntentEnvelopeVNext`
- consume `GovernorDecisionV1`, `AuthorizationDecisionV1`, and
  `ToolCallLedgerV1`
- forward high-agency work only to the owner route named by the Governor
- compose concise human replies from owner-system results and trace evidence

Telegram should not:

- let raw keywords execute action
- let memory, pending state, route history, provider names, or health status
  authorize action
- mint execution authority from old `TurnIntentEnvelopeV1` compatibility data
- let Builder or Spawner re-decide from raw text after a Governor refusal,
  interruption, or no-action outcome
- claim memory saves, mission execution, publication, or installer readiness
  without owner proof

## Current Contract

The current canonical contract source is:

`work/repos/spark-harness-core`

The runtime package face is:

`@spark/harness-core`

Current authority chain:

```text
fresh turn evidence
-> TurnIntentEnvelopeVNext
-> GovernorDecisionV1
-> AuthorizationDecisionV1
-> owner consumer verification
-> ToolCallLedgerV1
-> side-effect proof
-> Telegram reply
```

`TurnIntentEnvelopeV1` and `spark.turn_intent.v1` are historical
compatibility/predecessor language. They are not installer-facing execution
authority.

## Current Implementation

- `src/harnessCoreVNext.ts` adapts Telegram turn evidence into VNext and emits
  authorization/ledger records.
- `src/telegramActionAuthority.ts` builds or verifies Governor authority for
  Telegram action paths.
- `src/harnessExecutionAuthority.ts` requires `GovernorDecisionV1` and calls
  Harness Core verification helpers.
- Tests under `tests/harnessCoreVNext.test.ts` and related authority suites
  cover no-action, positive action, missing authority, stale/copy rejection,
  and owner/tool binding.

## Human Surface Rule

Telegram replies should stay natural. Do not make canned deterministic reply
templates the proof target.

Release-risk Telegram QA should prove:

- selected route equals executed route
- Governor outcome is visible in trace
- authorization and tool ledger exist when a tool runs
- refusal/no-op cases produce no side effect
- build/memory/chip/browser/computer-use prompts cannot be hijacked by stale
  context, health words, provider names, or keyword matches

## Acceptance For Connected Work

- High-agency Telegram routes require Governor authority.
- Owner routes reject bare VNext for execution.
- Negative/no-action prompts block mission, file, publish, schedule, memory
  write, chip creation, browser/computer-use, and provider dispatch.
- Positive explicit actions still work without defensive phrasing from the
  user when Harness Core authorizes the exact action.
- Live proof uses native Telegram Desktop via CUA when the test is about the
  Telegram app surface.
