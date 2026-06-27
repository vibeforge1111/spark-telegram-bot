# Spark Legacy Source Inventory

Date: 2026-06-26
Status: repo-local control map

## Purpose

This inventory maps repo-local plans, catalogs, runbooks, and evidence sources that can still affect Spark Telegram, Recursive, Spawner, Builder, or mission-relay behavior if a future agent reads them as current instruction.

The goal is not deletion first. The goal is source control: each source must be treated as `active`, `read-only evidence`, `archive candidate`, or `delete candidate` before it can influence a fresh turn.

## Control Rule

Legacy material must not reach prompts, Telegram replies, UI summaries, canary release claims, or publish claims unless it is explicitly inspected and joined to current Harness Core proof.

The strict inventory checker also joins this document to the legacy prompt-surface blocklist. Any repo-local source blocked from prompt/UI summaries must have an inventory row here before `npm run control:proof:source-inventory` can pass.

Any concrete Markdown doc under `docs/` marked `active` here must also be listed in `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`, so current docs remain reachable through the canonical control map.

If the docs index lists a non-active doc, that index entry must visibly mark it as historical, previous, read-only, superseded, or non-authoritative. Context can stay reachable, but stale docs must not look like fresh-turn control authority.

Active canary evidence folders must also contain the core packet files before they can count as current proof: `live-canary-observations.json`, `live-canary-summary.md`, and `live-canary-summary.json`.

Inventory boundaries must explain the status-specific control rule. Read-only evidence rows must say how they can be used as evidence, history, breadth, classification, or promotion material; archive candidates must say archive/extraction/no-prompt behavior; delete candidates must say owner-reviewed removal meaning.

Each source/status pair must be unique. A source may appear with both `read-only evidence` and `archive candidate` when the archive decision is still pending, but duplicate rows with the same status create competing boundaries and fail the gate.

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
| `docs/SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26.md` | active | Source-boundary inventory; must classify itself and every canonical docs-index entry before fresh-turn use. |
| `docs/SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md` | active | Current audit command map and gap classes. |
| `docs/SPARK_CONTROL_PROOF_PREFLIGHT_RESULT_2026-06-24.md` | active | Current baseline and gap register, with supersession notes for refreshed evidence. |
| `docs/SPARK_RELIABILITY_CONTROL_WORKPLAN_2026-06-26.md` | active | Current organized reliability workplan and release-vs-publish handoff source. |
| `docs/SPARK_RELIABILITY_CONTROL_GOAL_PROMPT_2026-06-27.md` | active | Current under-4,000-character writable-lane prompt; starts from the 2026-06-27 local proof battery and keeps publish readiness separate. |
| `docs/SPARK_LINE_COUNT_RATCHET_PLAN_2026-06-27.md` | active | Current R-21 line-count baseline plan; allows the reviewed ratchet checkpoint while requiring future reliability work to shrink, not grow, oversized files. |
| `docs/SPARK_PUBLISH_READINESS_HANDOFFS_2026-06-27.md` | active | Current publish-readiness handoff map; keeps release-ready behavior separate from publish-not-ready upstream, registry, Builder trace-health, voice, and line-count maintenance work. |
| `docs/SPARK_RELIABILITY_CONTROL_GOAL_PROMPT_2026-06-26.md` | read-only evidence | Previous reliability control prompt; useful baseline, but superseded by the 2026-06-27 active prompt for new lanes. |
| `docs/SPARK_RELIABILITY_LADDER_GOAL_PROMPT_2026-06-26.md` | read-only evidence | Previous reliability ladder prompt; useful historical baseline, not the active prompt for new lanes. |
| `docs/TELEGRAM_COMPOSITION_STANDARD.md` | active | Human Telegram surface rules. |
| `docs/SPARK_TELEGRAM_RENDER_FIREWALL_2026-06-26.md` | active | Current ordinary-vs-inspect Telegram render firewall behavior. |
| `docs/SPARK_TRACE_JOIN_CHECKER_2026-06-26.md` | active | Current user intent to route/action/reply trace-join checker behavior. |
| `docs/SPARK_PROOF_CAPSULE_COVERAGE_2026-06-26.md` | active | Current action-capable authority plane proof-capsule coverage behavior. |
| `docs/SPARK_RELIABILITY_EVAL_COVERAGE_2026-06-26.md` | active | Current old-edge reliability eval coverage behavior. |
| `docs/SPARK_LEGACY_PROMPT_SURFACE_2026-06-26.md` | active | Current gate for keeping legacy plans out of prompt-facing source and human canary summaries unless explicitly inspected. |
| `docs/SPARK_CAPABILITY_EVIDENCE_2026-06-26.md` | active | Current gate for deriving capability last-success and last-failure/boundary evidence from full canary observations. |
| `docs/SPARK_SURFACE_EVAL_2026-06-26.md` | active | Current human-feel eval gate for canary replies that are logically correct but robotic or leaky. |
| `docs/LIVE_CHAT_STREAMING_DESIGN.md` | active | Active for proven Telegram streaming/rich defaults; future Builder-native phases stay gated by measured proof gaps. |
| `docs/QA_OPERATOR_TELEGRAM_RECURSION.md` | active | Recursive/QA Operator Telegram behavior source. |
| `docs/VOICE_RUNTIME_ARCHITECTURE.md` | active | Voice evidence boundary source; voice evidence remains non-execution unless a future proof gap changes that. |
| `ops/controlProofLiveCanaryPack.ts` | active | Harness-shaped canary release gate implementation. |
| `outputs/live-canary-full/*` | active | Current full SparkRecursive_bot behavior proof packet; requires observations JSON plus Markdown and JSON summaries. |
| `outputs/live-canary-safe-first/*` | active | Selected-case proof only; not a full release claim; requires observations JSON plus Markdown and JSON summaries. |

## Read-Only Evidence And Promotion Sources

| Source | Status | Fresh-turn boundary |
| --- | --- | --- |
| `ops/natural-language-live-commands.json` | read-only evidence | Broad legacy Telegram NL catalog; source material only until promoted into canaries. |
| `ops/genesis-live-telegram-100.json` | read-only evidence | Historical breadth benchmark and periodic drift sweep, not everyday release proof. |
| `ops/NATURAL_LANGUAGE_LIVE_TEST_PLAN.md` | read-only evidence | Live prompt-card workflow and old matrix history; `nl:live` alone is not control-proof readiness. |
| `docs/SPARK_NATURAL_LANGUAGE_SUITE_HARNESS_CORE_AUDIT_2026-06-24.md` | read-only evidence | Audit of older natural-language suites; promotion source only until a named proof or trace gap promotes a case. |
| `ops/routeBoundaryHandlerHarness.ts` | read-only evidence | Not fresh-turn authority; fast Telegram-shaped route-boundary and trace-join helper proves handler joins but still does not prove live Bot API delivery, streaming, or rich rendering. |
| `ops/liveNlCommandSuite.ts` | read-only evidence | Legacy NL runner and Harness map helper; not release proof. |
| `ops/liveNlVerdictReport.ts` | read-only evidence | Legacy evidence exporter with `claim_scope=legacy_breadth`, `release_gate=none`. |
| `ops/naturalRouteReplay.ts` | read-only evidence | Route replay helper for breadth and drift; not a release gate. |
| `ops/CONTEXT_WINDOW_LIVE_TEST_PLAN.md` | read-only evidence | Context-window regression plan and promotion source; promote cases only when they close a named proof or trace gap. |
| `ops/realtime-conversation-smoke.json` | read-only evidence | Conversation smoke source material; not release proof until promoted or covered by active tests. |
| `ops/capability-natural-language-matrix.json` | read-only evidence | Capability/NL separation matrix; supports classification, not action authority. |
| `docs/TURNINTENT_AGENTS_ADOPTION.md` | read-only evidence | Adoption history; current authority is `TURNINTENT_HARNESS_RULESET.md`. |
| `docs/LAUNCH_CONVERSATION_QA_2026-05-08.md` | read-only evidence | Launch-day conversation QA history; useful style context only. |
| `docs/SPARK_QA_STARTUP_BENCH_SHOWCASE_RUNBOOK_2026-05-26.md` | read-only evidence | Historical Spark QA demo evidence; not SparkRecursive release or publish proof. |
| `docs/codex-handoffs/2026-05-05-spark-memory-launch-runtime-handoff.md` | read-only evidence | Historical handoff; fresh runtime state and Harness Core outrank it. |
| `docs/codex-handoffs/2026-05-09-natural-language-intelligence-handoff.md` | read-only evidence | Historical NL intelligence handoff; use only through current Harness mapping. |

## Archive Candidates

| Source | Status | Fresh-turn boundary |
| --- | --- | --- |
| `docs/LAUNCH_CONVERSATION_QA_2026-05-08.md` | archive candidate | Not fresh-turn authority; archive once still-useful style invariants are fully represented in active composition docs/tests. |
| `docs/SPARK_QA_STARTUP_BENCH_SHOWCASE_RUNBOOK_2026-05-26.md` | archive candidate | Not fresh-turn authority; archive or move to Spark QA docs when no longer needed by Telegram control-proof work. |
| `docs/codex-handoffs/*` | archive candidate | Keep as historical context; do not load into prompts unless explicitly inspecting history. |

## Delete Candidates

None in this pass.

Deletion requires a separate owner-reviewed change proving the source is duplicated, unsafe, or misleading with no remaining audit value.

## Next Reliability Slice

Keep this inventory enforced:

1. Keep the render firewall covered by tests so read-only evidence cannot leak into ordinary Telegram replies unless explicitly inspected.
2. Keep the end-to-end trace join checker covered for `user intent -> route decision -> action/no-action -> reply`.
3. Keep proof-capsule coverage checked for every action-capable authority plane before adding new execution routes.
4. Keep reliability eval coverage checked for old-edge categories before claiming control-proof readiness.
5. Keep the legacy prompt surface gate covered so read-only evidence cannot become hidden prompt or UI-summary authority.
6. Keep capability evidence checked so each capability lane has last-success and last-failure/boundary proof before reliability claims.
7. Keep the surface eval checked so logically correct but robotic replies fail ordinary conversation readiness.
