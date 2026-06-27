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
| `domain-chip-memory` | owner-handoff | publish-blocking, release-non-blocking | Behind upstream by 6 commits. Runtime health is green. | Pull or merge upstream before publish claims. |
| `spark-intelligence-builder` | owner-handoff | publish-blocking, release-non-blocking | Behind upstream by 12 commits. Runtime health is green. | Pull or merge upstream, then rerun Builder and Spark-wide proof. |
| `spark-researcher` | owner-handoff | publish-blocking, release-non-blocking | Behind upstream by 61 commits. Runtime health is green. | Pull or merge upstream before publish claims. |
| `spawner-ui` | owner-handoff | publish-blocking, release-non-blocking | Behind upstream by 29 commits. Live health is HTTP 200. | Pull or merge upstream, then rerun Spawner health and Spark-wide proof. |
| `spark-installer-registry` | owner-handoff | publish-blocking warning | Installed `spark-telegram-bot` and `spawner-ui` sources are local runtime test artifacts for SparkRecursive proof. | Port/push owner commits and update registry or release metadata before registry readiness claims. |
| Builder trace health | owner-handoff | publish-blocking warning | Current 1h and 24h trace windows are clean, but 1 unresolved historical high-severity integrity family remains; latest event 2026-06-02T09:03:25Z. | Audit the historical family and append owner-approved lifecycle resolution, or keep it explicit as a publish handoff. |
| Voice surface | non-blocking evidence boundary | not publish-green | Voice/audio evidence boundary is covered, but system map reports `voice_surface_mode=disabled` with blockers. | Do not call voice fully green until blockers are removed and a fresh voice proof shows enabled runtime behavior. |
| Line-count ratchet | maintenance | not publish-blocking | Gate passes, but 13 baselined large files remain. | Shrink one baselined file at a time after publish blockers are mapped. |

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
