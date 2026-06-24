# Spark Control Proof Goal Prompt

Date: 2026-06-24
Status: renewed execution prompt after preflight, trace audit, and proof-capsule schema

Use after:

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md`

```text
Goal: Continue Spark control-proof implementation from the 2026-06-24 preflight. Make authority, execution, trace joins, Telegram replies, media, and proof durable and inspectable. Work step by step. Do not "save the day" with one-off patches. Prefer long-term contracts, repeatable proof, focused tests, and live confirmation.

Known completed groundwork:
- Docs index, preflight audit, plan, trace-audit command, and `spark.harness_proof.v1` schema/tests exist.
- Current audit gaps: missing trace joins 5, missing proof capsules 9, raw-ref leaks 5, robotic reason-code surfaces 2, missing evidence 0, stack-like leaks 0.

Operating rules:
- Harness Core is authority. Tracing proves what happened; tracing never grants permission.
- Raw words, memory, pending state, route history, provider names, and mission ids are evidence only. Fresh TurnIntent/Harness decides action.
- Keep deterministic machinery exact underneath and Telegram human on the surface.
- Hide raw ids, local paths, stack traces, provider internals, prompts, tokens, and reason codes from normal chat.
- Treat robotic replies, missing trace joins, and action without proof as product bugs.
- Add failing proof before fixes when possible. Keep changes narrow, commit often, and run the relevant test ladder before live claims.
- Do not push/open PRs until local proof is clean and the user confirms live Telegram behavior, unless asked for a draft.

Step 1: Wire proof capsules into live audit rows
- Start at the Telegram final-answer/action boundary. Attach a redacted Harness proof capsule or stable proof ref to rows that can lead to user-visible action.
- Keep internal trace storage if needed, but proof projections must consume redacted metadata.
- Test that action-capable turns emit proof metadata and no-action turns cannot masquerade as approved execution.
- Re-run `npm run control:proof:audit`; reduce missing proof coverage from the current baseline without hiding gaps.

Step 2: Trace continuity repair
- Make Telegram outbound audit inherit request id and trace ref from final reply/action context.
- Classify route-confidence missing request ids as design or bug, then fix/document it.
- Add optional shared trace refs to memory and voice events without storing raw memory evidence or raw audio in proof capsules.

Step 3: Redacted proof projection and panel
- Build a compact Harness Proof projection from one trace/proof ref.
- Show intent, authority, Governor, execution status, reply delivered, trace joins, and gaps.
- Keep it inspect-only. Ordinary Telegram replies stay conversational and only use cards for dense status/raw details.

Step 4: Telegram surface repair
- Replace policy-shaped failures with human replies. Example: "Memory diagnostics did not run from that turn. Ask directly and I will check the trace."
- Separate access level from runtime capability.
- Collapse repeated fallback loops into one useful recovery line.
- Test that ordinary replies do not expose raw reason codes, Mission/Provider/Move headings, local paths, or stack traces.

Step 5: Non-text input path
- Add typed media envelopes for photo, captioned photo, document, voice, audio, and unsupported media.
- Route media as evidence-only unless fresh Harness authority allows a stronger action.
- Ensure image/photo turns no longer fail as unsupported payloads before claiming support.

Step 6: Live canary suite
- Create a 20-30 prompt live pack for SparkRecursive_bot covering no-action, build, mission, memory, access, web/research, model switch, media, streaming, and proof inspection.
- Record expected route, observed reply, side effects, proof join, pass/fail, and screenshot/user confirmation when needed.

Release gate:
- Focused tests for each route changed.
- `npm run build` and relevant npm tests for Telegram changes; full npm test for broad routing/surface changes.
- `spark live status` and `spark providers test --role chat` after runtime changes.
- User live confirmation before PR/publish claims.
```
