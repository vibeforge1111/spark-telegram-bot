# Spark QA Operator From Telegram

This is the intended natural-language flow for improving Spark through recursive QA loops.

For the public creator-system guide, see `spark-domain-chip-labs/docs/creator_system/NATURAL_LANGUAGE_RECURSIVE_LOOP_GUIDE.md`.

## Parent Lane

Root every QA-tester creator mission at:

`spark-qa-operator`

Treat Telegram, Workspace, Spawner UI, Canvas, Kanban, auth pairing, and recursive reports as benchmark lanes under Spark QA Operator. Do not create those surfaces as separate root domains unless the operator explicitly asks for a standalone pack.

## Natural Phrases

Users should be able to say these as normal chat messages. Slash commands remain useful for exact operator control, but they should not be required for the main experience.

Plan the full creator system:

`make the QA tester better by creating better benchmarks and autoloops for Spark Telegram and Workspace`

Run the planned creator mission:

`run it`

Check the planned or running mission:

`status`

Validate the planned mission gates:

`validate it`

Run the recursive loop:

`start one QA improvement loop`

Run several recursive rounds:

`run the QA operator for 3 rounds`

Read the result:

`show me the QA tester report`

Inspect the trace:

`trace the QA operator loop`

Review open decisions:

`what QA decisions need review?`

List recursive loops:

`show recursive loops`

Prepare a private review packet:

`prepare the QA tester for review`

Ask for the next weak spot:

`what should the QA tester improve next?`

Contextual follow-ups after the chat is already about Spark QA Operator:

`give me the readout`

`where did we land?`

`show the receipts`

`show me proof`

`what needs my call?`

`do I need to approve anything?`

`run another round`

`give it another pass`

`keep going`

These follow-ups should inherit the active loop from recent conversation. If the loop is ambiguous, Spark should ask or list recursive sessions instead of guessing.

Dynamic Workspace names should work too. When `/recursive sessions` has shown a loop, users can say things like:

`show the prompt benchmark report`

`show me the proof for the frontier benchmark`

Spark should resolve that against the recent Workspace session list. It should only use this contextual routing when the last 10-15 messages are actually about recursive loops, reports, traces, review decisions, scores, or Workspace recursions.

## Expected Artifact Map

- Domain chip: `domain-chip-spark-qa-operator`
- Benchmark pack: `spark-qa-operator-bench`
- Specialization path and autoloop policy: `specialization-path-spark-qa-operator`
- Telegram integration: `spark-telegram-bot`
- Swarm review packet: `spark-swarm`

## Telegram Message Shape

Telegram should stay short:

- current verdict
- score or round count
- review blockers if any
- Workspace link
- one next action

Workspace keeps the heavy detail:

- trace files
- benchmark reports
- candidate diffs
- keep/revert reasons
- validation ledgers
- Swarm review packet readiness

## Promotion Rule

Never call a QA mutation improved unless it beats the benchmark gate or passes an explicit held-out/transfer gate. Reverted and flat rounds are successful safety behavior when evidence does not improve.

Swarm packets may be prepared locally, but network sharing stays blocked until validation and review gates pass.
