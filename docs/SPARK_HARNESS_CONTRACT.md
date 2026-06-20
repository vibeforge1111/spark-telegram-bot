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
- preserve the governed request, trace, and mission identifiers on
  machine-origin lifecycle notifications such as PRD canvas-ready, blocked
  handoff, still-running, and mission relay messages

Telegram should not:

- let raw keywords execute action
- let memory, pending state, route history, provider names, or health status
  authorize action
- mint execution authority from old `TurnIntentEnvelopeV1` compatibility data
- let Builder or Spawner re-decide from raw text after a Governor refusal,
  interruption, or no-action outcome
- claim memory saves, mission execution, publication, or installer readiness
  without owner proof

## Root-Cause Change Rule

The transcript is the repro, not the patch. When a Telegram turn exposes a
failure, classify the failure family and fix the earliest owning layer:

- parser/candidate generation when Spark fails to recognize a general natural
  language class
- natural route precedence or context/source selection when stale residue,
  older projects, or action words steal the turn
- Telegram intent envelope or Harness contract when side-effect class,
  freshness, no-action, or scoped authority is wrong
- Harness Core/Governor when authorization, owner/tool binding, or denial
  reason is wrong
- owner adapter/system when execution, terminal state, or proof is wrong
- reply composition only when authority, source, and owner truth are already
  correct but the human-facing message is unclear

Do not ship exact-sentence, project-name, mission-id, or reply-text fixes.
Every route, memory, provider, access, tool, or completion-truth fix needs a
natural positive case and an adjacent negative trap.

## Spark-Wide Improvement Governance

The standing governance rule lives in
`docs/SPARK_SYSTEM_GOVERNANCE_RULESET.md`. This contract file describes how
that rule binds to Harness Core and Telegram.

Before changing any Spark system, run the same governance loop regardless of
where the symptom appeared:

```text
read the conversation as a human
-> classify the failure family
-> trace route, Harness/Governor, owner, outbound, and visible reply evidence
-> patch the earliest owning layer
-> prove a natural positive and adjacent negative trap
-> update docs/skills/tests if the rule should carry forward
```

This applies to Spawner, Builder, memory/wiki, provider/access,
browser/computer-use, voice/media, recursive/domain-chip systems,
schedule/publish, installer, Cockpit, Labs, Swarm, Telegram, and plain chat.

Surface-local patches are only valid when the surface owns the failed mechanism.
For example, unreadable spacing belongs to Telegram composition, but a build
starting from "what happened?" belongs to route/Harness/owner authority, and a
wrong project recall belongs to context/source selection or memory lane truth.

Memory and context must stay lane-aware:

- recent conversation frame can answer continuity questions
- durable memory requires Builder/domain-chip-memory owner acceptance
- wiki/ALM can support explanations but cannot override current owner state
- latest user turn and exact hot artifacts outrank stale summaries
- restarts must prove whether context survived as recent frame or durable memory

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
- machine-origin lifecycle notifications are scoped to the original governed
  dispatch and carry metadata-only outbound audit context
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
