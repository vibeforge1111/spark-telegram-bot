# Spark Reliability Control Goal Prompt

Date: 2026-06-27
Status: active under-4,000-character writable-lane prompt

Read first:

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_RELIABILITY_CONTROL_WORKPLAN_2026-06-26.md`
- `outputs/live-canary-full/live-canary-summary.md`

```text
Goal: Continue Spark reliability hardening as a control program, not a cleanup sprint. Prove old edges, hidden sources, and live route behavior cannot silently affect current Telegram, Recursive, Spawner, Builder, mission relay, or docs behavior.

Prime rule: First reduce proof gaps and trace-join gaps. Do not expand UI, media support, or new features unless they directly close a measured control-proof gap. Streaming, rich messages, media, and composition work may be touched only when the missing proof/eval gap is named first.

Current baseline:
- Start from `outputs/live-canary-full/live-canary-summary.md`, not stale chat history or older safe-first packets.
- On 2026-06-27, `npm run control:proof:reliability`, `npx ts-node tests/controlProofLiveCanaryPack.test.ts`, `npx ts-node tests/controlProofGoalPrompt.test.ts`, and `npm run build` passed locally.
- Full behavior proof is release-ready only when the checked packet says `Gate scope: full release pack` and `Release gate: ready`.
- Publish is separate. `Publish gate: not ready` means owner handoffs remain open; do not imply registry, installer, or public publish readiness.
- Already present: source inventory, render firewall, trace-join checker, live route join proof, proof-capsule coverage, reliability eval coverage, legacy prompt surface gate, capability evidence, surface eval, and full/safe-first canary packets.

Task order:
1. Preserve live trace proof: keep strict joins for user intent -> route decision -> action/no-action -> reply/proof. Missing, stale, mismatched, or unjoined live rows are release blockers.
2. Reduce hidden-source influence: keep legacy plans, catalogs, runbooks, prompts, and handoffs classified as active, read-only evidence, archive candidate, or delete candidate before they can affect fresh behavior.
3. Keep the render firewall hard: hidden context, raw ids, file paths, provider internals, stack-like details, and read-only evidence must not reach ordinary replies unless explicitly inspected.
4. Require proof capsules: every action-capable route must emit or join one proof capsule; no-action turns must prove no action happened.
5. Maintain old-edge evals for `do not run`, `just explain`, build/mission mentions, stale memory conflicts, images, audio, streaming/rich messages, and publish handoffs.
6. Use the natural-language suite as fast breadth coverage and promotion material only. Promote cases into control-proof canaries when they close a named gap; do not use old NL prompts as release authority.
7. Keep Telegram surface human: deterministic machinery underneath, short natural wording on top. Logically correct but robotic ordinary replies fail surface eval.
8. Refresh evidence after source/docs/test changes and commit small, reviewable steps.

Operating posture:
- Prefer durable truth fixes, tests, docs, and evidence over save-the-day patches.
- Do not widen UI, media, rich composition, or feature scope until proof gaps and trace joins are reduced.
- Compact cards are for status, diagnose, proof, queues, picker choices, and dense summaries; ordinary follow-ups stay short and natural.

Done for this phase:
- Fresh live rows join intent, route, action/no-action, reply, and proof.
- Hidden/read-only context cannot leak into ordinary Telegram replies.
- Action-capable routes have proof capsules or explicit no-action proof.
- Legacy sources are classified and kept out of fresh prompts unless inspected.
- Canary evidence distinguishes scoped release readiness from publish readiness.
```
