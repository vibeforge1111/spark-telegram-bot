# Spark Publish Readiness Handoffs

Date: 2026-06-27
Status: active publish-readiness map

## Purpose

This document separates Telegram behavior release readiness from Spark-wide publish readiness.

Telegram reliability is green enough for route-safety work to stop being the blocker. Publish is still not ready while upstream, registry, and lifecycle handoffs remain open.

## Verified Baseline

Checked from the local SparkRecursive control-proof branch on 2026-06-27:

- `git status --short`: clean
- `npm run check:line-count`: pass, with 13 baselined large files
- `npm run build`: pass
- `npm run control:proof:reliability`: pass
- `spark live status --json`: `ok=true`
- `spark os compile --json`: `ok=true`, `gaps=0`, `dirty_repo_count=0`
- `outputs/live-canary-full/live-canary-summary.md`: `Release gate: ready`, `Publish gate: not ready`

Backed historical proof gaps remain visible in route-confidence, Builder gateway, and Spawner PRD trace. The fresh-strict audit reports latest gaps as zero and release blocking as no.

## Publish Handoff Inventory

| Area | Status | Blocking class | Current evidence | Next safe action |
| --- | --- | --- | --- | --- |
| `domain-chip-memory` | owner-handoff | publish-blocking, release-non-blocking | Branch `codex/turnintent-memory-boundary-20260531` is behind upstream by 6 commits and has no local ahead commits. Runtime health is green. | Publishing owner can pull/fast-forward or merge upstream, then rerun memory health and Spark-wide proof before publish claims. |
| `spark-intelligence-builder` | owner-handoff | publish-blocking, release-non-blocking | Branch `codex/turnintent-builder-boundary-20260531` is ahead 41 and behind upstream by 12 commits. Runtime health is green. | Publishing owner must reconcile local ahead work with upstream before publish; do not auto-merge from this machine. Rerun Builder and Spark-wide proof after reconciliation. |
| `spark-researcher` | owner-handoff | publish-blocking, release-non-blocking | Branch `codex/researcher-self-edit-governor-20260602` is behind upstream by 61 commits and has no local ahead commits. Runtime health is green. | Publishing owner can pull/fast-forward or merge upstream, then rerun Researcher health and Spark-wide proof before publish claims. |
| `spawner-ui` | owner-handoff | publish-blocking, release-non-blocking | Branch `release/stability-2026-06-02-spawner-authority` is ahead 8 and behind upstream by 29 commits. Live health is HTTP 200. | Publishing owner must reconcile local ahead work with upstream before publish; do not auto-merge from this machine. Rerun Spawner health and Spark-wide proof after reconciliation. |
| `spark-installer-registry` | owner-handoff | publish-blocking warning | Installed `spark-telegram-bot` head is `856c504`, registry pin is `e5a1bd0`; installed `spawner-ui` head is `e9ba42e`, registry pin is `19b7d0b`. Both are intentionally marked `local_runtime_test_artifact` for SparkRecursive proof. | Port/push owner commits and update registry or release metadata before registry readiness claims. Keep installed sources for local proof only until then. |
| Builder trace health | owner-handoff | publish-blocking warning | Current 1h and 24h trace windows are clean, but 1 unresolved historical high-severity integrity family remains; latest event 2026-06-02T09:03:25Z. Current unresolved high-severity count is 0. | Audit the historical family and append owner-approved lifecycle resolution, or keep it explicit as a publish handoff. |
| Voice surface | non-blocking evidence boundary | not publish-green | Voice/audio evidence boundary is covered, but system map reports `voice_surface_mode=disabled` with 2 blockers: `spark-voice-comms repo not discovered` and `voice final-answer join evidence is not compiled`. | Do not call voice fully green until the repo discovery and final-answer join evidence blockers are resolved and fresh voice proof shows enabled runtime behavior. |
| Line-count ratchet | maintenance | not publish-blocking | Gate passes, but 13 baselined large files remain. | Shrink one baselined file at a time after publish blockers are mapped. |

## Handoff Classification

Current classification after direct repo inspection:

- Blocking owner handoffs that are safe for the publishing owner to reconcile:
  - `domain-chip-memory`: behind-only, likely fast-forwardable after owner review.
  - `spark-researcher`: behind-only, likely fast-forwardable after owner review.
- Blocking owner handoffs that require merge/cherry-pick judgment because local work exists:
  - `spark-intelligence-builder`: ahead 41 / behind 12.
  - `spawner-ui`: ahead 8 / behind 29.
- Registry/release metadata handoff:
  - `spark-telegram-bot` and `spawner-ui` installed heads intentionally differ from registry pins for local SparkRecursive proof. Publish readiness requires owner repo commits and registry/release metadata to converge.
- Evidence-boundary handoff:
  - Voice remains boundary-covered but disabled/blockered; it is not a publish-green capability.

## Work Order

1. Keep Telegram reliability green. Do not reopen route-safety work without a fresh failing proof.
2. Resolve publish owner handoffs before claiming registry or Spark-wide publish readiness.
3. For each upstream repo handoff, make the owner merge/pull decision in that repo, then rerun its local health gate and the Spark-wide proof battery.
4. Resolve local runtime test artifacts by porting/pushing owner commits and updating installer registry or release metadata.
5. Resolve Builder historical trace health by owner-approved lifecycle closure, not by hiding the historical debt.
6. Keep voice described as boundary-covered but disabled/blockered until runtime proof changes.
7. Start line-count maintenance only after the publish map stays explicit and current.

## Done For Publish Readiness

Spark-wide publish readiness can be claimed only when:

- `Release gate: ready` remains true in the full canary summary.
- `Publish gate: ready` is true in the full canary summary.
- `spark os compile --json` reports `ok=true`, `gaps=0`, and `dirty_repo_count=0`.
- No repo is behind upstream in the publish handoff set.
- Local runtime test artifacts are reconciled into owner repos and registry/release metadata.
- Builder trace-health has no unresolved publish-blocking lifecycle handoff.
- Voice is either still explicitly scoped out, or enabled with fresh proof and no disabled/blocker state.
