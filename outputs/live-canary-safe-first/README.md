# SparkRecursive_bot Control-Proof Live Canary Bundle

This folder is the live Telegram release packet. It starts not ready until each selected case has a recorded verdict and required captures.

## Files

- Observation packet: outputs/live-canary-safe-first/live-canary-observations.json
- Run guide: outputs/live-canary-safe-first/live-canary-run-guide.md
- Copy-paste prompts: outputs/live-canary-safe-first/live-canary-copy-paste.md
- Checklist: outputs/live-canary-safe-first/live-canary-checklist.md
- Coverage: outputs/live-canary-safe-first/live-canary-coverage.md
- Current summary: outputs/live-canary-safe-first/live-canary-summary.md
- Current summary JSON: outputs/live-canary-safe-first/live-canary-summary.json

## Run Order

1. Open the run guide and copy only the Telegram prompt blocks into SparkRecursive_bot.
2. Capture the reply, local screenshot file, proof panel text, side effects, and user confirmation for each case.
3. Run the matching `--record-case` command from the run guide after each prompt. The command refreshes the current summaries and records screenshot files as digest refs.
4. Re-run the selected-case strict check:

```bash
npm run control:proof:canaries -- --observations 'outputs/live-canary-safe-first/live-canary-observations.json' --strict
```

This selected-case gate is ready when every case in this bundle passed with required captures present and top-level runtime evidence is clean. It is not the full release gate until the complete canary pack is run.

`--release-check` treats runtime evidence older than one hour as stale. Refresh runtime evidence immediately before making a release or publish claim.

The summaries print both `Runtime evidence collected` and `Runtime evidence expires`; the expiry timestamp is the freshness deadline for release claims.

If `spark os compile --json` is otherwise clean but reports repo release blocks or duplicate-truth drift, the summary stays selected-case proof accurate and prints the drift under `Release caveats`. Treat these as publish/registry handoff items, not as hidden Telegram proof. Dirty runtime compile evidence still makes the packet not ready.

When caveats or handoffs exist, the human summary prints the owner repo and next safe action so the Telegram canary gate cannot be mistaken for publish/registry completion.

The JSON summary also carries `packetEvidenceDetails` beside the compatibility arrays `missingPacketEvidence`, `invalidPacketEvidence`, and `stalePacketEvidence`. Automation should use the structured detail objects for proof-gap reasons, timestamps, and freshness windows instead of parsing the markdown lines.

The JSON summary `cases` array carries safe Harness metadata for each canary: `expectedRoute`, `expectedAuthority`, `expectedMutationClass`, `expectedReplyShape`, optional sanitized `sourceRefs`, verdict, and missing capture names. It intentionally omits raw Telegram prompts, observed replies, proof-panel bodies, screenshots, and user confirmations; read the observation packet only when reviewed live evidence is needed.

The JSON summary carries `controlProofAuditDetails` from the fresh-strict trace audit. Automation should use `controlProofAuditDetails.actionableStatus`, `controlProofAuditDetails.freshStrictOk`, `controlProofAuditDetails.gapPosture`, and `controlProofAuditDetails.legacyGapBackingDetails` to verify each visible historical proof-gap plane has complete backing, no latest gap, `releaseBlocking=false`, and a safe repair source/command instead of scraping the raw audit transcript or `Legacy gap backing` prose.

The JSON summary carries `gateScope` beside the compatibility booleans `readyForRelease` and `readyForPublish`. Automation should read `readyForRelease=true` as full release readiness only when `gateScope=full_release_pack`; `gateScope=selected_case_gate` proves the selected cases only.

The JSON summary carries `gateDecisionDetails` beside the compatibility booleans `readyForRelease` and `readyForPublish`. Automation should use it to explain gate readiness from structured packet-evidence blockers, failing case ids, release caveat details, handoff details, per-action `handoffActionDetails` with normalized `releaseBlocking`/`publishBlocking` impact, and per-blocker `blockerDetails` joins instead of reconstructing the decision from prose lines.

Refreshing runtime evidence for this standard bundle observation file also refreshes `live-canary-summary.md` and `live-canary-summary.json`.

For live Telegram visual checks, pass local captures with `--screenshot-file`; the observation packet should keep redacted `screenshot:sha256:<digest>` refs. Keep raw screenshots outside the repo unless the user explicitly asks to preserve the image itself.

Refreshing runtime evidence also refreshes the packet `generatedAt` timestamp to the strict `evidence.collectedAt` value. A release packet whose generated timestamp predates its runtime evidence, uses loose timestamp prose, or is more than five minutes future-dated is stale metadata and must not be used for release claims.

## Side-Effect Proof

Every record command should prove side effects explicitly. For no-action and read-only cases, keep `--no-other-side-effects` in the generated command and record the prompted side-effect flag as `false` when no mutation occurred. Notes alone are not enough.

For action cases, `--no-other-side-effects` records every non-expected side effect as `false` so the packet proves the action did not smuggle a mission, file write, provider switch, memory write, network call, or media handling.

If an unrelated side effect did happen, remove `--no-other-side-effects`, record the actual true flag, and mark the case `fail` or `needs-retest` with a short note.
