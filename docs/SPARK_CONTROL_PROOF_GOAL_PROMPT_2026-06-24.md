# Spark Control Proof Goal Prompt

Date: 2026-06-24

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md`

```text
Goal: Make Spark's Telegram, Recursive, Spawner, Builder, mission-relay, and control-proof systems dependable under the new Harness Core, with conversational surfaces that feel human while the underlying machinery stays exact.

Highest priority:
First reduce proof gaps and trace-join gaps. Do not expand UI, media support, or new features unless they directly close a measured control-proof gap.

Operating rules:
- Treat every issue as a proof problem first, an implementation problem second, and a publishing problem last.
- Prefer durable fixes at the failing boundary over one-off patches, hidden state, brittle prompts, or undocumented assumptions.
- Keep deterministic machinery exact underneath: routing, state, access, providers, trace ids, proof joins, safety gates, mission ids, timestamps, and source-of-truth checks.
- Keep Telegram/chat replies human on the surface: concise, warm, readable, no robotic templates, no raw ids, hashes, stack traces, local paths, provider internals, or repeated mission numbers unless explicitly requested.
- Use compact cards only for dense status, diagnostics, proof panels, review queues, picker choices, or multi-system summaries.
- Commit often in small verified slices. Do not push, merge, or open/update PRs until local proof is clean and live Telegram confirmation is gathered where required.

Current baseline:
- Fresh-strict audit is blocking-clean with no missing evidence, trace joins, proof capsules, incomplete legacy-gap backing, latest proof gaps, raw leaks, robotic failure reasons, or stack-like leaks.
- Read the audit header by gate posture, not by the headline alone: `Status: gaps found` with `Blocking status: clean` and `Gap posture: backed legacy gaps only; no blocking or latest proof gaps` is release-clean for current proof work, while still preserving historical debt visibility.
- Remaining proof gaps are visible historical legacy rows in route-confidence, Builder gateway, and Spawner trace planes. Keep them inspectable; do not relabel them as fresh Harness authority.
- Canary evidence is in `outputs/live-canary-full/live-canary-summary.md/.json`. Release gate can be ready while publish gate remains not ready because registry or repo handoffs are still open.
- Publish/registry answers must distinguish release-ready behavior from publish-not-ready metadata drift, name owner surfaces and next safe action, and state read-only evidence lookup without leaking raw commits, registry keys, or local paths.
- Current publish blockers are proof handoffs, not Telegram behavior failures: repo upstream drift must name each blocked owner and `behind=N`; local runtime test artifacts must name their owner set; Builder historical integrity debt must name unresolved family count and latest unresolved event when present.
- Keep NL suites as fast breadth/drift coverage only where they strengthen the new Harness Core. Archive or narrow parts that conflict with deterministic routing, trace proof, or modern Spark behavior.

Step 1: Reduce measured gaps
- Run `npm run control:proof:audit -- --sample 100 --fresh-strict`.
- Fix current or latest-row gaps before adding surfaces. Do not hide historical gaps; make them inspectable.
- Keep non-execution memory/voice/media evidence separate from execution proof.
- Treat docs drift as a proof gap when it could cause a future release/publish claim to ignore current caveats, owner sets, behind counts, or trace-family lifecycle fields.

Step 2: Live canary proof
- Use safe SparkRecursive_bot canaries first: `cp-builder-001`, `cp-proof-001`, `cp-streaming-001`, `cp-streaming-002`.
- Capture reply, side effects, proof join, screenshot/user confirmation, and verdict.
- Refresh runtime evidence before release checks; stale green packets are not release proof.

Step 3: Streaming/rich messages
- Audit the exact SparkRecursive_bot config/runtime path, not only helper commands.
- Keep defaults durable through config plus migration/fallback docs.
- Test streamed edits, final collapse, rich formatting, and no duplicate previews in the top-level Telegram path.

Step 4: Human Telegram surface
- Normal replies should be warm and short. Use compact cards only for `/status`, `/diagnose`, `/proof`, raw details, review queues, and dense summaries.
- Replace policy-shaped failures with helpful human replies.
- Test that ordinary replies hide raw reason codes, Mission/Provider/Move headings, paths, stacks, and provider internals.

Step 5: Media boundaries
- Typed envelopes cover photo, captioned photo, document, voice, audio, and unsupported media.
- Route media as evidence-only unless fresh Harness authority allows action.
- Do not claim media support live until Telegram behavior and proof joins are confirmed.

Step 6: Docs/suites
- Update docs with each slice.
- Keep canaries Harness-shaped: authority, mutation class, proof join, side effect, reply shape, visual/user confirmation.
- Keep publish/release docs and canaries explicit that release-ready and publish-ready are separate claims.

Release gate:
- Focused tests for changed routes; `npm run build`; full npm test for broad routing/surface changes.
- `spark live status`, `spark providers test --role chat`, `npm run sync:check`, `spark os compile --json`, and fresh-strict audit after runtime changes.
- User live confirmation before PR/publish claims.
```
