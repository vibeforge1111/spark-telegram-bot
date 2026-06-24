# Spark Control Proof Goal Prompt

Date: 2026-06-24

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md`

```text
Goal: Continue Spark control-proof work from the 2026-06-24 audit. Make authority, execution, trace joins, Telegram replies, media, and proof durable and inspectable. Work step by step. Do not "save the day" with one-off patches; prefer long-term contracts, repeatable proof, focused tests, docs, and live confirmation.

Priority rule:
First reduce proof gaps and trace-join gaps. Do not expand UI, media support, or new features unless they directly close a measured control-proof gap.

Baseline:
- Latest fresh-strict audit has no missing evidence, trace joins, proof capsules, raw refs, raw id keys, reason-code leaks, or stack-like leaks. Remaining gaps are visible historical `proof_gap` rows only; full SparkRecursive_bot live canary confirmation is captured in `outputs/live-canary-full/live-canary-summary.md`.
- `/proof`, proof panels, canary pack, NL Harness map, streaming/rich helpers, media envelopes, and non-execution evidence classification exist.
- Keep NL suites as fast breadth/drift coverage; `nl:live` is not release proof.

Operating rules:
- Harness Core is authority. Tracing proves what happened; tracing never grants permission.
- Raw words, memory, pending state, route history, provider output, and mission ids are evidence only. Fresh TurnIntent/Harness decides action.
- Keep deterministic machinery exact underneath and Telegram human on the surface.
- Hide raw ids, paths, stacks, provider internals, prompts, tokens, memory/media bodies, and reason codes from normal chat.
- Treat robotic replies, missing trace joins, stale proof, and action without proof as product bugs.
- Add failing proof before fixes when useful. Keep changes narrow, commit often, and test before live claims.
- Do not push/open PRs until local proof is clean and the user confirms live Telegram behavior, unless asked for a draft.

Step 1: Reduce measured gaps
- Run `npm run control:proof:audit -- --sample 100 --fresh-strict`.
- Fix current or latest-row gaps before adding surfaces. Do not hide historical gaps; make them inspectable.
- Keep non-execution memory/voice/media evidence separate from execution proof.

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

Release gate:
- Focused tests for changed routes; `npm run build`; full npm test for broad routing/surface changes.
- `spark live status`, `spark providers test --role chat`, `npm run sync:check`, `spark os compile --json`, and fresh-strict audit after runtime changes.
- User live confirmation before PR/publish claims.
```
