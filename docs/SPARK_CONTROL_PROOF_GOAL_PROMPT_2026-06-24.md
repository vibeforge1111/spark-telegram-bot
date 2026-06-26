# Spark Control Proof Goal Prompt

Date: 2026-06-24

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md`

```text
Goal: Make Spark Telegram, Recursive, Spawner, Builder, mission relay, and control-proof dependable under the new Harness Core, with human conversational surfaces and exact machinery underneath.

Governing priority: First reduce proof gaps and trace-join gaps. Do not expand UI, media support, or new features unless they directly close a measured control-proof gap.

Posture:
- Treat every issue as proof first, implementation second, publishing last.
- Prefer durable source-of-truth fixes, replayable evidence, tests, and docs over one-off edits or brittle prompts.
- Keep routing, state, access, providers, trace ids, proof joins, safety gates, mission ids, timestamps, and truth checks deterministic.
- Keep Telegram/chat replies concise, warm, and readable. Hide raw ids, hashes, stack traces, paths, provider internals, and repeated mission numbers unless requested.
- Use compact cards only for `/status`, `/diagnose`, `/proof`, raw details, queues, picker choices, or dense multi-system summaries.
- Commit often in small verified slices. Do not push, merge, publish, or open/update PRs unless explicitly asked and the local proof gate is satisfied.

Current baseline:
- Fresh-strict audit is blocking-clean: no missing evidence, trace joins, proof capsules, incomplete legacy backing, latest proof gaps, raw leaks, robotic reasons, or stack-like leaks.
- `Status: gaps found` is acceptable only when paired with `Actionable status: clean`, `Blocking status: clean`, and `Gap posture: backed legacy gaps only; no blocking or latest proof gaps`.
- Remaining proof gaps are backed historical legacy rows in route-confidence, Builder gateway, and Spawner trace planes. Keep them visible; do not relabel them as fresh Harness authority.
- Full canary evidence lives in `outputs/live-canary-full/live-canary-summary.md/.json`. Release-ready and publish-ready are separate claims.
- Current publish blockers are owner handoffs, not Telegram behavior failures: repo drift must name owner and `behind=N`; local runtime artifacts must name owners; Builder historical debt must name unresolved family count and latest unresolved event.
- Keep old NL suites only as fast breadth/drift coverage and promotion source material. Promote useful cases into Harness-shaped canaries; archive or narrow obsolete parts that mislead release proof.

Work plan:
1. Run `npm run control:proof:audit -- --sample 100 --fresh-strict` and fix current/latest-row gaps before adding surfaces.
2. Audit trace joins across Telegram, Recursive, Spawner, Builder, mission relay, CLI summaries, logs, and evidence packets. Fix missing joins at the producer boundary.
3. Use safe SparkRecursive_bot canaries first: `cp-builder-001`, `cp-proof-001`, `cp-streaming-001`, `cp-streaming-002`. Record reply, side effects, proof join, screenshot/confirmation, and verdict.
4. Confirm streaming/rich-message defaults through the real Telegram route. Preserve no duplicate previews; prove streamed edits, final collapse, rich formatting, and live-profile delivery.
5. Keep rich messages for readability, not decoration. Do not widen media/UI support unless it closes a measured proof gap.
6. Keep non-execution memory, voice, and media evidence separate from execution proof.
7. Update docs with each slice: proof contracts, trace contracts, default messaging behavior, canary expectations, and release/publish gates.

Proof ladder:
- Reproduce or audit the real path.
- Classify the gap.
- Add or update focused regression coverage.
- Patch the failing boundary.
- Run focused tests, relevant suite/build/typecheck, canary/audit commands, and live Telegram visual QA when judging the surface.
- Refresh evidence only from a clean/source-committed state.
- End each step with proof, remaining caveats, and next safe action.
```
