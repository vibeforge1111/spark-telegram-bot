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

The panel source now also reports redacted evidence-plane joins and audit health. Current historical Builder/Spawner rows without a proof ref stay marked missing. Future Spawner PRD rows now carry `harnessProofRef` from Telegram build dispatch; future text/image/voice Builder gateway rows now carry and preserve a valid `harnessProofRef`. If a requested proof ref appears only in a trace row and no capsule is available yet, the panel now says `Status: proof capsule missing` while showing the joined evidence plane. The audit section shows `Audit blocking` and `Blocking gap planes`; clean panels say `none`, while dirty panels name the affected evidence planes by blocking gap class without exposing raw request ids, local paths, or reason codes.

Update after continuity repairs:

- Spawner PRD trace, Builder gateway trace, route-confidence, and turn-bound outbound delivery rows now use explicit legacy gap capsules for historical rows that cannot be joined to fresh Harness authority.
- Telegram outbound delivery-local rows remain `not_execution_proof`; synthetic request/trace refs for those rows must not be promoted into execution proof gaps.
- Latest sampled audit now reports no missing trace joins and no raw ref/reason-code leaks. Remaining proof gaps are visible `proof_gap` rows, not silent missing metadata.
- The audit now reports true missing proof capsules separately from legacy proof gaps. A `legacy proof gaps` count means the historical gap is deliberately visible; it does not mean the capsule is silently absent.
- Audit plane summaries now include `gap_capsule`, `gap_capsule_valid`, `gap_ref`, and `gap_backing`. Historical gap rows are release-inspectable only when `gap_backing complete` proves every sampled gap row carries a redacted proof ref and a valid downgraded proof capsule, while still keeping the rows classified as legacy gaps rather than fresh Harness authority.
- Use `npm run control:proof:audit -- --sample 100 --fresh-strict` for the current release gate. It allows explicit historical legacy proof-gap capsules to remain visible, but fails silent missing proof/control evidence, leaks, or any latest producer row that still carries a proof-gap marker.

Update after full live canary refresh:

- `outputs/live-canary-full/live-canary-summary.md` is now the current live release packet for SparkRecursive_bot control-proof canaries.
- The full pack has 28/28 passing cases with required captures present, including streaming, rich-message rendering, photo, captioned photo, audio file, real voice-note boundary proof, and the current publish/registry handoff canary.
- The canary packet separates live behavior readiness from publish readiness. `Release gate: ready` can coexist with `Publish gate: not ready` when registry pin drift or duplicate-truth handoffs remain open.
- Fresh-strict audit remains the current latest-row proof gate: missing evidence, missing trace joins, missing proof capsules, incomplete legacy gap backing, latest proof gaps, raw refs, raw id keys, reason-code leaks, and stack-like leaks must stay at zero.
- Remaining `legacy proof gaps` are historical and visible in route-confidence, Builder gateway, and Spawner trace planes. They must remain inspectable; do not erase or relabel them as green execution proof.
- The earlier baseline notes about pending inbound Builder/Spawner/media/voice proof are superseded by the full live canary packet. Keep those notes as historical sequence, but use `outputs/live-canary-full/live-canary-summary.md` plus fresh-strict audit as the current proof state.

Update after default-runner proof refresh on 2026-06-25 00:27 +04:

- Commit `82c8021` brought the remaining stable drift/proof suites into the default `npm test` runner. A filesystem check now reports all `tests/*.test.ts` files listed in `scripts/run-tests.cjs`.
- The added default coverage includes conversation frame compaction, natural-language capability separation, shipped-project context, shipped-project polish routing, Spawner loop bug-hunt coverage, capability garden rendering, chip creation parsing, and X token boundary checks.
- The shipped-project polish route now has a matching firewall authorization for explicit "polish pass" wording, so visible-project iteration does not fall through to plain chat when the request is build-adjacent but refers to the current shipped artifact.
- Shipped-project context extraction again accepts markdown file links as response-derived evidence, alongside JSON project paths and preview URLs.
- Verification for this slice passed: `npm test`, `npm run build`, `npm run control:proof:audit -- --sample 100 --fresh-strict`, full live-canary release check against `outputs/live-canary-full/live-canary-observations.json`, `npm run sync:check`, `spark live status`, `spark providers test --role chat`, `git diff --check`, and `spark os compile --json`.
- Post-commit `spark os compile --json` reported `ok: true`, `gaps: 0`, and `dirty_repo_count: 0`. The remaining compiler gate issue is the known duplicate-truth registry drift, not an uncommitted local repo state.
- The release rule is unchanged: the live canary packet is usable evidence, but PR/publish claims still require user confirmation of the intended live Telegram behavior.
- The live canary bundle now includes a real machine-readable `outputs/live-canary-full/live-canary-summary.json` generated from the same summary and coverage logic as `--release-check`; future record-case commands in the run guide refresh both markdown and JSON summaries.

Update after embedded runtime-evidence timestamp gate on 2026-06-25 11:36 +04:

- Commit `948bb7e` made canary release validation join freshness into the embedded command transcripts, not just the packet wrapper. `spark os compile --json` must include `generated_at` or `generatedAt`, and the fresh-strict audit transcript must include its `Generated:` line; both command timestamps must be close to `evidence.collectedAt`.
- Verification for this slice passed: focused canary-pack tests, `npm run build`, `npm run control:proof:audit -- --sample 100 --fresh-strict`, full live-canary release check, and `git diff --check`.

Update after Telegram profile-env startup proof on 2026-06-25 11:58 +04:

- Commit `ca128ac` loads the active Spark Telegram profile env in the main bot runtime before `.env.override`, with existing process env keys preserved. This makes `/streaming` profile persistence durable across bot restarts instead of only proven in helper commands.
- Commit `a8f18d1` refreshed the full SparkRecursive_bot canary runtime evidence from a clean tree. The current packet reports runtime evidence collected at `2026-06-25T07:58:51.790Z`, release gate ready, and publish gate not ready because registry pin drift remains open.
- Verification for this slice passed: focused profile/streaming/recursive tests, `npm run build`, full `npm test`, `npm run sync:check`, fresh-strict audit, full canary release check, `spark providers test --role chat`, and a retry of `spark live status`.
- The first `spark live status` check hit a transient Telegram token-check `ECONNRESET`; the immediate retry reported `Spark Live is ready`, with two Telegram profiles running, Spawner UI healthy, and `spark-telegram-bot` polling active on the primary profile.
- The remaining release caveat is unchanged: live behavior can be release-ready while publish remains blocked until the `spark-telegram-bot` and `spawner-ui` registry pin drift handoffs are resolved.
- Post-commit `spark os compile --json` still reports `ok: true`, `gaps: 0`, and `dirty_repo_count: 0`; publish remains blocked by the known runtime-ahead registry pins, not by local proof gaps.

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

Docs drift scan found mostly intentional new-rule references. The older handoff that said current-state memory is authoritative over wiki/old conversation for mutable facts now carries a current control-proof note: memory is evidence, fresh runtime state wins for mutable facts, and Harness Core decides action.

## Gap Register

- `legacy_proof_gap`: historical route-confidence, Builder gateway, and Spawner trace rows remain visible as explicit legacy proof-gap capsules.
  - Durable slice: keep these inspectable in audit and proof panels; do not relabel them as fresh authority or hide them from release packets.

- `release_packet_integrity`: live canary packets must carry current, complete runtime evidence.
  - Durable slice: release packets now reject stale runtime evidence, stale embedded compile/audit command timestamps, truncated control-proof audit bodies, non-clean blocking status, latest proof gaps, raw ref/id/reason/parse markers, and hidden legacy-gap planes.

- `media_payload_gap`: photo, captioned photo, audio-file, and real voice-note boundaries are live-proven as evidence-only routes.
  - Durable slice: keep richer document handling beyond metadata separate from the proven media boundary claims; do not promote document bodies or raw media into proof capsules.

- `non_execution_evidence`: memory movement, voice surface, and voice runtime evidence stay explicitly separated from execution proof.
  - Durable slice: keep these planes joined/redacted where useful, but continue marking them `not_execution_proof` or non-execution so they cannot authorize actions.

- `runtime_capability_drift`: `spark os compile` reports one critical duplicate-truth issue and two duplicate truths from runtime ahead of registry pin.
  - Current evidence from `spark os compile --json`: compiler `ok: true`, gaps `0`, duplicate truth count `2`, critical duplicate truth count `1`.
  - The critical item is `spark-telegram-bot-runtime-registry-pin-drift`: installed Telegram runtime source is clean on `harness-discipline-line-count-gate` at `9431dbfb1015`; the public registry pin remains `e5a1bd040986`, and no remote release branch head is published for that installed head yet.
  - The warning item is `spawner-ui-runtime-registry-pin-drift`: installed Spawner runtime source is clean on `release/stability-2026-06-02-spawner-authority` at `56671b10cd7b`; the public registry pin remains `19b7d0bff144`, and the remote branch head is `fdb8fded4744`.
  - Durable slice: do not claim registry/release readiness until owner repo commits are ported/pushed and registry or release metadata is updated, or the installed runtime is explicitly classified as a local runtime test artifact.

- `builder_trace_health`: `spark os compile --json` still reports Builder trace health flags `missing_trace_refs` and `historical_open_high_severity_events`, even while the Telegram control-proof audit has no latest-row gaps.
  - Current evidence from `spark os compile --json`: Builder event rows are present, current high-severity rows are no longer reported as open in the 1h/24h windows, and the remaining high-severity flag is explicitly historical.
  - Durable slice: keep this as a source-owned Builder repair card. Do not hide it in Telegram docs, do not treat it as SparkRecursive_bot release proof failure, and do not patch around it from Telegram unless a fresh trace shows Telegram is the producer.
  - 2026-06-25 Builder update: local Builder commit `4ce0b8e` threads request-scoped `trace:source-ledger:<request>` refs into future `source_used` rows when no explicit trace is supplied, and fixes import-cycle blockers that prevented focused source-ledger tests from running. Existing Builder trace-health flags remain visible until older event rows age out or are explicitly repaired by the Builder owner.
  - 2026-06-25 live smoke: writing one metadata-only `source_used` row through the Builder CLI against `/Users/alchemistab/.spark/state/spark-intelligence` produced `trace:source-ledger:req-control-proof-source-ledger-smoke-builder-home`. The next `spark os compile --json` saw Builder event rows increase to 33409, and the `source_used` repair card moved to `latest_clean_historical_window_debt`; remaining flags are historical aggregate debt, not a current `source_used` producer failure.
  - 2026-06-25 Spark CLI update: local CLI commit `9d450ab` separates current high-severity trace events from stale lifecycle debt. `spark os compile --json` now reports `historical_open_high_severity_events` when old high/critical rows exist but the 1h/24h windows have no current high-open rows, instead of presenting that backlog as active `open_high_severity_events`.

- `default_suite_gap`: all stable current `tests/*.test.ts` files are now in the default `npm test` runner.
  - Durable slice: keep new proof, routing, Telegram surface, media, streaming, and drift suites in `scripts/run-tests.cjs` unless they require live credentials or intentional live action. Optional/live suites must state why they are excluded.

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
