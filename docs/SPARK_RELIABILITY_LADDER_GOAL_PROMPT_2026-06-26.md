# Spark Reliability Ladder Goal Prompt

Date: 2026-06-26

Use this as the current writable-lane goal prompt after reading:

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26.md`
- `outputs/live-canary-full/live-canary-summary.md`

```text
Goal: Continue Spark reliability hardening as a control program, not a cleanup sprint. Prove old edges and hidden sources cannot silently affect current Telegram, Recursive, Spawner, Builder, mission relay, or docs behavior.

Prime rule: Reduce proof gaps, trace-join gaps, and hidden-source influence first. Do not expand UI, media support, rich composition, or new features unless the change directly closes a measured control-proof gap.

Current proof baseline:
- Start from `outputs/live-canary-full/live-canary-summary.md`, not stale history.
- Full behavior proof is release-ready only when the checked packet says full release scope and `Release gate: ready`.
- Publish is separate. `Publish gate: not ready` means owner handoffs remain open; do not imply publish or registry readiness.
- Fresh-strict audit must stay clean for missing evidence, joins, capsules, incomplete legacy backing, latest proof gaps, raw leaks, robotic reasons, and stack-like leaks.
- Backed historical gaps may remain visible. Do not relabel them as fresh Harness authority.
- Already added: legacy source inventory, render firewall, trace-join checker, route-boundary join proof, proof-capsule coverage, reliability eval coverage, capability evidence, surface eval, and refreshed full/safe-first packets.

Reliability ladder:
1. Source inventory: keep `docs/SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26.md` current. Every legacy plan, catalog, runbook, prompt source, or handoff that can affect a fresh turn must be marked `active`, `read-only evidence`, `archive candidate`, or `delete candidate`.
2. Render firewall: hidden context, read-only evidence, raw ids, file paths, stack traces, provider internals, and legacy plans cannot reach ordinary replies unless explicitly inspected.
3. Proof capsules: every action-capable route must emit or join exactly one appropriate proof capsule, or explicitly prove no action happened.
4. Trace join checker: build an end-to-end checker for `user intent -> route decision -> action/no-action -> reply`, including no-action turns.
5. Evals: cover `do not run`, `just explain`, build/mission mentions, images, audio, stale memory conflicts, streaming/rich messages, and publish handoffs.
6. Legacy prompt removal: move legacy plans out of prompts and UI summaries unless the user explicitly asks to inspect history.
7. Capability evidence: add last-success and last-failure evidence per capability only after source boundaries and trace joins are enforced.
8. Surface eval: add a regular human-feel eval where logically correct but robotic replies fail ordinary conversation checks.

Next local slice:
- Close the remaining live proof gap: empty default route samples are not enough. Strict confidence needs real SparkRecursive_bot Telegram text turns with route ledger rows joined to reply/proof evidence.
- Keep legacy prompt/UI-summary removal, capability evidence, and surface eval gates current while capturing live route rows.
- Only after live joins are proven, widen checks for streaming/rich messages, media, or composition regressions.

Operating posture:
- Work in small committed steps.
- Prefer durable truth fixes, tests, docs, and evidence over save-the-day patches.
- Keep deterministic machinery underneath and human wording on the surface.
- Compact cards are for status, diagnose, proof, queues, picker choices, and dense summaries; ordinary follow-ups stay short and natural.
- Refresh canary evidence after source/docs/test changes that affect snapshots.

Done for this phase:
- Legacy sources are classified and enforced.
- Hidden/read-only context cannot leak into ordinary Telegram replies.
- End-to-end trace joins prove intent, route, action/no-action, and reply.
- Action-capable routes have proof capsules or explicit no-action evidence.
- Reliability evals protect the main old-edge failures.
- Docs say what is active, what is historical, what is selected-case proof, and what is full release proof.
```
