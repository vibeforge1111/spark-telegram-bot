# Spark Control Proof Goal Prompt

Date: 2026-06-24
Status: reusable execution prompt

Use after:

- `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `docs/SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md`

```text
Goal: Turn Spark's R28 authority hardening into durable, inspectable control proof across Telegram, Harness Core, Builder, Spawner, providers, memory, voice, and media inputs. Work step by step. Do not "save the day" with one-off patches. Prefer long-term fixes, clear contracts, traceable proof, focused tests, and live confirmation.

Operating rules:
- Harness Core is authority. Tracing proves what happened; tracing never grants permission.
- Raw words, memory, pending state, route history, provider names, and mission ids are evidence only. Fresh TurnIntent/Harness authority decides action.
- Keep deterministic machinery exact underneath and Telegram human on the surface.
- Hide raw ids, local paths, stack traces, provider internals, prompts, tokens, and reason-code dumps from normal chat.
- Treat robotic replies, missing trace joins, and action without proof as product bugs.
- Add failing proof before fixes when possible. Keep changes narrow, commit often, and run the relevant test ladder before live claims.

Step 1: Baseline audit
- Run current health/proof checks for Spark Live, providers, Telegram profiles, Harness coverage, trace files, final-answer audit, Builder bridge, Spawner dispatch, memory movement, voice status, and media normalization.
- Record gaps as durable classes: action_without_proof, missing_trace_join, raw_ref_leak, robotic_failure_reply, runtime_capability_drift, media_payload_gap.
- Do not repair during audit except for tiny blockers needed to complete the audit.

Step 2: Harness proof capsule
- Define spark.harness_proof.v1 with redacted turn ref, route, owner, intent, authority decision, contract, risk tier, Governor result, execution status, reply shape, and per-plane join status.
- Add fixtures for allowed, blocked, downgraded, no-action, and missing-proof cases.
- Make high-agency action without a proof capsule a release blocker.

Step 3: Trace continuity audit
- Build a repeatable audit command/report that checks Telegram -> Builder -> Spawner -> provider -> memory/voice -> final answer joins.
- Report request id coverage, trace ref coverage, proof capsule coverage, raw path/id leaks, and unjoined execution spans.
- Normalize user-facing trace refs into redacted metadata refs.

Step 4: Proof panel
- Render a compact Harness Proof panel from one trace ref, starting with Spawner trace or a local proof command.
- Show intent, authority, Governor, execution, reply delivered, trace joins, and gaps.
- Keep it inspect-only; ordinary Telegram replies stay conversational.

Step 5: Telegram surface repair
- Replace policy-shaped replies with human versions. Example: "Memory diagnostics did not run from that turn. Ask directly and I will check the trace."
- Separate access level from runtime capability.
- Collapse repeated fallback loops into one useful recovery line.
- Add tests that normal replies do not expose raw reason codes, standalone Mission/Provider/Move headings, local paths, or stack traces.

Step 6: Non-text input path
- Add typed media envelopes for photo, captioned photo, document, voice, audio, and unsupported media.
- Route media as evidence-only unless fresh Harness authority allows a stronger action.
- Ensure image/photo turns no longer fail as unsupported message payloads.

Step 7: Live canary suite
- Create a 20-30 prompt live pack for SparkRecursive_bot covering no-action, build, mission, go, memory, access, web/research, model switch, media, streaming, and proof inspection.
- Each canary records expected route, observed reply, side effects, proof join, pass/fail, and screenshot/user confirmation when needed.

Release gate:
- Focused tests for each route changed.
- npm run build and relevant npm tests for Telegram changes; full npm test for broad routing/surface changes.
- spark live status and spark providers test --role chat after runtime changes.
- User live confirmation before PR/publish claims.
```
