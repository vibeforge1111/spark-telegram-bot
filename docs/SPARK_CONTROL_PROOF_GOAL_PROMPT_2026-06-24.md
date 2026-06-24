# Spark Control Proof Goal Prompt

Date: 2026-06-24
Status: renewed execution prompt after preflight, proof-panel work, and streaming fix

Use after:

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md`

```text
Goal: Continue Spark control-proof and Telegram usability from the 2026-06-24 audit. Make authority, proof, streaming/rich messages, media, and conversational surface durable. Work step by step. Do not "save the day" with one-off patches; prefer contracts, repeatable proof, focused tests, docs, and live confirmation.

Current baseline:
- Spark Live is healthy: primary Telegram, sparkqa-bot, Spawner, Harness Core, provider ping, and runtime sync are OK.
- Docs, proof panel CLI, Telegram `/proof`, audit, proof capsule schema, canary pack, NL Harness map, and streaming/rich helpers exist.
- Repairs landed for Spawner PRD, Builder gateway, route-confidence legacy gaps, and Telegram outbound proof gap capsules.
- Latest sampled audit has no missing evidence, trace joins, raw refs, raw id keys, reason-code leaks, or stack-like leaks. Remaining gaps are visible legacy `proof_gap` rows plus live canary confirmation.
- Streaming works and the double-preview bug is fixed; SparkRecursive_bot still needs live proof for collapse, rich rendering, and proof joins.
- Old NL suite decision: keep it as fast breadth/drift coverage. Use `nl:harness-map` before promotion. Promote representative prompts into `control:proof:canaries`; `nl:live` is not release proof.

Operating rules:
- Harness Core is authority. Tracing proves what happened; tracing never grants permission.
- Raw words, memory, pending state, route history, provider output, and mission ids are evidence only; fresh TurnIntent/Harness decides action.
- Keep deterministic machinery exact underneath and Telegram human on the surface. Hide raw ids, paths, stack traces, provider internals, prompts, tokens, and reason codes.
- Treat robotic replies, missing trace joins, and action without proof as product bugs.
- Add failing proof before fixes when useful. Keep changes narrow, commit often, and test before live claims.
- Do not push/open PRs until local proof is clean and the user confirms live Telegram behavior, unless asked for a draft.

Step 1: Live canary proof
- Run or ask the user to run the safe SparkRecursive_bot canaries first: `cp-builder-001`, `cp-proof-001`, `cp-streaming-001`, and `cp-streaming-002`.
- Capture observed reply, side effects, proof join, screenshot/user confirmation, and verdict. Exclude intentional-action cases by default.
- After canaries, verify fresh rows with `control:proof:audit` plus `/proof` or `control:proof:panel`.

Step 2: Streaming and rich-message defaults
- Audit the exact SparkRecursive_bot config/runtime path, not only helper commands.
- Keep streaming and rich messages default through durable config plus migration/fallback docs.
- Test streamed edits, final message collapse, rich formatting, and no duplicate previews in the top-level Telegram path.

Step 3: Human Telegram surface
- Keep normal replies warm and short; use compact cards only for `/status`, `/diagnose`, `/proof`, raw details, and dense multi-system summaries.
- Replace policy-shaped failures with helpful human replies. Test that ordinary replies do not expose raw reason codes, Mission/Provider/Move headings, paths, or stack traces.

Step 4: Media and richer composition
- Extend typed envelopes for photo, captioned photo, document, voice, audio, and unsupported media.
- Route media as evidence-only unless fresh Harness authority allows action.
- Prove images/photos and richer Telegram compositions live before claiming support.

Step 5: Docs and suite maintenance
- Update docs in the same commit or an adjacent commit for each slice.
- Keep old NL catalogs broad and fast; keep canaries Harness-shaped with authority, mutation class, proof join, side effect, reply shape, and visual/user-confirmation fields.

Release gate:
- Focused tests for changed routes; `npm run build`; full npm test for broad routing/surface changes.
- `spark live status`, `spark providers test --role chat`, and `npm run sync:check` after runtime changes.
- User live confirmation before PR/publish claims.
```
