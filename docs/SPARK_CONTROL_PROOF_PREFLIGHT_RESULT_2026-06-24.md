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

Current-state note, 2026-06-25: this section is the original read-only baseline, not the latest release claim. The current evidence is the checked-in canary packet at `outputs/live-canary-full/live-canary-summary.md` and the embedded `spark os compile --json` transcript in `outputs/live-canary-full/live-canary-observations.json`. After the Builder guardrail-denial lifecycle repair and Spark CLI lifecycle-health update, the active compile state is `ok=true`, `gaps=0`, `dirty_repo_count=0`, and Builder trace health reports only `historical_open_high_severity_events`; current 1h trace health is clean with no missing trace refs. Current compile evidence also separates historical high-severity count shape from active breakage: `high_severity_open_count=46`, `unresolved_high_severity_open_count=1`, and `current_unresolved_high_severity_open_count=0`.

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
- Standard checked-in live canary bundles now include machine-readable `live-canary-summary.json` files generated from the same summary and coverage logic as strict/release checks; future record-case commands in the run guides refresh both markdown and JSON summaries. `outputs/live-canary-safe-first` follows the same proof-packet contract as a selected-case gate, while `outputs/live-canary-full` remains the full release packet.

Update after embedded runtime-evidence timestamp gate on 2026-06-25 11:36 +04:

- Commit `948bb7e` made canary release validation join freshness into the embedded command transcripts, not just the packet wrapper. `spark os compile --json` must include `generated_at` or `generatedAt`, and the fresh-strict audit transcript must include its `Generated:` line; both command timestamps must be close to `evidence.collectedAt`.
- Verification for this slice passed: focused canary-pack tests, `npm run build`, `npm run control:proof:audit -- --sample 100 --fresh-strict`, full live-canary release check, and `git diff --check`.

Update after Telegram profile-env startup proof on 2026-06-25 11:58 +04:

- Commit `ca128ac` loads the active Spark Telegram profile env in the main bot runtime before `.env.override`, with existing process env keys preserved. This makes `/streaming` profile persistence durable across bot restarts instead of only proven in helper commands.
- Commit `a8f18d1` refreshed the full SparkRecursive_bot canary runtime evidence from a clean tree. That packet reported runtime evidence collected at `2026-06-25T07:58:51.790Z`, release gate ready, and publish gate not ready because registry pin drift remained open.
- Verification for this slice passed: focused profile/streaming/recursive tests, `npm run build`, full `npm test`, `npm run sync:check`, fresh-strict audit, full canary release check, `spark providers test --role chat`, and a retry of `spark live status`.
- The first `spark live status` check hit a transient Telegram token-check `ECONNRESET`; the immediate retry reported `Spark Live is ready`, with two Telegram profiles running, Spawner UI healthy, and `spark-telegram-bot` polling active on the primary profile.
- The remaining release caveat is unchanged: live behavior can be release-ready while publish remains blocked until the `spark-telegram-bot` and `spawner-ui` registry pin drift handoffs are resolved.

Update after caveat and handoff detail joins on 2026-06-26:

- The live canary JSON summary now treats structured caveat and handoff detail records as release evidence. `releaseCaveatDetails.repo_release_blocks.blocked_release_repos` carries sanitized blocked repo rows, `releaseCaveatDetails.duplicate_truths.owner_sets` carries duplicate-truth owner sets, and each `releaseHandoffDetails` entry carries `familyDetails` joined back to the matching publish-handoff family.
- `summary.cases` now carries safe per-canary Harness metadata: expected route, expected authority, expected mutation class, expected reply shape, optional sanitized source refs, verdict, and missing capture names. It intentionally omits raw prompts, observed replies, proof-panel text, screenshots, and user confirmations.
- `gateDecisionDetails.release` and `gateDecisionDetails.publish` include the same structured detail records, so release-ready versus publish-not-ready can be explained from machine-readable evidence without relying on prose-only caveat or handoff lines.
- The current packet still reports release ready and publish not ready. That means SparkRecursive_bot behavior is proven by the canary pack, while publish remains blocked by explicit repo, local runtime artifact, and historical Builder trace-health handoffs.
- Post-commit `spark os compile --json` still reports `ok: true`, `gaps: 0`, and `dirty_repo_count: 0`; publish remains blocked by the known runtime-ahead registry pins, not by local proof gaps.

Update after reply-shape summary hardening on 2026-06-26:

- Commits through `e56969c` made the checked full and safe-first live canary summaries preserve `expectedReplyShape` for each case while still omitting raw prompts, observed replies, proof-panel bodies, screenshots, and user confirmations.
- This closes a control-proof projection gap for streaming and rich messages: `cp-streaming-001` now carries `compact_card` in the summary evidence, while `cp-streaming-002` carries `natural`.
- The refreshed full and safe-first packets remain release-ready and publish-not-ready. Fresh-strict audit remains blocking-clean with zero missing evidence, missing trace joins, missing proof capsules, incomplete legacy-gap backing, latest proof gaps, raw leaks, robotic failure reasons, or stack-like leaks.

Update after reply-shape contract and full evidence refresh on 2026-06-26:

- Commit `ac17784` updated the generated canary bundle README contract so `summary.cases[].expectedReplyShape` is documented beside route, authority, mutation class, source refs, verdict, and missing captures. The release-bundle test now protects that field in generated README output.
- Commit `8a7c1d8` refreshed `outputs/live-canary-full` runtime evidence from a clean committed source state. The packet reports runtime evidence collected at `2026-06-26T05:25:31.214Z`, release gate ready, and publish gate not ready.
- The current publish blocker families are structured as `repo_release_blocks`, `local_runtime_test_artifacts`, and `builder_trace_health`. In `releaseCaveatDetails`, local-runtime evidence is stored under `duplicate_truths` with `label=local_runtime_test_artifacts`; in `publishHandoffs` and `releaseHandoffDetails`, use `local_runtime_test_artifacts` as the operator-facing family.

Update after source-snapshot and registry-caveat hardening on 2026-06-25 12:38 +04:

- Commits through `da9cedd` made the full SparkRecursive_bot canary packet reject stale source snapshots, classify runtime-ahead registry pin drift as `registry_pin_drift`, print release handoffs, and refresh the current runtime evidence from a clean tree.
- That packet reported runtime evidence collected at `2026-06-25T08:38:04.504Z`, release gate ready, and publish gate not ready because `spark-telegram-bot` and `spawner-ui` still needed registry pin drift handoff or explicit local-runtime-test classification.
- Current fresh-strict audit remains blocking-clean with zero missing evidence, trace joins, proof capsules, incomplete legacy gap backing, latest proof gaps, raw ref leaks, robotic failure reasons, or stack-like leaks. The remaining visible legacy proof-gap planes are `telegram_route_confidence`, `builder_gateway`, and `spawner_prd_trace`; keep them visible rather than relabeling them as green execution proof.
- The fresh-strict audit now exposes `legacyGapBackingDetails` / `Legacy gap backing`, so each visible historical plane carries its repair source and release-blocking impact. Treat this as the machine-readable join behind the human line `backing complete; latest gaps 0; release blocking no`.

Update after repo release-block handoff promotion on 2026-06-25 13:05 +04:

- Commits through `bdb5ebd` made the canary packet promote repo release-block handoffs alongside registry drift handoffs. `Release handoffs` now names the release-blocked owner repos and next safe action without exposing local paths or commit refs.
- That packet reported runtime evidence collected at `2026-06-25T09:05:25.298Z`, release gate ready, and publish gate not ready because `domain-chip-memory`, `spark-intelligence-builder`, `spark-researcher`, and `spawner-ui` were behind upstream, while `spark-telegram-bot` and `spawner-ui` still had registry pin drift handoffs.

Update after publish handoff proof-shape hardening on 2026-06-25 13:43 +04:

- Commits through `5966840` made `cp-publish-001` reject weak publish-drift replies. The observed reply must distinguish release-ready behavior from publish-not-ready registry truth drift, name owner surfaces such as `spark-telegram-bot` or `spawner-ui`, give a next safe action, and state that the lookup was read-only.
- The refreshed packet reports runtime evidence collected at `2026-06-25T09:43:31.793Z`, release gate ready, and publish gate not ready. Fresh-strict audit remains blocking-clean with zero missing evidence, missing trace joins, missing proof capsules, incomplete legacy-gap backing, latest proof gaps, raw leaks, robotic failure reasons, or stack-like leaks.
- Remaining visible proof gaps are historical and backed in `telegram_route_confidence`, `builder_gateway`, and `spawner_prd_trace`. They should stay visible rather than being rewritten into fresh authority.

Update after rich-message delivery proof hardening on 2026-06-25 14:54 +04:

- Commits through `c524293` made `cp-streaming-002` reject generic rich-message proof joins. The case definition, tests, and live evidence now require proof that the rich-message reply was delivered through the live Telegram profile path, not merely that the reply text rendered.
- The refreshed packet reports runtime evidence collected at `2026-06-25T10:54:44.460Z`, release gate ready, and publish gate not ready. Fresh-strict audit remains blocking-clean with zero missing evidence, missing trace joins, missing proof capsules, incomplete legacy-gap backing, latest proof gaps, raw leaks, robotic failure reasons, or stack-like leaks.

Update after audit gap-posture clarity on 2026-06-25 17:56 +04:

- Commits through `0126183` added the fresh-strict audit header line `Gap posture: backed legacy gaps only; no blocking or latest proof gaps` and refreshed the full SparkRecursive_bot canary evidence packet from a clean tree.
- This is report clarity only: gates still depend on the structured counters and `Blocking status`. Current audit output remains blocking-clean while preserving visible historical legacy gaps in `telegram_route_confidence`, `builder_gateway`, and `spawner_prd_trace`.

Update after Builder trace caveat count hardening on 2026-06-25:

- Spark CLI commit `6707e29` exposes Builder high-severity lifecycle counts in `spark os compile --json`: total historical high-severity rows, unresolved high-severity families, and current unresolved high-severity families.
- Telegram commits `ac1e974` and `2027243` surface those aggregate counts in `builder_trace_health` release caveats and preserve the safe aggregate key names in redacted canary evidence.
- Canary evidence commit `84ab792` refreshed the full SparkRecursive_bot packet from a clean source state. The release gate remains ready and the publish gate remains not ready; the Builder caveat now says `high_severity_open_events=46`, `unresolved_high_severity_events=1`, and `current_unresolved_high_severity_events=0`.
- Treat `current_unresolved_high_severity_events=0` as proof that this is not a current Builder trace producer failure. Treat `unresolved_high_severity_events=1` as a Builder-owned historical integrity handoff; do not erase it from Telegram summaries and do not auto-resolve it through the expected guardrail-denial repair script.

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

- `publish_handoff_shape`: publish/registry drift must not be summarized as a vague caveat in Telegram-facing evidence.
  - Durable slice: `cp-publish-001` now requires a human handoff that separates release-ready from publish-not-ready, names owner surfaces, gives a next safe action, and confirms read-only evidence lookup without raw commits, registry keys, or paths.

- `rich_message_delivery_proof`: rich-message canaries must prove the runtime delivery path, not only the rendered text shape.
  - Durable slice: `cp-streaming-002` now requires proof join wording that names Telegram final delivery, the rich-message reply, and the live profile path. Generic "reply joined" evidence is rejected.

- `media_payload_gap`: photo, captioned photo, audio-file, and real voice-note boundaries are live-proven as evidence-only routes.
  - Durable slice: keep richer document handling beyond metadata separate from the proven media boundary claims; do not promote document bodies or raw media into proof capsules.

- `non_execution_evidence`: memory movement, voice surface, and voice runtime evidence stay explicitly separated from execution proof.
  - Durable slice: keep these planes joined/redacted where useful, but continue marking them `not_execution_proof` or non-execution so they cannot authorize actions.

- `runtime_capability_drift`: `spark os compile` can report duplicate-truth or local-runtime classification caveats while the Telegram behavior release gate remains clean.
  - Current evidence belongs in `outputs/live-canary-full/live-canary-summary.md` and the embedded `spark os compile --json` transcript in `outputs/live-canary-full/live-canary-observations.json`; do not rely on static commit hashes in this doc for registry readiness.
  - The current handoff shape is `spark-telegram-bot` and `spawner-ui` local runtime test artifacts when the installed sources are intentionally being used for local SparkRecursive proof.
  - Durable slice: do not claim registry/release readiness until owner repo commits are ported/pushed and registry or release metadata is updated, or the installed runtime is explicitly classified as a local runtime test artifact.
  - 2026-06-25 Spark CLI update: local CLI commit `994f213` carries `runtime_classification=local_runtime_test_artifact` from installed module metadata into duplicate-truth evidence. This reduces the Telegram runtime-ahead item from critical registry drift to an explicit decision caveat while preserving the publish boundary: the public registry pin remains installer truth until owner repo and release metadata catch up.
  - 2026-06-25 installed metadata update: `spawner-ui` now carries the same explicit local-runtime-test classification. Fresh compile evidence reports `classification_counts.local_runtime_test_artifact=2` and `critical_duplicate_truth_count=0`; publish remains not ready because local proof runtime is not installer truth.
  - 2026-06-25 Telegram update: release summaries now add a `spark-installer-registry` handoff for `local_runtime_test_artifacts`, with the next safe action to keep the installed sources for local SparkRecursive proof only, then port/push owner commits and update registry or release metadata before publish claims.

- `builder_trace_health`: `spark os compile --json` currently reports Builder trace health flag `historical_open_high_severity_events`, while the Telegram control-proof audit has no latest-row gaps.
  - Durable slice: release canary summaries now surface Builder trace-health flags as `builder_trace_health` caveats, so they block publish claims until the underlying Builder trace health is resolved or explicitly handed off.
  - Current evidence from `spark os compile --json`: Builder event rows are present, current high-severity rows are no longer reported as open in the 1h/24h windows, missing trace refs are zero in current and historical health aggregates, and the remaining high-severity flag is explicitly historical.
  - 2026-06-26 Builder dry-run: `python3 ops/resolve_expected_guardrail_denials.py` reports the expected `tool_not_allowed_by_policy` denial groups are already lifecycle-resolved. The remaining historical publish handoff is not an expected-denial repair candidate; current grouped evidence shows an `owner_mismatch` integrity denial family from 2026-06-02, which must stay owner-reviewed rather than auto-repaired by the expected guardrail-denial tool.
  - Durable slice: keep this as a source-owned Builder repair card. Do not hide it in Telegram docs, do not treat it as SparkRecursive_bot release proof failure, and do not patch around it from Telegram unless a fresh trace shows Telegram is the producer.
  - 2026-06-25 Builder update: local Builder commit `4ce0b8e` threads request-scoped `trace:source-ledger:<request>` refs into future `source_used` rows when no explicit trace is supplied, and fixes import-cycle blockers that prevented focused source-ledger tests from running. Existing Builder trace-health flags remain visible until older event rows age out or are explicitly repaired by the Builder owner.
  - 2026-06-25 Builder update: local Builder commit `e98e8e0` extends the lower-level `record_agent_event` source-ledger boundary so direct `source_used` records with a request id now receive a stable `trace:agent-event:<request>` join. Focused Builder tests pass; existing 24h/historical rows still keep the compiler caveat visible until replaced or aged out.
  - 2026-06-25 Builder update: local Builder commit `176e7ee` adds redacted source-metadata trace refs for `source_used` rows that have no request id. New rows get `trace:source-ledger-source:<hash>` or `trace:agent-event-source:<hash>` joins without exposing raw source refs; focused Builder tests pass.
  - 2026-06-25 live smoke: writing one metadata-only `source_used` row through the Builder CLI against `/Users/alchemistab/.spark/state/spark-intelligence` produced `trace:source-ledger:req-control-proof-source-ledger-smoke-builder-home`. The next `spark os compile --json` saw Builder event rows increase to 33409, and the `source_used` repair card moved to `latest_clean_historical_window_debt`; remaining flags are historical aggregate debt, not a current `source_used` producer failure.
  - 2026-06-25 Spark CLI update: local CLI commit `9d450ab` separates current high-severity trace events from stale lifecycle debt. `spark os compile --json` now reports `historical_open_high_severity_events` when old high/critical rows exist but the 1h/24h windows have no current high-open rows, instead of presenting that backlog as active `open_high_severity_events`.
  - 2026-06-25 Builder update: local Builder commit `6e3aaae` threads request-scoped trace refs into future researcher-bridge `memory_candidate_assessed` and `policy_gate_blocked` rows for Telegram generic-memory candidate assessment. Focused route tests and the full generic-memory suite passed. Fresh `spark os compile --json` still reports `missing_trace_refs` because the 24h window contains older `source_used`, `memory_candidate_assessed`, and `policy_gate_blocked` rows, while the 1h trace-ref window is clean.
  - 2026-06-25 live smoke: writing one metadata-only `source_used` row through the Builder CLI produced a request-scoped trace ref and moved the largest `agent_event_model/source_used` repair card to `latest_clean_historical_window_debt`. Focused source-ledger CLI/model tests passed. Remaining `missing_trace_refs` are 24h/historical rows, not a current `source_used` producer failure.
  - 2026-06-25 Spark CLI/Telegram update: local CLI commit `0de4f2f` exposes Builder trace current-health and recent-window aggregates in `spark os compile --json`, and Telegram commit `d4ad344` prints those aggregates in release caveats. Current canary evidence now shows `1h_missing_trace_refs=0` alongside the 24h missing-trace debt, so future handoffs can distinguish active producer gaps from historical backlog.
  - 2026-06-25 Builder/CLI/Telegram update: Builder commit `86173c0` records expected Harness Core guardrail denials such as `tool_not_allowed_by_policy` as medium `recorded` proof while preserving integrity denials such as `owner_mismatch` as high `blocked`; it also adds `ops/resolve_expected_guardrail_denials.py` for append-only lifecycle repair. Spark CLI commit `76fed5e` makes Builder trace health honor latest lifecycle rows, so resolved high-severity families stop surfacing as active `open_high_severity_events`. Telegram commit `3257659` refreshes SparkRecursive_bot canary evidence from a clean source state; the release gate is ready with caveats and the publish gate remains not ready because repo/pin handoffs are still open.
  - 2026-06-25 CLI/Telegram update: Spark CLI commit `6707e29` and Telegram commits `ac1e974`, `2027243`, and `84ab792` make the release caveat distinguish historical high-severity rows from unresolved historical families and current unresolved families. Current evidence reports `high_severity_open_events=46`, `unresolved_high_severity_events=1`, and `current_unresolved_high_severity_events=0`, so the publish caveat is now traceable to historical Builder integrity debt rather than active Telegram or Builder trace production.

- `default_suite_gap`: all stable current `tests/*.test.ts` files are now in the default `npm test` runner.
  - Durable slice: keep new proof, routing, Telegram surface, media, streaming, and drift suites in `scripts/run-tests.cjs` unless they require live credentials or intentional live action. Optional/live suites must state why they are excluded.

## First Slice Completed

The first durable slice is now in progress/completed at minimum viable level: a repeatable trace-continuity audit command/report exists.

It reports request id coverage, trace ref coverage, proof capsule coverage, raw ref leaks, raw id-key rows, policy reason-code rows, stack-like leaks, and missing evidence files without printing raw trace rows in the default human report.

## Recommended Next Slice

Resolve or explicitly hand off the remaining publish blockers without weakening the release gate.

Reason: current SparkRecursive_bot canary evidence is release-ready, fresh-strict audit is blocking-clean, and live proof joins are represented in the full canary packet. Publish remains not ready because four owner repos are behind upstream, two installed runtimes are explicitly classified as local runtime test artifacts, and Builder has one unresolved historical high-severity integrity family. The next durable move is to reduce one of those measured publish handoffs at its owner boundary, or document why it remains intentionally deferred.

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
