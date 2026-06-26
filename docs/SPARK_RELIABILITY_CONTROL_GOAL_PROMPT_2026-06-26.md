# Spark Reliability Control Goal Prompt

Date: 2026-06-26
Status: active under-4,000-character writable-lane prompt

Read first:

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_RELIABILITY_CONTROL_WORKPLAN_2026-06-26.md`
- `outputs/live-canary-full/live-canary-summary.md`

```text
Goal: Continue Spark reliability hardening as a control program. Prove old edges, hidden sources, and live route behavior cannot silently affect current Telegram, Recursive, Spawner, Builder, mission relay, or docs behavior.

Prime rule: First reduce proof gaps and trace-join gaps. Do not expand UI, media support, or new features unless they directly close a measured control-proof gap. Streaming, rich messages, and composition work may be touched only when the missing proof/eval gap is named first.

Current baseline:
- Start from `outputs/live-canary-full/live-canary-summary.md`, not stale history.
- Full behavior proof is release-ready only when the checked packet says full release scope and `Release gate: ready`.
- Publish is separate. `Publish gate: not ready` means owner handoffs remain open.
- Already present: legacy source inventory, render firewall, trace join checker, route-boundary join proof, proof-capsule coverage, reliability eval coverage, legacy prompt surface gate, capability evidence, surface eval, and full/safe-first packets.
- Current live gap: `npm run control:proof:live-trace` still needs real SparkRecursive_bot Telegram text turns joined across intent -> route decision -> action/no-action -> reply/proof. Empty samples are not enough.

Task order:
1. Live trace proof: make the live route ledger observable and strict. If rows are missing, prove whether the ledger is absent, disabled, stale, on a different path, or simply uncaptured.
2. Hidden-source firewall: keep legacy plans, read-only evidence, raw ids, file paths, provider internals, and stack-like details out of ordinary replies unless explicitly inspected.
3. Source inventory: keep every legacy plan/source marked active, read-only evidence, archive candidate, or delete candidate. Do not let old docs silently define current behavior.
4. Proof capsules: every action-capable route must emit or join one proof capsule, and no-action turns must explicitly prove no action happened.
5. Trace join checker: maintain end-to-end proof for user intent -> route decision -> action/no-action -> reply, including `do not run`, `just explain`, build/mission mentions, stale memory conflicts, images, audio, streaming/rich messages, and publish handoffs.
6. Natural-language suite: keep the old NL catalog as fast breadth coverage and promotion source material. Do not use it alone as release proof; promote representative cases into control-proof canaries when they close a named gap.
7. Surface quality: keep deterministic machinery underneath and human Telegram wording on top. Robotic but logically correct ordinary replies fail surface eval.
8. Evidence hygiene: refresh canary evidence after relevant source/docs/test changes. Commit small steps often.

Operating posture:
- Prefer durable truth fixes, tests, docs, and evidence over save-the-day patches.
- Do not widen media, UI, or composition scope until proof gaps and trace joins are reduced.
- Compact cards are for status, diagnose, proof, queues, picker choices, and dense summaries; ordinary follow-ups stay short and natural.

Done for this phase:
- Fresh live rows join intent, route, action/no-action, and reply/proof evidence.
- Hidden context cannot leak into ordinary Telegram replies.
- Action-capable routes have proof capsules or explicit no-action proof.
- Legacy sources are classified and isolated from fresh prompts unless inspected.
- Canary evidence distinguishes scoped release readiness from publish readiness.
```
