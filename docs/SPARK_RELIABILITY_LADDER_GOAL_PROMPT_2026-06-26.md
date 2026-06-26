# Spark Reliability Ladder Goal Prompt

Date: 2026-06-26

Use this as the current writable-lane goal prompt after reading:

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26.md`
- `outputs/live-canary-full/live-canary-summary.md`

```text
Goal: Continue Spark reliability hardening as a control program, not a cleanup sprint. The fresh stack is behavior-release ready; the next work is proving old edges cannot silently affect current Telegram, Recursive, Spawner, Builder, mission relay, or documentation behavior.

Prime rule: Reduce proof gaps, trace-join gaps, and hidden-source influence first. Do not expand UI, media support, rich composition, or new features unless the change directly closes a measured control-proof gap.

Current proof baseline:
- Start from `outputs/live-canary-full/live-canary-summary.md`, not stale history.
- Full canary behavior proof is release-ready when the checked packet says `Gate scope: full release pack` and `Release gate: ready`.
- Publish is still separate. `Publish gate: not ready` means owner handoffs remain open; do not turn release-ready behavior proof into publish or registry readiness.
- Fresh-strict audit must stay clean for missing evidence, trace joins, proof capsules, incomplete legacy backing, latest proof gaps, raw leaks, robotic reasons, and stack-like leaks.
- Backed historical legacy gaps may remain visible. Do not hide them or relabel them as fresh Harness authority.
- Already added: legacy source inventory, render firewall docs/tests, trace-join checker, proof-capsule coverage gate, reliability eval coverage gate, and refreshed full/safe-first canary packets.

Reliability ladder:
1. Source inventory: keep `docs/SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26.md` current. Every legacy plan, catalog, runbook, prompt source, or handoff that can affect a fresh turn must be marked `active`, `read-only evidence`, `archive candidate`, or `delete candidate`.
2. Render firewall: add a hard Telegram render boundary so hidden context, read-only evidence, raw ids, file paths, stack traces, provider internals, and legacy plans cannot reach ordinary replies unless explicitly inspected.
3. Proof capsules: every action-capable route must emit or join exactly one appropriate proof capsule, or explicitly prove no action happened.
4. Trace join checker: build an end-to-end checker for `user intent -> route decision -> action/no-action -> reply`, including no-action turns.
5. Evals: cover `do not run`, `just explain`, build/mission mentions, images, audio, stale memory conflicts, streaming/rich messages, and publish handoffs at the real route boundary.
6. Legacy prompt removal: move legacy plans out of prompts and UI summaries unless the user explicitly asks to inspect history.
7. Capability evidence: add last-success and last-failure evidence per capability only after source boundaries and trace joins are enforced.
8. Surface eval: add a regular human-feel eval where logically correct but robotic replies fail ordinary conversation checks.

Next local slice:
- Turn legacy prompt/UI-summary removal into a checked gate before adding capability evidence or surface-eval breadth.
- Treat empty trace-join route samples as not enough for live proof; strict live confidence needs real SparkRecursive_bot route rows joined to reply/proof evidence.

Operating posture:
- Work in small committed steps.
- Prefer durable source-of-truth fixes, tests, docs, and evidence over save-the-day patches.
- Keep deterministic machinery underneath and human wording on the surface.
- Compact cards are for status, diagnose, proof, queues, picker choices, and dense summaries; ordinary follow-ups should be short and natural.
- Refresh canary evidence after source/docs/test changes that affect source snapshots.

Done for this phase:
- Legacy sources are classified and enforced.
- Hidden/read-only context cannot leak into ordinary Telegram replies.
- End-to-end trace joins prove intent, route, action/no-action, and reply.
- Action-capable routes have proof capsules or explicit no-action evidence.
- Reliability evals protect the main old-edge failures.
- Docs say what is active, what is historical, what is selected-case proof, and what is full release proof.
```
