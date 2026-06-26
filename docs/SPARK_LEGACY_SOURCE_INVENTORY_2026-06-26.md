# Spark Legacy Source Inventory

Date: 2026-06-26
Status: repo-local control map

## Purpose

This inventory maps repo-local plans, catalogs, runbooks, and evidence sources that can still affect Spark Telegram, Recursive, Spawner, Builder, or mission-relay behavior if a future agent reads them as current instruction.

The goal is not deletion first. The goal is source control: each source must be treated as `active`, `read-only evidence`, `archive candidate`, or `delete candidate` before it can influence a fresh turn.

## Control Rule

Legacy material must not reach prompts, Telegram replies, UI summaries, canary release claims, or publish claims unless it is explicitly inspected and joined to current Harness Core proof.

- `active`: current source of rules, proof, or release gates.
- `read-only evidence`: useful for history, regression breadth, or promotion decisions; not authority by itself.
- `archive candidate`: keep for now, but only as historical context after current rules are extracted or linked.
- `delete candidate`: remove only after owner review proves it is duplicated, unsafe, or misleading with no remaining audit value.

No repo-local source is marked `delete candidate` in this first pass.

## Active Sources

| Source | Status | Fresh-turn boundary |
| --- | --- | --- |
| `docs/TURNINTENT_HARNESS_RULESET.md` | active | Harness Core authority and no-action boundary source. |
| `docs/SPARK_HARNESS_CONTRACT.md` | active | Shared Harness contract and repo-boundary source. |
| `docs/SPARK_CONTROL_PROOF_PLAN_2026-06-24.md` | active | Current proof work plan and release/publish boundary record. |
| `docs/SPARK_CONTROL_PROOF_GOAL_PROMPT_2026-06-24.md` | active | Compact execution prompt; stays under 4,000 characters. |
| `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md` | active | Canonical doc router and stale-doc rule. |
| `docs/SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md` | active | Current audit command map and gap classes. |
| `docs/SPARK_CONTROL_PROOF_PREFLIGHT_RESULT_2026-06-24.md` | active | Current baseline and gap register, with supersession notes for refreshed evidence. |
| `docs/TELEGRAM_COMPOSITION_STANDARD.md` | active | Human Telegram surface rules. |
| `docs/SPARK_TELEGRAM_RENDER_FIREWALL_2026-06-26.md` | active | Current ordinary-vs-inspect Telegram render firewall behavior. |
| `docs/SPARK_TRACE_JOIN_CHECKER_2026-06-26.md` | active | Current user intent to route/action/reply trace-join checker behavior. |
| `docs/SPARK_PROOF_CAPSULE_COVERAGE_2026-06-26.md` | active | Current action-capable authority plane proof-capsule coverage behavior. |
| `docs/LIVE_CHAT_STREAMING_DESIGN.md` | active | Active for proven Telegram streaming/rich defaults; future Builder-native phases stay gated by measured proof gaps. |
| `docs/QA_OPERATOR_TELEGRAM_RECURSION.md` | active | Recursive/QA Operator Telegram behavior source. |
| `docs/VOICE_RUNTIME_ARCHITECTURE.md` | active | Voice evidence boundary source; voice evidence remains non-execution unless a future proof gap changes that. |
| `ops/controlProofLiveCanaryPack.ts` | active | Harness-shaped canary release gate implementation. |
| `outputs/live-canary-full/*` | active | Current full SparkRecursive_bot behavior proof packet. |
| `outputs/live-canary-safe-first/*` | active | Selected-case proof only; not a full release claim. |

## Read-Only Evidence And Promotion Sources

| Source | Status | Fresh-turn boundary |
| --- | --- | --- |
| `ops/natural-language-live-commands.json` | read-only evidence | Broad legacy Telegram NL catalog; source material only until promoted into canaries. |
| `ops/genesis-live-telegram-100.json` | read-only evidence | Historical breadth benchmark and periodic drift sweep, not everyday release proof. |
| `ops/NATURAL_LANGUAGE_LIVE_TEST_PLAN.md` | read-only evidence | Live prompt-card workflow and old matrix history; `nl:live` alone is not control-proof readiness. |
| `ops/routeBoundaryHandlerHarness.ts` | read-only evidence | Fast deterministic route-boundary helper; it strips live Telegram streaming/rich rendering. |
| `ops/liveNlCommandSuite.ts` | read-only evidence | Legacy NL runner and Harness map helper; not release proof. |
| `ops/liveNlVerdictReport.ts` | read-only evidence | Legacy evidence exporter with `claim_scope=legacy_breadth`, `release_gate=none`. |
| `ops/naturalRouteReplay.ts` | read-only evidence | Route replay helper for breadth and drift; not a release gate. |
| `ops/CONTEXT_WINDOW_LIVE_TEST_PLAN.md` | read-only evidence | Context-window regression plan; promote cases only when they close a named proof or trace gap. |
| `ops/realtime-conversation-smoke.json` | read-only evidence | Conversation smoke source material; not release proof until promoted or covered by active tests. |
| `ops/capability-natural-language-matrix.json` | read-only evidence | Capability/NL separation matrix; supports classification, not action authority. |
| `docs/TURNINTENT_AGENTS_ADOPTION.md` | read-only evidence | Adoption history; current authority is `TURNINTENT_HARNESS_RULESET.md`. |
| `docs/LAUNCH_CONVERSATION_QA_2026-05-08.md` | read-only evidence | Launch-day conversation QA history; useful style context only. |
| `docs/SPARK_QA_STARTUP_BENCH_SHOWCASE_RUNBOOK_2026-05-26.md` | read-only evidence | Spark QA demo runbook; not SparkRecursive release or publish proof. |
| `docs/codex-handoffs/2026-05-05-spark-memory-launch-runtime-handoff.md` | read-only evidence | Historical handoff; fresh runtime state and Harness Core outrank it. |
| `docs/codex-handoffs/2026-05-09-natural-language-intelligence-handoff.md` | read-only evidence | Historical NL intelligence handoff; use only through current Harness mapping. |

## Archive Candidates

| Source | Status | Fresh-turn boundary |
| --- | --- | --- |
| `docs/LAUNCH_CONVERSATION_QA_2026-05-08.md` | archive candidate | Archive once still-useful style invariants are fully represented in active composition docs/tests. |
| `docs/SPARK_QA_STARTUP_BENCH_SHOWCASE_RUNBOOK_2026-05-26.md` | archive candidate | Archive or move to Spark QA docs when no longer needed by Telegram control-proof work. |
| `docs/codex-handoffs/*` | archive candidate | Keep as historical context; do not load into prompts unless explicitly inspecting history. |

## Delete Candidates

None in this pass.

Deletion requires a separate owner-reviewed change proving the source is duplicated, unsafe, or misleading with no remaining audit value.

## Next Reliability Slice

Turn this inventory into enforcement:

1. Keep the render firewall covered by tests so read-only evidence cannot leak into ordinary Telegram replies unless explicitly inspected.
2. Keep the end-to-end trace join checker covered for `user intent -> route decision -> action/no-action -> reply`.
3. Keep proof-capsule coverage checked for every action-capable authority plane before adding new execution routes.
4. Add capability last-success and last-failure evidence after the source-boundary rules are enforced.
