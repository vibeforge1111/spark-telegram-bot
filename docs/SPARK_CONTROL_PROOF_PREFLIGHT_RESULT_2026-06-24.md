# Spark Control Proof Preflight Result

Date: 2026-06-24
Status: read-only audit captured

## Scope

This packet captures the baseline before running the control-proof goal prompt. No repairs were made during the audit. The goal is to start implementation from durable gap classes, not one-off rescue patches.

## Runtime

- Spark Live: OK. Spark Live is ready.
- Telegram profiles: OK. `primary` is running on 8789 and `sparkqa-bot` is running on 8791.
- Provider: OK. Chat routes to Codex `gpt-5.5` and provider ping returned `PING_OK`.
- Deep verify: OK. Telegram starter bundle, module health, LLM roles, secret surface, Builder memory bridge, Spawner mission relay, and supervised runtime processes passed.

## Harness

- `spark os compile --json`: OK, generated 2026-06-24.
- Modules: 10.
- Repos: 11.
- Gaps: 0.
- Builder event rows: 27,741.
- Builder trace groups: 12.
- Builder trace health flags: `missing_trace_refs`, `open_high_severity_events`.
- Memory movement: supported, 5,008 rows.
- Dirty repo count: 0.
- Blocked release count: 6.
- Duplicate truth count: 2.
- Critical duplicate truth count: 1.
- Voice surface mode: disabled.
- Voice surface blockers: 2.

Harness compile conclusion: authority coverage exists, but the trace/voice/duplicate-truth gaps are real preflight blockers for calling the cockpit recorder complete.

## Trace Continuity

Last-100-row summary where available:

| Plane | Request ids | Trace refs | Main gaps |
| --- | ---: | ---: | --- |
| Telegram final-answer audit | 100/100 | 100/100 | 19 rows contain path-like refs. |
| Telegram outbound audit | 7/100 | 7/100 | 93 rows lack request id and trace ref. |
| Telegram route-confidence audit | 0/100 | 100/100 | Missing request ids by design or bug; needs classification. |
| Builder gateway trace | 100/100 | 100/100 | 100 rows contain raw id keys, 80 contain path-like refs, 5 contain policy reason-code text. |
| Spawner PRD trace | 100/100 | 100/100 | 27 rows contain path-like refs. |
| System trace index | present | present | Contains path-like refs and policy reason-code text. |
| Memory movement index | missing | missing | Index is visible but not joined by request id or trace ref. |
| Voice surface view | missing | missing | Voice readiness exists, but trace continuity is not joined. |
| Voice runtime state | missing | missing | Runtime state exists, but trace continuity is not joined. |

Trace conclusion: final-answer audit is the strongest joined Telegram surface. Outbound audit, memory, and voice are not yet joined enough for end-to-end proof. Builder and Spawner are joined but still carry raw-ish fields that should be redacted before user-facing proof panels.

Repeatable command added after this audit:

```bash
npm run control:proof:audit
npm run control:proof:audit -- --json
```

Current command summary:

- Missing evidence files: 0.
- Missing trace joins: 5 planes.
- Missing proof capsules: 9 planes.
- Raw ref leaks: 5 planes.
- Robotic failure reason-code presence: 2 planes.
- Stack-like leaks: 0 planes.

The command confirms the next major structural gap: proof capsule coverage is currently absent from all sampled planes.

## Surface

- Raw policy reason leaks were not found in the last 100 final-answer audit rows.
- Builder gateway trace still contains policy reason-code text in 5/100 recent rows. That can remain internal but must not leak to ordinary Telegram replies.
- Spawner logs show normal dev-server reloads and readiness, plus old 404s for missing routes. No immediate Telegram-facing failure was found from logs alone.
- SparkRecursive_bot logs show polling active after the latest restart.

Surface conclusion: the biggest current surface risk is not final-answer copy in the last 100 rows; it is raw/internal data still available in lower-level trace surfaces that could leak into future proof panels if not normalized first.

## Media

- Text: healthy.
- Voice/audio: runtime and system-map visibility exist, but shared trace continuity is missing.
- Photo/image: still a planned gap class from earlier Telegram normalization behavior. Needs typed media envelope fixtures before claiming support.
- Document/file: no support claim should be made until typed media envelopes and access boundaries exist.

## Documentation

Docs are now organized around:

- `SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`
- `SPARK_CONTROL_PROOF_PREFLIGHT_AUDIT_2026-06-24.md`
- `SPARK_CONTROL_PROOF_PLAN_2026-06-24.md`
- `SPARK_CONTROL_PROOF_GOAL_PROMPT_2026-06-24.md`

Docs drift scan found mostly intentional new-rule references. One older handoff still says current-state memory is authoritative over wiki/old conversation for mutable facts. That should be marked as historical wording and updated to the new phrasing: memory is evidence, fresh runtime state wins for mutable facts, and Harness Core decides action.

## Gap Register

- `missing_trace_join`: Telegram outbound audit has only 7/100 request ids and trace refs.
  - Durable slice: make outbound audit inherit trace context from final reply/action context, with tests for direct replies and routed replies.

- `raw_ref_leak`: Telegram final-answer audit, Builder gateway trace, Spawner PRD trace, system trace index, and memory movement index contain path-like refs.
  - Durable slice: introduce one redacted trace-ref formatter for user-facing proof surfaces, then migrate proof-panel rendering through it.

- `raw_ref_leak`: Builder gateway trace contains raw id keys in 100/100 sampled rows.
  - Durable slice: distinguish internal trace storage from user-facing proof projection. Keep internal rows if needed, but proof panel must consume a redacted projection.

- `robotic_failure_reply`: Builder gateway trace contains policy reason-code text in 5/100 sampled rows.
  - Durable slice: add a copy map from internal reason classes to natural Telegram failure replies and tests that ordinary replies never show raw reason codes.

- `missing_trace_join`: memory movement and voice runtime surfaces do not carry request id or trace ref.
  - Durable slice: add optional shared trace refs to memory/voice events without storing raw memory evidence or raw audio in proof capsules.

- `runtime_capability_drift`: `spark os compile` reports one critical duplicate-truth issue and two duplicate truths from runtime ahead of registry pin.
  - Durable slice: audit registry pins versus running module versions before claiming release readiness.

- `media_payload_gap`: photo/image and document/file routes are not proven through typed media envelopes.
  - Durable slice: add media envelope fixtures and normalization before live media claims.

- `stale_doc_rule`: one old handoff still uses "memory authoritative" wording.
  - Durable slice: add a historical note pointing to the control-proof docs index and current Harness wording.

## First Slice Completed

The first durable slice is now in progress/completed at minimum viable level: a repeatable trace-continuity audit command/report exists.

It reports request id coverage, trace ref coverage, proof capsule coverage, raw ref leaks, raw id-key rows, policy reason-code rows, stack-like leaks, and missing evidence files without printing raw trace rows in the default human report.

## Recommended Next Slice

Add the Harness proof capsule schema and fixtures.

Reason: the new audit command reports `missingProofCapsule` for every sampled plane. Before building a proof panel, Spark needs a stable redacted capsule shape and fixtures for allowed, blocked, downgraded, no-action, and missing-proof cases.

## Gate To Start Goal Prompt

- Audit packet exists: yes.
- Branch and dirty state known: yes, branch is `release/stability-2026-06-02-turnintent-harness`, ahead 8 and behind 121 before this audit result commit.
- Runtime health checked: yes.
- Docs index, preflight audit, plan, and goal prompt point to each other: yes.
- First implementation slice chosen: yes, trace-continuity audit command/report.
- First implementation slice started: yes, minimum viable command/report added.
- Next implementation slice chosen: yes, Harness proof capsule schema and fixtures.
