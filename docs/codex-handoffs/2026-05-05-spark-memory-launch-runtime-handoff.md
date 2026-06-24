# Spark Memory Launch Runtime Handoff - 2026-05-05

## Repo, Path, And Branches

Primary handoff repo:
- Repo: `spark-telegram-bot`
- Path: `C:\Users\USER\Desktop\spark-telegram-bot`
- Branch at handoff creation: `codex/launch-telegram-profile-health`
- Latest commit on branch/main: `9859bd2 Forward profile args in runtime health wrapper`
- Known untracked local file preserved: `PROJECT.md`

Related repos touched or verified:
- `C:\Users\USER\Desktop\spark-intelligence-builder`
  - Branch: `codex/creator-mission-status-builder`
  - Latest pushed commit: `fc60275 Merge remote-tracking branch 'origin/main' into codex/creator-mission-status-builder`
  - Known untracked local path preserved: `artifacts/`
- `C:\Users\USER\Desktop\domain-chip-memory`
  - Branch: `main`
  - Latest verified commit: `8de77ea Trace current-state retrieval movement`
  - Status at handoff: clean against `origin/main`
- `C:\Users\USER\Desktop\spark-memory-quality-dashboard`
  - Branch: `main`
  - Known untracked local files preserved: `artifacts-agent-after.png`, `artifacts-agent-before.png`, `artifacts-answer-causality-after.png`, `artifacts-human-after.png`, `artifacts-human-before.png`, `scripts/__pycache__/`

Live installed runtime paths verified:
- Builder: `C:\Users\USER\.spark\modules\spark-intelligence-builder\source`
  - Branch/status: `main...origin/main`
  - Commit: `fc60275`
- Telegram: `C:\Users\USER\.spark\modules\spark-telegram-bot\source`
  - Branch/status: `main...origin/main`
  - Commit: `9859bd2`

## Current Goal

Prepare Spark's memory, wiki, self-awareness, Telegram, and dashboard integration for a same-day launch. The practical launch goal is that Spark can answer memory/self-awareness questions naturally through Telegram, while the runtime stack is healthy, source-aware, and traceable:

- current-state memory outranks wiki and old conversations for mutable facts
- wiki remains `supporting_not_authoritative`
- Graphiti/sidecar recall remains advisory until evals pass
- memory movement is visible to dashboard/export surfaces
- Telegram replies stay concise and conversational
- live Builder and Telegram runtimes run the exact pushed code

## What Is Already Completed

### domain-chip-memory

- Confirmed `main` is clean and aligned with `origin/main`.
- Verified memory movement export support is present through Builder inspect output.
- Verified movement contract reports:
  - `contract_name`: `SparkMemoryDashboardMovementExport`
  - `authority`: `observability_non_authoritative`
  - `row_count`: `8164`
  - movement counts include `captured`, `promoted`, `retrieved`, `saved`, `selected`, `summarized`
- Verified Graphiti/temporal sidecar remains disabled/advisory:
  - mode: `disabled`
  - backend: `not_configured`
  - authority: `supporting_not_authoritative`

### spark-intelligence-builder

- Merged Builder feature branch with `origin/main`.
- Resolved conflicts while preserving both:
  - domain-chip memory methods: `retrieve_evidence`, `retrieve_events`, `recover_task_context`, `recall_episodic_context`, dashboard movement export/persistence
  - LLM wiki, user/project/capability self-awareness features from `main`
  - memory route boundary/source explanation behavior
  - natural language self-awareness query signals
- Fixed merge regression by allowing `src/spark_intelligence/self_awareness/handoff_check.py` through subprocess governance in `src/spark_intelligence/observability/checks.py`.
- Updated self-awareness memory limit/cognition rendering so memory-lack prompts stay focused on memory cognition instead of generic stack status.
- Pushed Builder branch and `main`.
- Synced live Builder installed source to pushed `origin/main`.
- Preserved previous live Builder WIP in stash:
  - `stash@{0}: pre-sync-live-builder-2026-05-05`

### spark-telegram-bot

- Fixed the runtime health wrapper so profile args are forwarded:
  - `scripts/run-health-runtime.cjs` now passes `process.argv.slice(2)` through to either `dist/healthRuntime.js` or `ts-node src/healthRuntime.ts`.
- Added regression coverage in `tests/profileEnv.test.ts` to prevent losing profile forwarding again.
- Built and tested Telegram.
- Pushed Telegram branch and `main`.
- Synced Telegram runtime and verified runtime sync.
- Found live installed Telegram runtime drift, preserved it, then aligned live installed runtime to pushed `origin/main`.
- Preserved previous live Telegram runtime state:
  - backup branch: `backup/live-telegram-runtime-2026-05-05`
  - stash: `pre-sync-live-telegram-2026-05-05`
- Restarted both Telegram profiles cleanly:
  - `spark-agi` on port `8789`, pid `56148`
  - `testerthebester` on port `8788`, pid `26528`

### spark-memory-quality-dashboard

- Exported latest Spark memory dashboard data:
  - `57 recall events`
  - live ledger summary
  - domain-chip scorecards
- Confirmed dashboard has untracked screenshot artifacts/cache that should be preserved unless the user explicitly asks to clean them.

## Files Touched Or Investigated

Touched in `spark-telegram-bot`:
- `scripts/run-health-runtime.cjs`
- `tests/profileEnv.test.ts`
- this handoff: `docs/codex-handoffs/2026-05-05-spark-memory-launch-runtime-handoff.md`

Touched in `spark-intelligence-builder` during merge/fixes:
- `src/spark_intelligence/memory/orchestrator.py`
- `src/spark_intelligence/researcher_bridge/advisory.py`
- `src/spark_intelligence/self_awareness/capsule.py`
- `src/spark_intelligence/system_registry/registry.py`
- `src/spark_intelligence/observability/checks.py`
- `tests/test_self_awareness.py`

Investigated or verified:
- `C:\Users\USER\.spark\modules\spark-intelligence-builder\source`
- `C:\Users\USER\.spark\modules\spark-telegram-bot\source`
- `C:\Users\USER\Desktop\domain-chip-memory`
- `C:\Users\USER\Desktop\spark-memory-quality-dashboard`
- `ops/liveNlCommandSuite.ts`
- `ops/natural-language-live-commands.json` via `npm run nl:live -- --list`

## Commands And Tests Already Run

domain-chip-memory:
- `python -m domain_chip_memory.cli memory-system-contracts`
- `python -m pytest -q`
  - Result: `940 passed, 1 warning in 480.65s`

spark-intelligence-builder:
- `git fetch origin --prune`
- `git merge --no-edit origin/main`
- targeted pytest for merge regressions:
  - self-awareness memory KB family exposure
  - memory-lack direct route
  - dashboard movement route
  - doctor/schema/bootstrap/auth JSON checks
- broader Builder gate:
  - `python -m pytest -q tests/test_self_awareness.py tests/test_memory_orchestrator.py tests/test_cli_smoke.py tests/test_natural_language_route_eval_matrix.py`
  - Result: `265 passed, 1 warning, 18 subtests passed in 1354.27s`
- live installed Builder:
  - `python -m spark_intelligence.cli wiki status --json`
  - `python -m spark_intelligence.cli memory inspect-capsule --query "launch readiness memory check" --no-record-activity --json`

spark-telegram-bot:
- `npm run build`
- `npm test`
- `npm run sync:runtime`
- `npm run sync:check`
- `npm run health:runtime -- --profile spark-agi`
  - Result after fix/restart: OK, token accepted, relay `spark-agi@8789 pid=56148`
- `npm run health:runtime -- --profile testerthebester`
  - Result after fix/restart: OK, token accepted, relay `testerthebester@8788 pid=26528`
- `npm run nl:live -- --profile spark-agi --send --raw-prompts --suite memory_architecture --delay-ms 7000`
  - Result: failed before sending because `memory_architecture` is no longer an available suite name.
- `npm run nl:live -- --list`
  - Verified available suites include `memory`, `self_awareness`, `wiki`, `anti_drift`, `smoke`, `preferences`, `access`, `guardrails`, `context_window`, `local_services`, `mission_control`, `spawner_flow`, `user_awareness`, `project_awareness`, and `noise`.

Spark CLI/runtime:
- `spark status --json`
  - Result: OK, all six starter modules healthy.
- `spark restart spark-telegram-bot --profile spark-agi`
  - First restart exposed runtime drift, second restart clean after runtime sync.
- `spark restart spark-telegram-bot --profile testerthebester`
  - Restarted cleanly after runtime sync.
- `spark verify --onboarding`
  - Result: all OK.
- `spark verify --deep`
  - Result: all OK.

spark-memory-quality-dashboard:
- `npm run export:spark`
  - Result: `Exported 57 recall events, live ledger summary, and domain-chip scorecards to public\memory-quality`

## Known Errors, Warnings, Or Failing Checks

Resolved:
- `npm run health:runtime -- --profile spark-agi` initially failed with:
  - `Could not load telegram.profiles.spark-agi.bot_token`
  - Root cause: `scripts/run-health-runtime.cjs` did not forward CLI profile args.
  - Fixed and regression-tested.
- Live installed Telegram runtime initially warned:
  - `installed runtime code has drifted from the pinned registry`
  - had local git changes and was on older commit `ec00482`
  - preserved with backup branch/stash and reset to `origin/main` at `9859bd2`.
- Old live prompt suite name failed:
  - `No matching command cases.`
  - Root cause: suite is no longer named `memory_architecture`; use `memory`, `self_awareness`, `wiki`, or `anti_drift`.

Still present but not launch-blocking:
- `spark-intelligence-builder` desktop checkout has untracked `artifacts/`.
- `spark-telegram-bot` desktop checkout has untracked `PROJECT.md`.
- `spark-memory-quality-dashboard` has untracked screenshots and `scripts/__pycache__/`.
- Builder memory inspect for the generic query `"launch readiness memory check"` showed trace-only warnings:
  - `source_swamp_resistance`: `supporting_sources_without_authority`
  - `source_mix_stability`: `single_supporting_source_dominates_packet`
  - These are not health failures; they are expected warning signals for a generic query and should block promotion only if the memory layer is being promoted from that packet.

## Open Decisions

- Whether to send live Telegram prompt cards again using the current suite names. Recommended suites:
  - `memory`
  - `self_awareness`
  - `wiki`
  - `anti_drift`
- Whether to add a new `memory_architecture` suite alias for continuity with older launch notes.
- Whether to commit dashboard screenshots/artifacts or keep them local.
- Whether to run a human-scored Telegram probe round before public launch copy goes out.
- Whether Graphiti/temporal sidecar should stay disabled until evals pass, or get a shadow-mode trial after launch.

## Constraints, User Preferences, And Do-Not-Touch Areas

- Preserve dirty user/WIP changes. Do not revert unrelated files.
- Do not reveal or print secrets.
- Use `rg` for search.
- Use `apply_patch` for manual edits.
- Keep Telegram replies concise, conversational, and human-readable.
- Current-state memory outranks wiki for mutable user facts.
- Wiki is supporting project knowledge, not live truth.
- Graphiti/sidecar hits remain advisory until evals pass.
- No conversational residue promotion.
- User-specific memory stays separate from global Spark doctrine.
- Dashboard rows are observability evidence, not prompt instructions.
- Do not clean these unless explicitly asked:
  - `C:\Users\USER\Desktop\spark-telegram-bot\PROJECT.md`
  - `C:\Users\USER\Desktop\spark-intelligence-builder\artifacts\`
  - `C:\Users\USER\Desktop\spark-memory-quality-dashboard\artifacts-*.png`
  - `C:\Users\USER\Desktop\spark-memory-quality-dashboard\scripts\__pycache__\`
- Live runtime backup/stash should not be deleted until the user is comfortable:
  - Builder stash `pre-sync-live-builder-2026-05-05`
  - Telegram backup branch `backup/live-telegram-runtime-2026-05-05`
  - Telegram stash `pre-sync-live-telegram-2026-05-05`

## Next Concrete Steps

1. Run a manual Telegram quality probe round using current suite names, not `memory_architecture`.
   - Suggested command for prompt cards: `npm run nl:live -- --profile spark-agi --send --raw-prompts --suite memory --delay-ms 7000`
   - Repeat for `self_awareness`, `wiki`, and `anti_drift` only if useful.

2. Judge actual Spark replies in Telegram for:
   - source labeling when asked
   - current-state versus supporting-recall boundaries
   - no generic status dump for memory-lack prompts
   - no promotion of test facts, jokes, or vibes as durable truth

3. Add or update live prompt suites if launch operators still expect `memory_architecture`.
   - Minimal option: add alias cases in `ops/natural-language-live-commands.json`.
   - Better option: keep suite names narrower and update runbooks/prompts.

4. Do one dashboard UX/readability pass after another export.
   - Focus on making memory movement easy to scan: captured, blocked, promoted, saved, decayed, summarized, retrieved, selected, dropped.
   - Keep human and agent views distinct.

5. Add cross-repo stop-ship tests for the exact launch regressions seen:
   - Telegram profile args must reach health runtime wrapper.
   - Builder self-awareness memory-lack route must not devolve into generic stack status.
   - Wiki status must expose family/owner/authority/freshness metadata.
   - Dashboard movement export must include stable movement counts and rows.

6. Decide Graphiti sidecar next phase.
   - Keep disabled for launch.
   - Later run shadow-mode evals before treating graph hits as more than advisory.

7. Archive old runtime backup/stashes only after launch confidence.
   - Keep them for now.
   - If deleting later, first record the commit/state they protected.

## Reactivation Prompt For Fresh Codex Chat

Paste this into a new Codex chat:

```text
Continue from the Spark memory launch/runtime handoff.

Read first:
C:\Users\USER\Desktop\spark-telegram-bot\docs\codex-handoffs\2026-05-05-spark-memory-launch-runtime-handoff.md

Repos:
- C:\Users\USER\Desktop\spark-telegram-bot
- C:\Users\USER\Desktop\spark-intelligence-builder
- C:\Users\USER\Desktop\domain-chip-memory
- C:\Users\USER\Desktop\spark-memory-quality-dashboard

Live runtime paths:
- C:\Users\USER\.spark\modules\spark-telegram-bot\source
- C:\Users\USER\.spark\modules\spark-intelligence-builder\source

Current state:
- Builder main is pushed and live runtime is synced at fc60275.
- Telegram main is pushed and live runtime is synced at 9859bd2.
- domain-chip-memory is clean at 8de77ea.
- spark-agi is healthy on port 8789.
- testerthebester is healthy on port 8788.
- spark verify --onboarding and spark verify --deep were green.
- The old nl:live suite `memory_architecture` does not exist; use `memory`, `self_awareness`, `wiki`, and `anti_drift`.

Goals:
- Finish launch-quality Telegram memory/self-awareness probing.
- Keep current-state memory authoritative over wiki/old conversation for mutable facts.
  - Current control-proof note, 2026-06-24: this is historical wording. Memory is evidence, not permission; fresh runtime state wins for mutable facts, and Harness Core decides whether any action is authorized. See `docs/SPARK_CONTROL_PROOF_DOCS_INDEX_2026-06-24.md`.
- Keep wiki supporting_not_authoritative.
- Keep Graphiti/sidecar advisory until evals pass.
- Preserve all untracked WIP/artifacts unless explicitly told to clean them.
- Use concise, source-aware, human-readable Telegram replies as the quality bar.

Start by checking git status in all four repos and both live runtime paths, then run:
- spark status --json
- spark verify --deep
- npm run health:runtime -- --profile spark-agi
- npm run health:runtime -- --profile testerthebester

Then continue with the next concrete steps from the handoff.
```
