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
| Telegram route-confidence audit | 100/100 | 100/100 | Uses redacted `request_ref` by design; proof capsules are wired for new rows, historical sampled rows still lack proof. |
| Builder gateway trace | 100/100 | 100/100 | 100 rows contain raw id keys, 80 contain path-like refs, 5 contain policy reason-code text. |
| Spawner PRD trace | 100/100 | 100/100 | 27 rows contain path-like refs. |
| System trace index | present | present | Contains path-like refs and policy reason-code text. |
| Memory movement index | missing | missing | Original preflight finding: index was visible but not joined by request id or trace ref. Current state: joined by redacted request/trace refs and marked `not_execution_proof`. |
| Voice surface view | missing | missing | Voice readiness exists, but trace continuity is not joined. |
| Voice runtime state | missing | missing | Runtime state exists, but trace continuity is not joined. |

Trace conclusion: final-answer audit is the strongest joined Telegram surface. Outbound audit, memory, and voice were not yet joined enough for end-to-end proof at original preflight time. Memory movement now has redacted request/trace continuity as observability-only proof. Builder and Spawner are joined but still carry raw-ish fields that should be redacted before user-facing proof panels.

Repeatable command added after this audit:

```bash
npm run control:proof:audit
npm run control:proof:audit -- --json
```

Current command summary after the first Telegram proof wire-in:

- Missing evidence files: 0.
- Missing trace joins: 4 planes.
- Missing proof capsules: 9 planes.
- Raw ref leaks: 5 planes.
- Robotic failure reason-code presence: 2 planes.
- Stack-like leaks: 0 planes.

The latest sampled Telegram final-answer plane now reports `proof 80/100`, up from `0/100` before the wire-in. Route-confidence request coverage is now classified as redacted-design coverage via `request_ref`. Source now attaches turn-level trace context to ordinary outbound text replies, and outbound rows without a turn/action context now receive delivery-local redacted `request_ref`/`trace_ref` metadata instead of raw ids or message text. The historical live outbound sample still shows low coverage until the running bot writes new rows from this code. Spawner PRD trace source now accepts and persists redacted `harnessProofRef` for future rows; historical Spawner rows still show `proof 0/100` until a new PRD build flows through the updated code. Builder gateway source now preserves valid redacted `harnessProofRef` values when Telegram supplies them, and Telegram source now supplies those refs on text, image, and voice Builder gateway handoffs. A fresh simulated Builder gateway canary row now raises Builder proof coverage to `proof 1/100`; live SparkRecursive_bot confirmation is still required for true inbound Telegram proof. Memory and voice index/runtime planes still need trace/proof coverage. Historical route-confidence rows now have legacy authority-gap proof capsules, so they are inspectable as `proof_gap` rows instead of silently missing proof.

Local proof panel command now exists:

```bash
npm run control:proof:panel
npm run control:proof:panel -- --ref turn:sha256:<hash>
```

It renders the latest or requested redacted Harness proof capsule without printing raw trace rows. Telegram source also has an inspect-only `/proof` command that uses the same panel; live confirmation is still required after deployment/runtime sync.

The panel source now also reports redacted evidence-plane joins. Current historical Builder/Spawner rows without a proof ref stay marked missing. Future Spawner PRD rows now carry `harnessProofRef` from Telegram build dispatch; future text/image/voice Builder gateway rows now carry and preserve a valid `harnessProofRef`. If a requested proof ref appears only in a trace row and no capsule is available yet, the panel now says `Status: proof capsule missing` while showing the joined evidence plane. Joined rows do not expose raw request ids, local paths, or reason codes in the proof panel.

Update after continuity repairs:

- Spawner PRD trace, Builder gateway trace, route-confidence, and turn-bound outbound delivery rows now use explicit legacy gap capsules for historical rows that cannot be joined to fresh Harness authority.
- Telegram outbound delivery-local rows remain `not_execution_proof`; synthetic request/trace refs for those rows must not be promoted into execution proof gaps.
- Latest sampled audit now reports no missing trace joins and no raw ref/reason-code leaks. Remaining proof gaps are visible `proof_gap` rows, not silent missing metadata.
- The audit now reports true missing proof capsules separately from legacy proof gaps. A `legacy proof gaps` count means the historical gap is deliberately visible and inspectable; it does not mean the capsule is silently absent.
- Use `npm run control:proof:audit -- --sample 100 --blocking-strict` for the current blocking gate. It allows explicit legacy proof-gap capsules but fails silent missing proof/control evidence or leaks.

Update after full live canary refresh:

- `outputs/live-canary-full/live-canary-summary.md` is now the current live release packet for SparkRecursive_bot control-proof canaries.
- The full pack has 27/27 passing cases with required captures present, including streaming, rich-message rendering, photo, captioned photo, audio file, and real voice-note boundary proof.
- Fresh-strict audit remains the current latest-row proof gate: missing evidence, missing trace joins, missing proof capsules, latest proof gaps, raw refs, raw id keys, reason-code leaks, and stack-like leaks must stay at zero.
- Remaining `legacy proof gaps` are historical and visible in route-confidence, Builder gateway, and Spawner trace planes. They must remain inspectable; do not erase or relabel them as green execution proof.

## Surface

- Raw policy reason leaks were not found in the last 100 final-answer audit rows.
- Builder gateway trace still contains policy reason-code text in 5/100 recent rows. That can remain internal but must not leak to ordinary Telegram replies.
- Spawner logs show normal dev-server reloads and readiness, plus old 404s for missing routes. No immediate Telegram-facing failure was found from logs alone.
- SparkRecursive_bot logs show polling active after the latest restart.

Surface conclusion: the biggest current surface risk is not final-answer copy in the last 100 rows; it is raw/internal data still available in lower-level trace surfaces that could leak into future proof panels if not normalized first.

## Media

- Text: healthy.
- Voice/audio: audio-file and real voice-note boundaries are live-proven in SparkRecursive_bot as evidence-only media routes, with proof joins and no execution from media content.
- Photo/image: text-only image boundary and captioned-photo evidence handling are live-proven in SparkRecursive_bot; image content remains evidence-only unless fresh Harness authority allows action.
- Document/file: unsupported non-image documents get a human evidence-boundary reply in Telegram, and Builder can normalize document envelopes as safe metadata. Richer document handling beyond metadata still needs separate live proof before support is claimed.

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

- `missing_trace_join`: original preflight found memory movement and voice runtime surfaces did not carry request id or trace ref.
  - Durable slice: memory movement now carries redacted request/trace continuity and stays `not_execution_proof`; voice runtime state carries redacted refs as a non-execution surface. Continue keeping raw memory evidence and raw audio out of proof capsules.

- `runtime_capability_drift`: `spark os compile` reports one critical duplicate-truth issue and two duplicate truths from runtime ahead of registry pin.
  - Durable slice: audit registry pins versus running module versions before claiming release readiness.

- `media_payload_gap`: photo/image and document/file routes are not yet live-proven through typed media envelopes.
  - Durable slice: local Telegram envelope fixtures, Telegram handoff attachment, unsupported-document boundary replies, and Builder gateway acceptance now exist. Remaining work is live SparkRecursive_bot media canary proof and richer document handling beyond metadata.

- `stale_doc_rule`: one old handoff still uses "memory authoritative" wording.
  - Durable slice: add a historical note pointing to the control-proof docs index and current Harness wording.

## First Slice Completed

The first durable slice is now in progress/completed at minimum viable level: a repeatable trace-continuity audit command/report exists.

It reports request id coverage, trace ref coverage, proof capsule coverage, raw ref leaks, raw id-key rows, policy reason-code rows, stack-like leaks, and missing evidence files without printing raw trace rows in the default human report.

## Recommended Next Slice

Generate true inbound SparkRecursive_bot canary evidence for the proof-ref producer rows now wired in source.

Reason: build/run acknowledgements, suppressed Builder final-answer rows, new route-confidence/action rows, default outbound text replies, future Spawner PRD rows, and future text/image/voice Builder gateway rows now carry, inherit, or preserve redacted proof/trace metadata locally. A local proof panel command and inspect-only `/proof` Telegram command exist, and the panel now distinguishes proof-ref joins from missing capsules. The next durable move is to send a fresh SparkRecursive_bot Builder canary and build canary, then live-confirm `/proof`.

## Gate To Start Goal Prompt

- Audit packet exists: yes.
- Branch and dirty state known: yes, branch is `release/stability-2026-06-02-turnintent-harness`, ahead 8 and behind 121 before this audit result commit.
- Runtime health checked: yes.
- Docs index, preflight audit, plan, and goal prompt point to each other: yes.
- First implementation slice chosen: yes, trace-continuity audit command/report.
- First implementation slice started: yes, minimum viable command/report added.
- Second implementation slice started: yes, Harness proof capsule schema and fixtures added.
- Third implementation slice started: yes, Telegram build/run acknowledgements and suppressed Builder final-answer rows now emit proof metadata.
- Fourth implementation slice started: yes, route-confidence `request_ref` is classified as redacted join coverage and new route-confidence/action rows emit proof metadata.
- Fifth implementation slice started: yes, ordinary outbound text replies inherit turn-level request/trace context in source; live audit evidence will update after new runtime rows.
- Sixth implementation slice started: yes, local redacted Harness Proof panel command added.
- Seventh implementation slice started: yes, inspect-only Telegram `/proof` command added in source and tested locally.
- Eighth implementation slice started: yes, local panel projection now reports redacted evidence-plane joins for Telegram, Builder, and Spawner proof refs.
- Ninth implementation slice started: yes, Telegram build dispatch now sends redacted `harnessProofRef` to Spawner PRD bridge, and Spawner PRD trace persists it for future rows.
- Tenth implementation slice started: yes, Builder gateway runtime now preserves valid redacted `harnessProofRef` values from Telegram update metadata in future trace rows and rejects raw-looking refs.
- Eleventh implementation slice started: yes, Telegram text, image, and voice Builder gateway handoffs now carry only the redacted proof ref while Telegram delivery/audit context keeps the matching full capsule.
- Twelfth implementation slice started: yes, local simulated Builder canary wrote a ref-only Builder trace row and the proof panel now reports ref-only evidence joins as `proof capsule missing` instead of hiding the join.
- Next implementation slice chosen: yes, live-confirm Builder/Spawner proof joins in SparkRecursive_bot with fresh inbound canary rows.
