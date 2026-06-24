# Spark Control Proof Goal Prompt

Date: 2026-06-24
Status: renewed execution prompt after preflight, proof-panel work, and streaming fix

Use after:

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md`

```text
Goal: Continue Spark control-proof and Telegram usability work from the 2026-06-24 preflight. Make streaming, rich messages, authority, execution, trace joins, media, and proof durable, inspectable, and pleasant for future Spark users. Work step by step. Do not "save the day" with one-off patches. Prefer long-term contracts, repeatable proof, focused tests, and live confirmation.

Known completed baseline:
- Docs index, preflight audit, plan, trace-audit command, `spark.harness_proof.v1`, outbound trace inheritance, panel CLI, Telegram `/proof`, Spawner PRD proof-ref persistence, and Builder gateway proof-ref preservation exist.
- Streaming itself works and the double-preview bug is fixed. Rich messages and streaming should become Spark's default posture only through audited config/runtime paths, tests, and live SparkRecursive_bot proof.
- Current gaps are mostly proof visibility and historical evidence shape: Telegram-to-Builder proof-ref producers, fresh Spawner/Builder canary rows, memory/voice request+trace+proof, outbound coverage, raw-ref risk, and robotic reason-code surfaces.

Operating rules:
- Harness Core is authority. Tracing proves what happened; tracing never grants permission.
- Raw words, memory, pending state, route history, provider names, and mission ids are evidence only. Fresh TurnIntent/Harness decides action.
- Keep deterministic machinery exact underneath and Telegram human on the surface.
- Hide raw ids, local paths, stack traces, provider internals, prompts, tokens, and reason codes from normal chat.
- Treat robotic replies, missing trace joins, and action without proof as product bugs.
- Add failing proof before fixes when possible. Keep changes narrow, commit often, and run the relevant test ladder before live claims.
- Do not push/open PRs until local proof is clean and the user confirms live Telegram behavior, unless asked for a draft.

Step 1: Proof panel evidence joins
- Extend `/proof` and the panel CLI with redacted evidence-plane joins for Telegram, Builder, and Spawner.
- Show joined/missing proof coverage without raw ids, paths, prompts, stack traces, provider internals, or reason codes.
- Test future rows with proof refs and historical rows without them so the panel is honest. Builder gateway now preserves valid `turn:sha256:<16 hex>` proof refs when Telegram supplies them; the remaining work is making the right Telegram producer paths supply those refs and proving them live.

Step 2: Streaming and rich-message defaults
- Audit the exact config/runtime path used by SparkRecursive_bot, not just helper commands that claim the flags are on.
- Make streaming and rich messages default through a durable source of truth, with migration/fallback behavior documented.
- Test the top-level Telegram path for streamed edits, final message collapse, rich formatting, and no duplicate previews.

Step 3: Telegram surface repair
- Keep normal replies warm and short; use compact cards only for `/status`, `/diagnose`, `/proof`, raw details, and dense multi-system summaries.
- Replace policy-shaped failures with helpful human replies.
- Test that ordinary replies do not expose raw reason codes, Mission/Provider/Move headings, local paths, or stack traces.

Step 4: Media and richer composition
- Add typed envelopes for photo, captioned photo, document, voice, audio, and unsupported media.
- Route media as evidence-only unless fresh Harness authority allows action.
- Ensure images/photos and richer Telegram compositions are represented cleanly before claiming support.

Step 5: Live canary suite
- Create a 20-30 prompt live pack for SparkRecursive_bot covering no-action, build, mission, memory, access, web/research, model switch, media, streaming, rich messages, and proof inspection.
- Record expected route, observed reply, side effects, proof join, pass/fail, and screenshot/user confirmation where useful.

Release gate:
- Focused tests for each route changed.
- `npm run build` and relevant npm tests for Telegram changes; full npm test for broad routing/surface changes.
- `spark live status` and `spark providers test --role chat` after runtime changes.
- User live confirmation before PR/publish claims.
```
