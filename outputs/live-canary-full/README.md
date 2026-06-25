# SparkRecursive_bot Control-Proof Live Canary Bundle

This folder is the live Telegram release packet. It starts not ready until each selected case has a recorded verdict and required captures.

## Files

- Observation packet: outputs/live-canary-full/live-canary-observations.json
- Run guide: outputs/live-canary-full/live-canary-run-guide.md
- Copy-paste prompts: outputs/live-canary-full/live-canary-copy-paste.md
- Checklist: outputs/live-canary-full/live-canary-checklist.md
- Coverage: outputs/live-canary-full/live-canary-coverage.md
- Current summary: outputs/live-canary-full/live-canary-summary.md
- Current summary JSON: outputs/live-canary-full/live-canary-summary.json

## Run Order

1. Open the run guide and copy only the Telegram prompt blocks into SparkRecursive_bot.
2. Capture the reply, local screenshot file, proof panel text, side effects, and user confirmation for each case.
3. Run the matching `--record-case` command from the run guide after each prompt. The command refreshes the current summaries and records screenshot files as digest refs.
4. Re-run the release check:

```bash
npm run control:proof:canaries -- --observations 'outputs/live-canary-full/live-canary-observations.json' --release-check
```

For publish or registry claims, run the publish check too:

```bash
npm run control:proof:canaries -- --observations 'outputs/live-canary-full/live-canary-observations.json' --publish-check
```

The release gate is ready only when the release check reports every selected case as pass with required captures present, required category coverage is complete, and the full release pack is present.

`--release-check` treats runtime evidence older than one hour as stale. Refresh runtime evidence immediately before making a release or publish claim.

The summaries print both `Runtime evidence collected` and `Runtime evidence expires`; the expiry timestamp is the freshness deadline for release claims.

If `spark os compile --json` is otherwise clean but reports repo release blocks or duplicate-truth drift, the summary stays release-check ready and prints the drift under `Release caveats`. Blocked repo release counts are labeled `repo_release_blocks`; runtime-ahead-of-registry-pin rows are labeled `registry_pin_drift`; explicitly classified local proof runtimes are labeled `local_runtime_test_artifacts`; other duplicate-truth rows are labeled `duplicate_truth_drift`. Treat these as publish/registry handoff items, not as hidden Telegram proof. Dirty runtime compile evidence still makes the packet not ready.

When caveats or handoffs exist, the human summary also prints `Release note: ready with caveats` so the Telegram canary gate cannot be mistaken for publish/registry completion.

When the observation packet includes release-block or duplicate-truth handoff notes, the markdown and JSON summaries also print `Release handoffs` so the owner repo and next safe action are visible without reading raw system-map artifacts.

Repo release-block handoffs should include `behind=N` when the repo board reports a safe upstream behind count. Local runtime test artifact handoffs should name the owning installed sources from the compile summary `owner_sets`, so local proof runtimes stay separate from publish/registry truth.

Builder trace-health handoffs should preserve unresolved historical family evidence, including unresolved source-group count and latest unresolved event timestamp when available. Do not resolve those caveats by editing state directly; either land an owner-approved lifecycle repair or keep the publish handoff explicit.

When `spark os compile --json` includes `publish_handoffs`, the canary summary should prefer that structured object over prose notes for release handoffs. Prose note parsing remains a compatibility path for older packets, not the primary publish-proof contract.

The machine-readable `live-canary-summary.json` summary carries the sanitized `publishHandoffs` object as well as the human `releaseHandoffs` lines. Automation should read `publishHandoffs` first and use the display lines only for operator-facing reports.

The same JSON summary carries sanitized `releaseCaveatDetails` for release caveat counts and Builder trace-health aggregates. Automation should use those structured counts instead of parsing the human `releaseCaveats` strings.

The JSON summary also carries `packetEvidenceDetails` beside the compatibility arrays `missingPacketEvidence`, `invalidPacketEvidence`, and `stalePacketEvidence`. Automation should use the structured detail objects for proof-gap reasons, timestamps, and freshness windows instead of parsing the markdown lines.

The JSON summary carries `controlProofAuditDetails` parsed from the fresh-strict trace audit transcript. Automation should use it for audit generated time, blocking status, gap posture, gap counts, gap planes, and per-plane trace/proof coverage instead of scraping the raw `controlProofAudit` command output.

The JSON summary carries `gateDecisionDetails` beside the compatibility booleans `readyForRelease` and `readyForPublish`. Automation should use it to explain gate readiness from structured packet-evidence blockers, failing case ids, release caveat families, and publish handoff families instead of reconstructing the decision from prose lines.

Refreshing runtime evidence for this standard bundle observation file also refreshes `live-canary-summary.md` and `live-canary-summary.json`.

For live Telegram visual checks, pass local captures with `--screenshot-file`; the observation packet should keep redacted `screenshot:sha256:<digest>` refs. Keep raw screenshots outside the repo unless the user explicitly asks to preserve the image itself.

Refreshing runtime evidence also refreshes the packet `generatedAt` timestamp to the strict `evidence.collectedAt` value. A release packet whose generated timestamp predates its runtime evidence, uses loose timestamp prose, or is more than five minutes future-dated is stale metadata and must not be used for release claims.

## Side-Effect Proof

Every record command should prove side effects explicitly. For no-action and read-only cases, keep `--no-other-side-effects` in the generated command and record the prompted side-effect flag as `false` when no mutation occurred. Notes alone are not enough.

For action cases, `--no-other-side-effects` records every non-expected side effect as `false` so the packet proves the action did not smuggle a mission, file write, provider switch, memory write, network call, or media handling.

If an unrelated side effect did happen, remove `--no-other-side-effects`, record the actual true flag, and mark the case `fail` or `needs-retest` with a short note.
