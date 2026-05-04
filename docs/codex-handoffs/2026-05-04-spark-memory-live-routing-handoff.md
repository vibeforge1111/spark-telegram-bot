# Spark Memory Live Routing Handoff - 2026-05-04

## Repo, Path, Branch

Primary repo for this handoff:

- Repo: `spark-telegram-bot`
- Path: `C:\Users\USER\Desktop\spark-telegram-bot`
- Branch: `codex/creator-mission-status-telegram`
- Latest pushed commit: `b3e9d90 Keep memory movement probes out of Spawner routing`

Related repos in this session:

- `C:\Users\USER\Desktop\spark-intelligence-builder`
  - Branch: `codex/creator-mission-status-builder`
  - Status at handoff time: clean except untracked `artifacts/`
  - Latest relevant pushed commit from this session: `dd280ce Clamp gauntlet movement deltas to observed activity`
- `C:\Users\USER\Desktop\spark-memory-quality-dashboard`
  - Branch: `main`
  - Status at handoff time: clean
  - Recent local commits: `8bf5c58 Surface Telegram memory acceptance in dashboard`, `9e0b5f5 Show Telegram acceptance in human audit`
- `C:\Users\USER\Desktop\domain-chip-memory`
  - Branch: `main`
  - Status at handoff time: clean and tracking `origin/main`

Live runtime paths touched carefully:

- `C:\Users\USER\.spark\modules\spark-telegram-bot\source`
- `C:\Users\USER\.spark\modules\spark-intelligence-builder\source`

The live runtime checkouts are dirty and must not be broadly overwritten without review.

## Current Goal

Make Spark's memory, wiki, and self-awareness feel personal, grounded, source-aware, and continuous, rather than deterministic or status-scripted.

The immediate live issue fixed in this handoff was:

- A Telegram prompt asking `show me what memory movement the dashboard should reveal after this conversation` was incorrectly intercepted as a Spawner UI / Mission Control dashboard request.
- It should instead reach Builder self-awareness and answer with memory lifecycle movement evidence.

## What We Completed

Durable Telegram repo work:

- Added a narrow route guard so memory movement/dashboard traceability questions do not get treated as local Spawner UI link requests.
- Added a regression test proving the prompt does not route to Spawner board/local-service handling.
- Committed and pushed `b3e9d90`.

Live runtime repair:

- Hot-patched installed Telegram runtime `src/conversationIntent.ts` with the same guard.
- Hot-patched installed Builder self-awareness route recognition so `memory movement`, `dashboard should reveal`, and related prompts are recognized as self-awareness memory traceability.
- Restored missing installed Builder `llm_wiki` module files from Desktop Builder into live runtime:
  - `answer.py`
  - `query.py`
  - `promote.py`
  - `__init__.py`
- Restarted both live Telegram profiles:
  - `spark-agi@8789 pid=59400`
  - `testerthebester@8788 pid=58928`

Memory/dashboard work already completed earlier in this session:

- Builder acceptance/gauntlet movement deltas now only report positive observed activity, avoiding confusing negative rolling-window deltas.
- Telegram live prompt-card suite now includes memory architecture probes.
- Telegram prompt-card sender now fails clearly when profile secrets are unavailable instead of silently using stale unprofiled `BOT_TOKEN`.
- Dashboard exports now include Telegram acceptance/gauntlet evidence and human-facing audit panels.

## Files Touched Or Investigated

Committed files in `spark-telegram-bot`:

- `src/conversationIntent.ts`
  - Added `isMemoryDashboardTraceabilityRequest`.
  - `isLocalSparkServiceRequest` now returns `false` for memory lifecycle/dashboard evidence prompts.
- `tests/conversationIntent.test.ts`
  - Added `keeps memory movement dashboard probes out of local Spawner routing`.

Previous committed files in this session:

- `ops/natural-language-live-commands.json`
  - Added `memory_architecture` prompt suite.
- `ops/liveNlCommandSuite.ts`
  - Hardened profile-token handling.
- Builder:
  - `src/spark_intelligence/memory/acceptance.py`
  - `tests/test_memory_regression.py`
- Dashboard:
  - Memory integration panels and export surfaces.

Investigated but not durably changed in Desktop Telegram:

- `src/index.ts`
- `src/builderBridge.ts`
- `tests/builderBridge.test.ts`
- `tests/telegramMemoryGauntlet.test.ts`
- `scripts/sync-runtime.cjs`

Hot-patched live runtime files:

- `C:\Users\USER\.spark\modules\spark-telegram-bot\source\src\conversationIntent.ts`
- `C:\Users\USER\.spark\modules\spark-intelligence-builder\source\src\spark_intelligence\system_registry\registry.py`
- `C:\Users\USER\.spark\modules\spark-intelligence-builder\source\src\spark_intelligence\self_awareness\capsule.py`
- `C:\Users\USER\.spark\modules\spark-intelligence-builder\source\src\spark_intelligence\llm_wiki\__init__.py`
- `C:\Users\USER\.spark\modules\spark-intelligence-builder\source\src\spark_intelligence\llm_wiki\answer.py`
- `C:\Users\USER\.spark\modules\spark-intelligence-builder\source\src\spark_intelligence\llm_wiki\query.py`
- `C:\Users\USER\.spark\modules\spark-intelligence-builder\source\src\spark_intelligence\llm_wiki\promote.py`

## Commands And Tests Run

Status checks:

```powershell
git status --short --branch
```

Run in:

- `C:\Users\USER\Desktop\spark-telegram-bot`
- `C:\Users\USER\Desktop\spark-intelligence-builder`
- `C:\Users\USER\Desktop\spark-memory-quality-dashboard`
- `C:\Users\USER\Desktop\domain-chip-memory`
- live installed Telegram runtime
- live installed Builder runtime

Telegram tests:

```powershell
npm test -- tests/conversationIntent.test.ts tests/builderBridge.test.ts tests/telegramMemoryGauntlet.test.ts
```

Result:

- Passed. The custom runner executed the broader configured suite and all outputs were `ok`.

Live TypeScript check:

```powershell
npx tsc --noEmit
```

Result:

- Passed in live installed `spark-telegram-bot` runtime.

Builder Desktop self-awareness tests:

```powershell
python -m pytest tests/test_self_awareness.py -q
```

Result:

- `14 passed, 1 warning`

Builder live self-awareness route check:

```powershell
C:\Python313\python.exe -c "import runpy, sys; sys.path.insert(0, sys.argv[1]); sys.argv = ['spark_intelligence.cli', *sys.argv[2:]]; runpy.run_module('spark_intelligence.cli', run_name='__main__')" C:\Users\USER\.spark\modules\spark-intelligence-builder\source\src self status --home C:\Users\USER\.spark\state\spark-intelligence --human-id human:telegram:test --session-id session:telegram:test --channel-kind telegram --user-message "Show me what memory movement the dashboard should reveal after this conversation."
```

Result:

- Returned `Memory movement evidence`.
- Current movement counts in that run: `promoted=325, retrieved=10, selected=325`.

Live Telegram bridge simulation:

```powershell
$env:SPARK_BUILDER_REPO='C:\Users\USER\.spark\modules\spark-intelligence-builder\source'
$env:SPARK_BUILDER_HOME='C:\Users\USER\.spark\state\spark-intelligence'
$env:SPARK_BUILDER_PYTHON='C:\Python313\python.exe'
$env:SPARK_BUILDER_BRIDGE_MODE='required'
node -r ts-node/register -e "const { runBuilderTelegramBridge } = require('./src/builderBridge'); (async()=>{const p='show me what memory movement the dashboard should reveal after this conversation'; const r=await runBuilderTelegramBridge({update_id:1,message:{message_id:1,date:0,text:p,from:{id:8319079055,is_bot:false,first_name:'Meta'},chat:{id:8319079055,type:'private'}}}); console.log(JSON.stringify({used:r.used,mode:r.bridgeMode,routing:r.routingDecision,text:r.responseText}, null, 2));})().catch(e=>{console.error(e); process.exit(1);});"
```

Result:

- `used=true`
- `mode=self_awareness_direct`
- `routing=self_awareness_direct`
- Reply begins with `Memory movement evidence`
- Current movement counts in that run: `promoted=325, retrieved=43, selected=358`

Profile restarts:

```powershell
spark restart spark-telegram-bot --profile spark-agi
spark restart spark-telegram-bot --profile testerthebester
```

Result:

- `spark-agi@8789 pid=59400`
- `testerthebester@8788 pid=58928`

Health checks:

```powershell
Invoke-RestMethod http://127.0.0.1:8789/health | ConvertTo-Json -Compress
Invoke-RestMethod http://127.0.0.1:8788/health | ConvertTo-Json -Compress
```

Result:

- Both returned `ok=true` with the expected profile and port.

Dashboard export:

```powershell
npm run export:spark
```

Run in `C:\Users\USER\Desktop\spark-memory-quality-dashboard`.

Result:

- `Exported 20 recall events, live ledger summary, and domain-chip scorecards to public\memory-quality`
- Dashboard repo remained clean.

Earlier acceptance/gauntlet checks in Builder:

```powershell
python -m pytest tests/test_memory_regression.py tests/test_acceptance_result_to_text.py
python -m spark_intelligence.cli memory run-telegram-acceptance --output-dir artifacts\telegram-memory-acceptance-live-20260504 --write artifacts\memory-acceptance-live-20260504.json --json
python -m spark_intelligence.cli memory run-telegram-gauntlet --limit-probes --output-dir artifacts\telegram-memory-gauntlet-live-20260504-fixed --write artifacts\memory-gauntlet-live-20260504-fixed.json --json
```

Results:

- Pytest: `35 passed`
- Acceptance: `49/49 passed`, promotion gate passed
- Gauntlet: `20/20 passed`, no mismatches, no negative movement deltas

## Known Errors, Warnings, Or Failing Checks

Known live runtime warnings:

- `spark restart` warns that installed runtime code has drifted from pinned registry and has local git changes.
- Do not broad-sync over the live runtime without reviewing dirty WIP.

Known dirty state:

- Desktop `spark-telegram-bot`: untracked `PROJECT.md`, pre-existing. Do not touch unless user asks.
- Desktop `spark-intelligence-builder`: untracked `artifacts/`, runtime outputs. Do not treat as source.
- Live installed `spark-telegram-bot`: many dirty files and untracked WIP.
- Live installed `spark-intelligence-builder`: detached HEAD, many dirty files and untracked WIP, including self-awareness/LLM wiki work.

Known failing check:

```powershell
python -m pytest tests/test_self_awareness.py -q
```

Run in live installed Builder after repairing the import mismatch.

Result:

- `10 passed, 1 failed`
- Failing test: `test_self_status_cli_can_refresh_wiki_and_include_wiki_context`
- Failure: `payload["wiki_context"]["project_knowledge_first"]` is `None`, expected truthy.
- This appears to be a live dirty-runtime mismatch around wiki context shape. It does not block the memory movement route verified above, but it should be fixed before treating live Builder as fully green.

Previous error repaired:

- Live Builder CLI initially failed with:
  - `ImportError: cannot import name 'build_llm_wiki_answer' from 'spark_intelligence.llm_wiki'`
- Cause: installed runtime had incomplete `llm_wiki` package.
- Repair: copied missing `answer.py`, `query.py`, `promote.py`, and updated `__init__.py` from Desktop Builder.

Secret/token limitation:

- Non-interactive `spark secrets get ...` is blocked by Spark approval and should not be used to reveal secrets.
- `npm run health:polling` without profile env can fail with unprofiled `BOT_TOKEN` unauthorized. Prefer profile-aware health/relay checks.

## Open Decisions

- Whether to reconcile the live installed Builder runtime with Desktop Builder by a controlled sync/update, or keep the current hot patches until the dirty runtime WIP is reviewed.
- Whether to fix the live Builder wiki context field mismatch now or after the next Telegram memory probe pass.
- Whether the memory dashboard should expose a compact "last live Telegram probe" panel with prompt, route, reply class, movement counts, and pass/fail verdict.
- Whether movement counts should be rendered as absolute totals, per-turn deltas, or both in Telegram-facing self-awareness replies.
- Whether to promote the current memory hierarchy rule into global Spark doctrine or keep it as already-tested project policy. User-specific memory must stay separate from global doctrine.

## Constraints, Preferences, And Do-Not-Touch Areas

User preferences and project rules:

- Preserve existing dirty user/WIP changes.
- Do not revert unrelated files.
- Use `rg` for search.
- Commit often when making durable repo changes.
- Keep Telegram replies concise, conversational, and human-readable.
- Prefer source-labeled LLM synthesis over canned deterministic answers.
- Dashboard should have human and agent views.
- Memory dashboard should show movement: captured, blocked, promoted, saved, decayed, summarized, retrieved, selected, and dropped.
- Current-state memory outranks wiki for mutable user facts.
- Wiki is `supporting_not_authoritative`.
- Graphiti/sidecar hits stay advisory until evals pass.
- No conversational residue promotion.
- User-specific memory stays separate from global Spark doctrine.

Do not touch without explicit approval:

- Untracked `PROJECT.md` in Desktop `spark-telegram-bot`.
- Untracked Builder `artifacts/` unless cleaning runtime outputs is explicitly requested.
- Broad live runtime sync scripts that would overwrite dirty installed runtime files.
- Secrets, bot tokens, private env values, or `spark secrets get` outputs.
- Any force reset, checkout, or destructive git cleanup.

## Next Concrete Steps

1. Live Telegram probe:
   - Send to `Spark AGI`: `show me what memory movement the dashboard should reveal after this conversation`
   - Expected: `Memory movement evidence`, lifecycle rows, authority boundary, movement counts.
   - Must not mention Spawner UI / Mission Control.

2. Re-test memory-lack phrasing:
   - Send: `where does your memory still lack right now, and how would we improve it?`
   - Expected: memory-layer/source-label gaps, dashboard movement trace evidence, no stale "Builder degraded" claim unless current diagnostics prove it.

3. Fix or reconcile the live Builder wiki context mismatch:
   - Investigate why `project_knowledge_first` is `None` in live `tests/test_self_awareness.py`.
   - Compare live `llm_wiki` and self-awareness code against Desktop Builder.
   - Patch minimally or do a controlled sync after reviewing dirty runtime WIP.

4. Add dashboard trace panel for live Telegram probes:
   - Show prompt, selected route, bridge mode, movement counts, reply class, and pass/fail.
   - Keep human view concise and agent view detailed.

5. Run a real Telegram memory gauntlet manually:
   - Current vs supporting context.
   - Memory lacks/improvement.
   - Mutable fact authority.
   - Dashboard movement reveal.
   - Anti-residue promotion refusal.
   - Record actual replies and decide pass/fail.

6. Convert failures into regression tests:
   - Telegram route interception tests in `spark-telegram-bot`.
   - Builder self-awareness route/render tests in `spark-intelligence-builder`.
   - Dashboard export/render tests in `spark-memory-quality-dashboard`.

7. Decide promotion boundary:
   - Promote only stable, source-labeled architecture rules.
   - Do not promote planted probes like `Sol`, runtime mission IDs, transient status dumps, or unclosed brainstorm residue.

## Reactivation Prompt

Paste this into a fresh Codex chat:

```text
Continue from the Spark memory live-routing handoff.

Read this file first:
C:\Users\USER\Desktop\spark-telegram-bot\docs\codex-handoffs\2026-05-04-spark-memory-live-routing-handoff.md

Repos:
- C:\Users\USER\Desktop\spark-telegram-bot
- C:\Users\USER\Desktop\spark-intelligence-builder
- C:\Users\USER\Desktop\spark-memory-quality-dashboard
- C:\Users\USER\Desktop\domain-chip-memory

Rules:
- Check git status first in each repo.
- Preserve dirty user/WIP changes. Do not revert unrelated files.
- Use rg for search.
- Commit durable changes often.
- Keep Telegram replies concise, conversational, and source-aware.
- Current-state memory outranks wiki for mutable user facts.
- Wiki is supporting_not_authoritative.
- Graph/sidecar hits are advisory until evals pass.
- No conversational residue promotion.
- User-specific memory must stay separate from global Spark doctrine.
- Do not read or reveal secrets.
- Do not broad-sync live runtime over dirty WIP without inspecting exactly what would be overwritten.

Current state:
- Desktop Telegram branch is codex/creator-mission-status-telegram.
- Latest pushed Telegram commit is b3e9d90 Keep memory movement probes out of Spawner routing.
- Desktop Builder branch is codex/creator-mission-status-builder.
- Live Telegram profiles were restarted:
  - spark-agi on 8789
  - testerthebester on 8788
- Live Builder had a repaired llm_wiki import mismatch but still has one failing live self-awareness test around wiki_context.project_knowledge_first.

Start by verifying the live Telegram prompt:
show me what memory movement the dashboard should reveal after this conversation

Expected:
- route self_awareness_direct
- answer starts with Memory movement evidence
- mentions captured/saved/retrieved/promoted or selected/summarized/decayed/blocked/dropped lifecycle expectations
- includes authority boundary that movement rows are trace evidence only
- does not return Spawner UI / Mission Control

Then test:
where does your memory still lack right now, and how would we improve it?

Use the dashboard export and live route evidence to decide what to fix next. Prioritize the smallest proven gap.
```
