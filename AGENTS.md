# Spark Telegram Bot Agent Ruleset

## Repo Role

`spark-telegram-bot` owns Telegram ingress, concise user-facing composition, command routing, delivery, access prompts, relay metadata, and thin adapters to Builder, CLI, Spawner, memory, and voice evidence.

Canonical truth owned here:

- Telegram command and natural-language ingress behavior
- Telegram-specific access prompts, chat delivery, and reply composition
- relay metadata and metadata-only audit rows emitted by the Telegram adapter
- thin route-context serialization for Builder-owned gates
- Telegram-facing rendering of Builder/CLI/Spawner/Cockpit evidence

This repo does not own:

- Builder RouteConfidenceGateV1, AOC, identity, or memory orchestration
- durable memory storage, memory proof-card truth, or memory mutation authority
- CLI registry, installer, secret storage, or module lifecycle
- Spawner mission execution or provider output bodies
- Cockpit UI action authority or dashboard truth

## Start-of-Work Protocol

1. Run `git status --short --branch`.
2. Read this file plus `docs/SPARK_SYSTEM_GOVERNANCE_RULESET.md`, `docs/SPARK_HUMAN_CONVERSATION_QA_MAP.md`, `docs/TURNINTENT_HARNESS_RULESET.md`, and the relevant command, route, or adapter doc before edits.
3. Identify whether the change is Telegram-owned or belongs in Builder, CLI, Spawner, memory, Cockpit, voice, Labs, or Swarm.
4. Define the smallest user-visible behavior and stop-ship gate.
5. Add focused tests for routing, composition, access, bridge serialization, or relay metadata.
6. Keep adapters thin and metadata-only.
7. Commit one logical checkpoint and record verification.

## Spark-Wide Root-Cause Governance

The canonical repo rule is `docs/SPARK_SYSTEM_GOVERNANCE_RULESET.md`.

Do not patch Spark behavior with deterministic phrase saves, exact project-name
special cases, exact mission-id handling, or reply-text fixes that only make the
latest transcript look good. For every nontrivial Spark fix, classify the
failure family, identify the earliest owning layer, and prove one natural
positive plus one adjacent negative trap.

Use the same governance loop across Spawner, Builder, Telegram, memory/wiki,
recursive/domain-chip, provider/access, browser/computer-use, voice/media,
schedule/publish, installer, Cockpit, Labs, Swarm, and plain chat:

1. Read the exchange as a human conversation.
2. Trace route, Harness/Governor, owner result, outbound audit, ledger, visible
   reply, and side effects as applicable.
3. Patch the owner mechanism, not the final sentence, unless the failure is
   truly only composition.
4. Keep Telegram readable, but never make Telegram wording the safety boundary.
5. Claim done, saved, ready, installed, shipped, published, shared, or fixed
   only from current owner proof and no newer contradictory owner state.

Reusable governance lessons must be promoted, not merely remembered in the
current chat. When a live Telegram/CUA exchange or trace exposes a recurring
failure class, update the relevant agent rules, Spark governance docs, installed
Spark skills, and focused tests or QA prompts. Do this for the general class
only: never for the exact phrase, project name, mission id, screenshot, or reply
text that happened to reveal it.

Promotion is valid only when the rule keeps both user experiences healthy:
natural exploration/status/debugging stays answer-only, and fresh explicit
authority to act still reaches the owning system.

## Spark Governance Reflex

Apply this reflex before every Spark bug fix, Telegram QA verdict, message
polish pass, memory/context adjustment, provider/access check, Spawner change,
or Harness/Core authority change:

1. Read the user turn as a normal human conversation, not as a keyword bag.
2. Identify what was freshly authorized, what was only discussed, and what was
   explicitly bounded as no-save, no-build, no-publish, no-change, or no-op.
3. Identify the lane that should answer: recent chat, durable memory, wiki/ALM,
   owner state, provider state, mission state, trace, or plain conversation.
4. Identify the owner that can prove truth or side effects: Harness
   Core/Governor, Builder, Spawner, domain-chip-memory, CLI/provider,
   Telegram composition, browser/computer-use, voice/media, installer,
   Cockpit, Labs, Swarm, or another declared owner.
5. Decide whether the issue is reusable across wording, project names, owners,
   surfaces, or timing. If not, keep it as an incident note.
6. Patch the owner mechanism that made the wrong route, source, authority,
   owner proof, ledger, or composition decision. Do not patch the visible
   sentence unless trace evidence proves the route/source/owner path is already
   correct.
7. Reject exact transcript saves. Do not key fixes to the observed phrase,
   project name, mission id, screenshot, provider label, or answer text unless
   that token is a real typed contract in the owner system.
8. Preserve the paired boundary: one natural positive must still execute, and
   one adjacent natural no-op trap must remain answer-only.
9. Verify with owner evidence, Harness/Governor trace, ledger/outbound audit,
   side-effect proof, and visible Telegram/CUA evidence when Telegram changed.
10. Promote reusable lessons into this file, Spark governance docs, relevant
    installed skills, and focused tests or QA prompts before calling the fix
    captured.

Small patches are fine only when they are mechanism-level patches. A fix that
only makes the current transcript look good is not a Spark fix.

Conversational QA prompts must sound like real people using Spark. Default to
plain human turns such as "can we talk this through?", "what changed?", "where
were we?", "don't build this yet", and "ok, make the small version now." Use
operator-shaped wording only for operator paths. A route that only behaves when
the user speaks like a QA harness is not ready.

For every reusable failure, capture a governance packet before editing or
promoting the rule:

- human meaning of the latest turn
- failure family, affected Spark surfaces, owner system, and earliest owning layer
- positive natural case that must still work
- adjacent no-op trap that must not execute
- owner proof, Harness/Governor trace, ledger, outbound audit, and side-effect evidence
- code, tests, docs, skills, and QA prompts that must inherit the rule

Promote this packet into durable structure only for reusable failure classes.
Keep incident-only transcript details in QA notes. A fix is not complete if the
lesson lives only in this chat, a final answer, or a local operator memory.

## One Truth Rules

- Telegram is a field console, not the global brain.
- Telegram may render Builder route verdicts, memory proof cards, CLI status, Spawner mission evidence, and voice status; it must not fork those owners' logic.
- Conversation-frame summaries are local context support, not durable memory truth.
- If Builder, CLI, or Spawner proof is unavailable, fail closed or say what proof is missing.
- Do not turn route keywords like build, mission, access, setup, or go into global permission.

## Privacy Red Lines

Do not export, commit, relay, or render into public logs:

- bot tokens, env values, credentials, private keys
- raw chat ids, user ids, or non-redacted account identifiers
- raw prompts when metadata is enough for route/audit
- provider output bodies
- memory bodies or transcript bodies
- raw audio payloads
- private `spark-intelligence-systems` strategy

Use allowlisted serializers for route context, audits, final-answer metadata, and Spawner/Builder bridge payloads.

## Route and Composition Rules

- Raw words may propose candidates; fresh user intent authorizes action.
- Every high-agency Telegram route must be `envelope_verified` or explicit `machine_origin_policy`; any high-agency `legacy_local_gate` is a release blocker.
- Quoted examples, bug reports, meta-language, no-action turns, and "just explain" boundaries block interruptive routes.
- Builder owns RouteConfidenceGateV1. Telegram asks Builder whether to `act`, `ask`, `explain`, or `refuse`.
- The action gate can be deterministic; the user-facing sentence should stay natural and context-aware.
- Explicit no-execution constraints beat action keywords.
- Bare `go` only applies to an active pending action and must not resurrect stale clarifications.
- Global Spark behavior changes become proposals, not silent mutations.
- Repair, memory mutation, publishing, deletion, credential, and external side-effect routes require source-owned authority evidence.
- Composition should be concise, warm, and specific; do not bury the action, blocker, or next move.

## Memory Rules

- Telegram must not claim durable memory saves unless Builder/domain-chip-memory confirms them.
- Local conversation buffer is not durable Spark memory.
- Render memory proof-card metadata only: owner, decision, durability, freshness, confidence, blockers, and correction path.
- Never export memory bodies into Telegram audits, route context, or compiled projections.
- Memory/context QA must include ordinary conversation, not only explicit
  commands. Test implicit preferences, project setup without the word
  "remember", topic switches, restarts, no-save boundaries, no-build boundaries,
  and follow-ups that ask what was being discussed.
- Passing requires the correct source lane and no unintended side effects. A
  plausible answer from stale context, a wiki note, provider residue, route
  history, or an unauthorized diagnostic is still a failure.
- Memory/context fixes must be lane-governance fixes, not transcript patches.
  If Spark answers from the wrong project, stale route residue, wiki notes,
  provider/status context, or local frame, reproduce with natural conversation
  plus a topic switch and patch the source selector, lane classifier, Builder
  bridge, memory owner, or owner-state readout that made the wrong source win.
  Do not special-case the project name, exact prompt, mission id, or reply text.

If a safe chat-plan turn is routed correctly but the visible answer comes from
Memory Doctor, Spawner, provider status, or another unrelated owner, treat that
as source-selection or Builder-bridge contamination. Do not fix it by teaching
Telegram one exact answer; reject the wrong source and repair the owner/lane
boundary that allowed it to win.

## Verification Menu

- Focused tests for changed route, Harness Core action authority, or composition behavior.
- `npm run build`.
- Relevant direct tests such as `tests/buildE2E.test.ts`, `tests/builderBridge.test.ts`, `tests/accessPolicy.test.ts`, `tests/conversationIntent.test.ts`, or Harness Core action authority tests.
- Privacy scan for bridge serializers, audit rows, final-answer metadata, and docs.
- Live Telegram proof only when explicitly requested and safe. Prefer native
  Telegram Desktop through CUA for app-behavior proof; use
  `C:\Users\USER\.cua-driver\packages\current\cua-driver.exe` when available.
  Capture the visible reply, route decision, Governor/authorization result,
  Harness Core ledger, natural route ledger, outbound audit, side effects, and
  timing metrics. Use Telegram Web only for browser-specific checks.
- `git diff --check`.
- `git status --short --branch`.
