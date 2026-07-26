# Spark Reliability Control Goal Prompt

Date: 2026-06-27
Status: active under-4,000-character writable-lane prompt, renewed for documentation-led execution

Read first:

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_RELIABILITY_CONTROL_WORKPLAN_2026-06-26.md`
- `outputs/live-canary-full/live-canary-summary.md`

```text
Goal: Continue Spark reliability as an organized control program, not a cleanup sprint. Use docs as the control map while proving old edges, hidden sources, and live route behavior cannot silently affect Telegram, Recursive, Spawner, Builder, mission relay, or docs. New docs must strengthen this map, not become parallel authority.

Prime rule: First reduce proof gaps and trace-join gaps. Do not expand UI, media support, or new features unless they directly close a measured control-proof gap. Streaming, rich messages, media, and composition work may be touched only when the proof/eval gap is named first.

Current baseline:
- Start from `outputs/live-canary-full/live-canary-summary.md`, not stale chat history or older scoped packets.
- On 2026-06-27, `npm run control:proof:reliability` passed; live-canary, goal-prompt, and build gates passed locally.
- Commit `bd7dba9` passed focused gates. Do not commit its full evidence refresh until live trace rows are fresh if `npm run control:proof:live-trace` reports stale or unjoined SparkRecursive_bot rows.
- Proof is release-ready only when the checked packet says `Gate scope: full release pack` and `Release gate: ready`.
- Publish is separate. `Publish gate: not ready` means owner handoffs remain open; do not imply registry or installer readiness.
Task order:
1. Preserve live trace proof: user intent -> route decision -> action/no-action -> reply/proof. Missing, stale, mismatched, or unjoined live rows are release blockers.
2. Reduce hidden-source influence: classify legacy plans, catalogs, runbooks, prompts, and handoffs before they can affect fresh behavior.
3. Keep the render firewall hard: hidden context, raw ids, file paths, provider internals, stack-like details, and read-only evidence must not reach ordinary replies unless explicitly inspected.
4. Require proof capsules: every action-capable route must emit or join one capsule with a strong policy summary; no-action turns must prove no action happened.
5. Maintain old-edge evals for `do not run`, `just explain`, build/mission mentions, stale memory conflicts, images, audio, streaming/rich messages, and publish handoffs.
6. Use the natural-language suite as fast breadth coverage and promotion material only. Promote cases into control-proof canaries when they close a named gap; do not use old NL prompts as release authority.
7. Keep Telegram surface human: deterministic machinery underneath, short natural wording on top. Logically correct but robotic ordinary replies fail surface eval.
8. Keep docs organized as source-adjacent proof: update the active doc, workplan, and index when behavior, gates, or baselines change. New docs must be indexed, scoped, and tied to a gate or handoff.
9. Refresh evidence after source/docs/test changes and commit small, reviewable steps. Commit source/docs/tests separately from refreshed evidence.

Operating posture:
- Prefer durable truth fixes, tests, docs, and evidence over save-the-day patches.
- Treat docs as living proof surfaces, not after-the-fact notes.
- Prefer updating the current map over adding a doc; when a new doc is needed, state what it supersedes and how it is tested.
- Do not widen UI, media, rich composition, or feature scope until proof gaps and trace joins are reduced.
- Compact cards are for status, diagnose, proof, queues, picker choices, and dense summaries; ordinary follow-ups stay short and natural.

Done for this phase:
- Fresh live rows join intent, route, action/no-action, reply, and proof.
- Hidden/read-only context cannot leak into ordinary Telegram replies.
- Action-capable routes have proof capsules, strong policy summaries, or explicit no-action proof.
- Legacy sources are classified and kept out of fresh prompts unless inspected.
- Canary evidence distinguishes scoped release readiness from publish readiness.
```
