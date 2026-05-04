# Codex Handoff: Railway Spawner Auth And Hosted Build Hardening

Date: 2026-05-04

## Repo And Branch

- Primary repo: `C:\Users\USER\Desktop\spark-telegram-bot`
- Branch: `codex/creator-mission-status-telegram`
- Current branch status at handoff time: clean tracked files, with unrelated untracked `PROJECT.md`
- Recent relevant commits on branch:
  - `b3e9d90 Keep memory movement probes out of Spawner routing`
  - `b7ec27e Add live memory architecture prompt cards`
  - `9be2710 Use separate Spawner UI and bridge auth headers`
  - `55ccf03 Quiet Telegram mission link previews`

Related repos touched or investigated in this launch-hardening session:

- `C:\Users\USER\Desktop\Spark-Agent-Site`
- `C:\Users\USER\Desktop\spark-cli`
- `C:\Users\USER\Desktop\vibeship-spawner-ui`
- Clean deploy worktree created for Railway upload: `C:\Users\USER\Desktop\spark-telegram-bot-auth-deploy`

## Current Goal

Harden the hosted Railway/Docker Spark setup so Telegram, the mission relay, Spawner UI, provider routing, hosted previews, docs, and user-facing diagnostics work cleanly for self-hosted users.

The most recent focus was fixing Railway `/diagnose` and `/run` failures where Telegram chat could reach Z.AI successfully, but Spawner UI returned HTTP 401 and mission builds failed with a misleading provider-auth message.

## Completed

- Identified the Railway `/diagnose` failure as a bot-to-Spawner auth-header mismatch, not a Z.AI provider-auth failure.
- Verified Z.AI chat completion itself returned success during direct smoke testing.
- Patched Telegram bot Spawner auth headers so hosted UI auth and bridge/control auth can use different secrets:
  - `x-api-key` now uses `SPARK_BRIDGE_API_KEY` first, with legacy fallbacks.
  - `x-spawner-ui-key` now uses `SPARK_UI_API_KEY`, falling back to the control key only when no separate UI key is configured.
- Added/updated tests proving the bot sends separate bridge and UI keys.
- Deployed the auth fix to Railway production for `spark-telegram-bot`.
- Confirmed Railway production deployment reached `SUCCESS`.
- Confirmed production logs showed:
  - `Spark: LAUNCH CORE READY`
  - `LLM: CONNECTED`
  - `Starting Spark Telegram bot...`
  - Mission relay pointed at Railway internal relay URL.
- Confirmed post-deploy Telegram smoke:
  - `/diagnose` showed Spawner UI reachable and mission ping passing for `zai`.
  - `/model status` showed `Missions: zai (default)`.
  - `/run` used `Z.AI GLM` instead of falling back to Codex.
  - Mission board links used `https://spawner-ui-production.up.railway.app/...` instead of Railway internal URLs.
- Patched mission relay task-start formatting so provider-only labels such as `zai` are not printed as raw standalone Telegram lines.
- Earlier in the same hardening thread:
  - Improved Telegram mission UX to suppress low-signal heartbeat messages.
  - Disabled Telegram link previews for mission/canvas/preview URLs.
  - Hardened provider docs and hosted Railway guidance on the site.
  - Added hosted Codex API-key path support in `spark-cli`.
  - Updated Spawner image/runtime handling for hosted Codex CLI state under `/data/codex`.
  - Deployed Spawner UI to Railway and verified Codex CLI and Claude Code availability in the image.
  - Ran successful Telegram direct-build smoke flows for static cafe, beauty salon, and bakery pages before the later auth-key mismatch surfaced.

## Files Touched Or Investigated

Primary bot repo:

- `src/spawnerAuth.ts`
  - Touched. Split auth header generation between control key and hosted UI key.
- `tests/spawner.test.ts`
  - Touched. Added separate `SPARK_UI_API_KEY` test coverage and restore logic.
- `src/telegram.ts`, `src/telegramText.ts`, mission relay formatting modules
  - Touched earlier in session for quieter Telegram mission updates and link-preview behavior.
- `tests/telegram*.test.ts`, `tests/*mission*.test.ts`, diagnostics/provider tests
  - Touched or exercised earlier in session.
- `PROJECT.md`
  - Untracked user/local file. Do not stage unless user explicitly asks.
- `docs/codex-handoffs/2026-05-04-railway-spawner-auth-handoff.md`
  - This handoff.

Spawner UI repo:

- `src/lib/server/hosted-ui-auth.ts`
  - Investigated. Hosted UI gate validates `x-spawner-ui-key` against `SPARK_UI_API_KEY`.
- `src/routes/api/spark/run/+server.ts`
  - Investigated. Spawner control route validates `x-api-key` against `SPARK_BRIDGE_API_KEY`.
- Docker/runtime files
  - Previously changed to persist Codex state under `/data/codex`.

Spark CLI repo:

- Hosted provider setup, Docker verification, and Codex API-key hosted path files were updated earlier.

Spark-Agent-Site repo:

- Provider docs, hosted Railway docs, feedback/self-improvement docs, and related docs pages were revised earlier.

## Commands And Tests Already Run

Primary bot repo:

```powershell
npm test
npm run build
git diff --check -- src/spawnerAuth.ts tests/spawner.test.ts
git status --short --branch
git add src/spawnerAuth.ts tests/spawner.test.ts
git commit -m "Use separate Spawner UI and bridge auth headers"
git push origin codex/creator-mission-status-telegram
```

Railway deploy:

```powershell
railway whoami
git worktree add C:\Users\USER\Desktop\spark-telegram-bot-auth-deploy 9be2710
railway link --project e138a694-1f2a-428d-874b-84c596ce716a --environment production --service spark-telegram-bot
railway up --service spark-telegram-bot --environment production --detach
railway deployment list --service spark-telegram-bot --environment production
railway logs --service spark-telegram-bot --environment production --lines 80
```

Railway deployment result:

- Deployment id: `26b5f2bd-22c6-4b5b-a916-6f1bc336adbb`
- Status: `SUCCESS`

Telegram prompts already used successfully before the final auth mismatch:

```text
/diagnose
/run Build a tiny static landing page for a cafe with a menu section. Use plain HTML, CSS, and JavaScript. No build step.
/run Build a tiny static landing page for a beauty salon with a menu section. Use plain HTML, CSS, and JavaScript. No build step.
/run Build a tiny static landing page for a bakery. Use plain HTML, CSS, and JavaScript. No build step. Include a hero, menu section, hours, location, and one small interactive filter for menu categories.
```

Telegram prompts requested after the latest production deploy:

```text
/diagnose
/model status
/run Build a tiny static landing page for a flower shop. Use plain HTML, CSS, and JavaScript. No build step. Include a hero, product categories, opening hours, location, and one interactive category filter.
```

## Known Errors, Warnings, Or Failing Checks

- Before `9be2710`, `/diagnose` showed:
  - `Spawner UI (:3000): ❌ HTTP 401`
  - `No provider metadata available from Spawner UI`
  - `Mission board: ❌ unreachable`
- Before `9be2710`, `/run` could falsely report provider authentication failure even when Z.AI chat completion was healthy, because Spawner UI auth rejected the bot first.
- `railway deployments` failed because this CLI version uses `railway deployment list`.
- Initial Railway deploy attempt failed while CLI was logged out:
  - `Unauthorized. Please login with railway login`
  - User logged in afterward and deploy succeeded.
- `npm test` emitted Node SQLite experimental warnings. Tests still passed.
- `git diff --check` emitted LF-to-CRLF warnings on Windows. No whitespace errors were reported.
- `PROJECT.md` remains untracked in `C:\Users\USER\Desktop\spark-telegram-bot`.
- `SPARK_UI_API_KEY` was exposed in earlier local debugging output. Rotate it after current smoke testing.
- Latest post-deploy Telegram verification confirmed the Spawner 401, Codex fallback, and internal-link issues are resolved. Preview-link open/browser QA is still pending.

## Open Decisions

- Whether to merge/pin the bot branch into the user-facing release path after Telegram smoke confirms the Spawner 401 is gone.
- Whether to rotate `SPARK_UI_API_KEY` immediately after smoke testing, then re-run `/diagnose`.
- Whether mission provider default should remain Z.AI for hosted smoke or be switched to another API provider for broader public release testing.
- Whether to make diagnostics explicitly distinguish:
  - Spawner UI auth failure
  - Spawner bridge/control auth failure
  - LLM provider auth failure
- Whether to add a hosted self-test endpoint or richer `/diagnose` line that verifies the bot is using both expected Spawner auth headers without leaking secret values.
- Whether to remove the "Spark is preparing the preview" Telegram message entirely, as the user found it low-value.
- Whether to continue API-provider smoke coverage for MiniMax, OpenAI-compatible, OpenRouter, and hosted Codex API-key paths.

## Constraints And Preferences

- Use `apply_patch` for manual file edits.
- Do not stage or commit unrelated `PROJECT.md` in `spark-telegram-bot`.
- Do not revert user changes.
- Commit narrowly and test before pushing.
- Preserve concise Telegram replies.
- Avoid user-facing "Spark brain".
- Avoid making "Builder" the default user mental model.
- Current wording preferences:
  - Agent = Telegram chat, runtime reasoning, memory, and recall.
  - Mission = Spawner/Mission Control builds, research, coding, and longer tracked work.
  - Users can choose one default provider for both Agent and Mission, or split them during setup.
- Hosted/self-hosted product direction:
  - Users should host their own Spark services in their own Railway/GitHub/cloud accounts by default.
  - Do not design toward VibeForge hosting every user's private runtime.
  - Keep secrets, memory, private repos, and generated work private by default.
- Railway hosted recommendations:
  - Prefer API-key providers for cloud hosting.
  - Do not recommend OAuth-based local CLIs like Codex/Claude Code as the primary hosted cloud path.
  - Local LLMs are not a smart default on Railway; use local/private models on the user's own machine or a properly provisioned GPU host.
- Documentation/product direction:
  - Feedback docs should be about high-signal feedback and repo routing, not mixed with self-improvement.
  - Self-improvement docs should separately explain researcher, autoloops, benchmarks, specialization paths, and diagrams.

## Next Concrete Steps

1. Deploy the provider-only task-label polish if not already deployed, then rerun a short `/run` smoke and confirm no standalone `zai` line appears after "Step 1".
2. Confirm the hosted preview link from the flower-shop run opens in a browser and renders the static page.
3. Rotate `SPARK_UI_API_KEY`, update the bot and Spawner Railway services consistently, then re-run `/diagnose`.
4. Remove or reduce the low-value "Spark is preparing the preview" Telegram message if the user still wants it gone.
5. Continue hosted-provider hardening:
   - MiniMax API smoke
   - Z.AI JSON-file hosted build smoke
   - Codex API-key hosted path docs/smoke
   - clearer hosted Railway troubleshooting docs for Spawner auth vs provider auth.
6. Smoke a deliberate staging failure, such as a bad provider key, and verify diagnostics name the correct broken layer.
7. Decide whether this branch is ready to merge/pin for the launch installer path.

## Reactivation Prompt

Paste this into a fresh Codex chat:

```text
We are continuing Spark Railway/Docker launch hardening from a handoff.

Read this first:
C:\Users\USER\Desktop\spark-telegram-bot\docs\codex-handoffs\2026-05-04-railway-spawner-auth-handoff.md

Primary repo:
C:\Users\USER\Desktop\spark-telegram-bot

Related repos:
C:\Users\USER\Desktop\Spark-Agent-Site
C:\Users\USER\Desktop\spark-cli
C:\Users\USER\Desktop\vibeship-spawner-ui

Current branch:
codex/creator-mission-status-telegram

Important recent bot commits:
9be2710 Use separate Spawner UI and bridge auth headers
3eb0e59 Align hosted mission routing links

Latest production Railway bot deployment before provider-line polish:
6ad99a31-d806-4bf5-bb08-e8751cf73984

The last root cause was bot-to-Spawner auth mismatch:
- Spawner hosted UI gate expects x-spawner-ui-key = SPARK_UI_API_KEY.
- Spawner bridge/control routes expect x-api-key = SPARK_BRIDGE_API_KEY.
- The bot used to send the bridge key for both, causing HTTP 401 from Spawner UI and misleading provider-auth failures.
- This has been patched, tested, pushed, and deployed.
- Follow-up fixes made `/run` inherit the Agent provider when Mission is not split and made Telegram mission links prefer SPAWNER_UI_PUBLIC_URL.

Start by:
1. Re-read git status in C:\Users\USER\Desktop\spark-telegram-bot and do not stage PROJECT.md.
2. Check whether the provider-only task-label polish has been committed/deployed.
3. Ask me for or inspect the next Telegram /run output and confirm no raw standalone provider line appears.
4. Help rotate SPARK_UI_API_KEY safely and re-test /diagnose.
5. Continue MiniMax and hosted provider smoke coverage.

Constraints:
- Use apply_patch for manual edits.
- Do not revert user changes.
- Do not stage unrelated PROJECT.md.
- Commit narrowly and test before pushing.
- Keep Telegram UX concise.
- Avoid user-facing "Spark brain" wording.
```
