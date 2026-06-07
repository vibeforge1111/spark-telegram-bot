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
2. Read this file plus `docs/TURNINTENT_HARNESS_RULESET.md` and the relevant command, route, or adapter doc before edits.
3. Identify whether the change is Telegram-owned or belongs in Builder, CLI, Spawner, memory, Cockpit, voice, Labs, or Swarm.
4. Define the smallest user-visible behavior and stop-ship gate.
5. Add focused tests for routing, composition, access, bridge serialization, or relay metadata.
6. Keep adapters thin and metadata-only.
7. Commit one logical checkpoint and record verification.

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
