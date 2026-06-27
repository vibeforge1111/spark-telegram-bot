# Spark Publish Readiness Handoffs

Date: 2026-06-27
Status: active publish-readiness map, repo release blockers locally reconciled

## Purpose

This document separates Telegram behavior release readiness from Spark-wide publish readiness.

Telegram reliability is green enough for route-safety work to stop being the blocker. Repo release blockers are now locally reconciled; publish still needs registry/runtime artifact convergence and owner lifecycle decisions before a full publish-green claim.

## Verified Baseline

Checked from the local SparkRecursive control-proof branch on 2026-06-27:

- `git status --short`: clean
- `npm run check:line-count`: pass, with 13 baselined large files
- `npm run build`: pass
- `npm run control:proof:reliability`: pass
- `spark live status --json`: `ok=true`
- `spark os compile --json`: `ok=true`, `gaps=0`, `dirty_repo_count=0`
- `outputs/live-canary-full/live-canary-summary.md`: `Release gate: ready`, `Publish gate: not ready`

Publish-handoff refresh on 2026-06-27T09:16Z:

- `domain-chip-memory`: fast-forwarded to upstream, then committed `1fd272e Accept vNext memory write authority proof`; SDK authority tests passed.
- `spark-researcher`: fast-forwarded to upstream; memory status health passed.
- `spark-intelligence-builder`: merged upstream and committed `f21522a Reconcile Builder memory authority after merge`; focused Builder suite passed.
- `spawner-ui`: merged upstream and committed `0a892f0b Merge remote-tracking branch 'origin/release/stability-2026-06-02-spawner-authority' into release/stability-2026-06-02-spawner-authority`; focused Spawner tests and `npm run check` passed.
- `spark os compile --json`: `ok=true`, `gaps=0`, `dirty_repo_count=0`, `blocked_release_count=0`.

Backed historical proof gaps remain visible in route-confidence, Builder gateway, and Spawner PRD trace. The fresh-strict audit reports latest gaps as zero and release blocking as no.

## Publish Handoff Inventory

| Area | Status | Blocking class | Current evidence | Next safe action |
| --- | --- | --- | --- | --- |
| `domain-chip-memory` | locally reconciled | not currently release-blocking | Ahead-only locally by 1 commit after accepting vNext memory write authority proof. `PYTHONPATH=src python3 -m domain_chip_memory.cli benchmark-contracts` and SDK authority tests passed. | Publishing owner can review/push the local commit or port it to the owner lane before registry publish claims. |
| `spark-intelligence-builder` | locally reconciled | not currently release-blocking | Ahead-only locally after upstream merge and Builder authority fix. Focused suite passed: `tests/test_bridge_authority.py`, `tests/test_memory_orchestrator.py`, `tests/test_gateway_ask_telegram.py`, `tests/test_user_instructions_authority.py`. | Publishing owner can review/push the merge/fix commits or port them to the owner lane before registry publish claims. |
| `spark-researcher` | reconciled | not currently release-blocking | Fast-forwarded to upstream and clean. `PYTHONPATH=src python3 -m spark_researcher.cli memory status --config spark-researcher.project.json` passed. | No repo-release blocker remains; include in final Spark-wide publish proof. |
| `spawner-ui` | locally reconciled | not currently release-blocking | Ahead-only locally after upstream merge. Focused PRD/events/harness tests passed and `npm run check` reported 0 errors, 0 warnings. | Publishing owner can review/push the merge commit or port it to the owner lane before registry publish claims. |
| `spark-installer-registry` | owner-handoff | publish-blocking warning | `spark os compile --json` still reports 2 `local_runtime_test_artifact` duplicate truths owned by `spark-telegram-bot` and `spawner-ui`. | Port/push owner commits and update registry or release metadata before registry readiness claims. Keep installed sources for local proof only until then. |
| Builder trace health | owner-handoff | publish-blocking warning | Current 1h and 24h trace windows are clean, but 1 unresolved historical high-severity integrity family remains; latest event 2026-06-02T09:03:25Z. Current unresolved high-severity count is 0. | Audit the historical family and append owner-approved lifecycle resolution, or keep it explicit as a publish handoff. |
| Voice surface | non-blocking evidence boundary | not publish-green | Voice/audio evidence boundary is covered, but system map reports `voice_surface_mode=disabled` with 2 blockers: `spark-voice-comms repo not discovered` and `voice final-answer join evidence is not compiled`. | Do not call voice fully green until the repo discovery and final-answer join evidence blockers are resolved and fresh voice proof shows enabled runtime behavior. |
| Line-count ratchet | maintenance | not publish-blocking | Gate passes, but 13 baselined large files remain. | Shrink one baselined file at a time after publish blockers are mapped. |

## Handoff Classification

Current classification after direct repo inspection and local reconciliation:

- Repo release blockers:
  - None currently reported by `spark os compile --json`; `blocked_release_count=0`.
- Ahead-only local owner handoffs requiring review/push/port before publish metadata claims:
  - `domain-chip-memory`: local vNext authority proof compatibility commit.
  - `spark-intelligence-builder`: upstream merge plus memory authority reconciliation commit.
  - `spawner-ui`: upstream merge commit with PRD proof-continuity conflict resolved.
- Registry/release metadata handoff:
  - `spark-telegram-bot` and `spawner-ui` still appear as local runtime test artifacts. Publish readiness requires owner repo commits and registry/release metadata to converge.
- Evidence-boundary handoff:
  - Voice remains boundary-covered but disabled/blockered; it is not a publish-green capability.

## Work Order

1. Keep Telegram reliability green. Do not reopen route-safety work without a fresh failing proof.
2. Review/push or port the ahead-only local owner commits before claiming registry or Spark-wide publish readiness.
3. Keep each reconciled repo clean and rerun its local health gate after any owner-lane movement.
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
