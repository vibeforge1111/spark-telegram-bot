# Natural Language Telegram Live Test Plan

This is the running matrix for testing the active Spark Telegram profile as a natural-language control surface for Spawner UI, Mission Control, Kanban, and Canvas.

## Current Improvement Targets

1. Command vocabulary: decide which phrases should launch, plan, remember, diagnose, or refuse.
2. Safety boundaries: exploratory language, low-information agreement, and "do not build yet" must not create missions.
3. Build quality: build prompts should create clean project names, useful PRDs, and canvas tasks.
4. Relay quality: Telegram should receive useful mission progress without raw JSON, hidden reasoning, or relay plumbing.
5. Board/canvas quality: missions created from Telegram should appear in Kanban buckets with task names, skills, provider summaries, and useful completion state.
6. Recovery: malformed provider output, unknown mission IDs, stale board entries, and unavailable Spawner/Builder services should produce actionable replies.

## Live Safety Rules

- Do not start another Telegram receiver while a canonical `spark-telegram-bot` process is active.
- Do not call `getUpdates` from a side script while polling is active.
- Side scripts may send outbound prompt cards with `sendMessage`; the human tester must paste the command back into Telegram for inbound testing.
- Keep destructive tests out of the default suites. Anything with `risk` of `writes_files`, `mission`, or `external` should be run deliberately.

## Before Each Live Session

1. Run `npm run health:polling`.
2. Confirm exactly one `spark-telegram-bot` `src/index.ts` receiver owns Telegram polling.
3. Confirm the relay port/profile you expect, usually `8788/default` or the named tester profile.
4. Confirm Spawner is reachable at `SPAWNER_UI_URL`.
5. Set `/access status`, then raise/lower access intentionally for the suite.

## How To Run The Matrix

List cases:

```powershell
npm run nl:live -- --list
```

Show one case:

```powershell
npm run nl:live -- --case mission-001
```

Send a prompt card to the configured test chat:

```powershell
npm run nl:live -- --send --case mission-001
```

Send a whole safe suite as prompt cards:

```powershell
npm run nl:live -- --send --suite smoke
```

Send through a named Spark Telegram profile:

```powershell
npm run nl:live -- --profile spark-agi --send --suite smoke
```

The prompt card tells the human tester what to paste into Telegram and what to observe. It does not simulate inbound Telegram updates.

## Session Log

| Date | Case | Actual route/outcome | Issue | Fix/Test added |
| --- | --- | --- | --- | --- |
| 2026-04-26 | baseline | Added matrix and outbound prompt runner | Need live receiver cleanup before inbound suite | Pending |
| 2026-04-26 | smoke-001 | `/status` returned Builder bridge online, Spark launch core online, admin access | None | Keep as passing smoke baseline |
| 2026-04-26 | smoke-002 | `/diagnose` succeeded overall but checked `:8788` while active `spark-agi` relay is `:8789` | Diagnose hardcoded default relay port; misleading in multi-agent mode | Updated diagnose to read `TELEGRAM_RELAY_PORT` and `SPARK_TELEGRAM_PROFILE`; added env and relay identity mismatch unit tests |
| 2026-04-26 | smoke-003 | `/board` showed 0 running, 5 completed, 1 failed | Diagnose board snapshot had transient running count during ping | Wording changed to "Mission board snapshot after ping" |
| 2026-04-26 | live-local-diagnose | Live installed diagnose now reports `Bot mission relay (:8789/spark-agi): ✅`; only `:8789` is listening for Telegram relay traffic | None | Restarted `spark-telegram-bot --profile spark-agi`; verified `/health` identity |
| 2026-04-26 | prompt-runner | Desktop prompt sender failed with `400: chat not found` because it used the default bot token while the live receiver uses `spark-agi` profile token | Prompt runner was not profile-aware | Added `--profile spark-agi` support to load Spark profile env and matching Telegram profile secret |
| 2026-04-26 | relay-isolation-smoke | Restarting services briefly produced both `:8788/default` and `:8789/spark-agi` relays | Default relay must not coexist during profile-specific testing | Stopped default relay, verified only `:8789/spark-agi` and Spawner `:5173` listening |
| 2026-04-26 | prompt-card-ux | Prompt cards arrived in Telegram, but the required next action was not obvious enough | Test cards looked like test output instead of an instruction to send the command back to the bot | Reworded cards to put "Send this as a new message to the bot" and the command at the top |
| 2026-04-26 | autostart-profile-isolation | Default relay `:8788` kept resurrecting after checks | Windows Startup fallback still ran `spark start telegram-starter` before `spark-agi`, which starts the default receiver | Patched Spark CLI autostart generation to start `spawner-ui` plus configured profile bots; regenerated Startup fallback and verified `:8788` stays down |
| 2026-04-26 | mission-control-001 | `/mission status spark-not-a-real-id` returned an empty synthetic mission status | Spawner status treated unknown IDs as real missions with no providers | Spawner command endpoint now returns `ok:false` for unknown missions; Telegram respects `ok:false` instead of formatting empty providers |
| 2026-04-26 | mission-control-002 | `/mission pause not-spark-id` claimed the pause command executed | Telegram accepted syntactically fake IDs, and Spawner paused unknown/no-session IDs | Telegram now rejects non-`spark-*` mission IDs with example usage; Spawner pause rejects unknown/no-session missions |
| 2026-04-26 | restart-profile-isolation | `spark restart spawner-ui` started the default bot as a dependency | Spark CLI restart path bypassed the profile-aware start/autostart logic | Patched restart path to start configured Telegram profiles instead of default bot; verified only `:8789/spark-agi` and `:5173` remain after restart |
| 2026-04-26 | mission-001 | `/run say exactly OK` created `spark-1777187604619`, posted Kanban link, relayed `Codex says: OK`, and completed on board | None | Mark as passing mission relay baseline; board shows Codex provider summary `OK` |
| 2026-04-26 | stale-board-cleanup | A previous malformed `/mission pause not-spark-id` left `not-spark-id` in persisted Mission Control state | Relay persistence accepted malformed mission IDs and could keep them visible on `/board` | Spawner relay now only persists `spark-*` mission IDs, sanitizes loaded state, and skips invalid board entries; stale persisted IDs removed |
| 2026-04-26 | stale-process-cleanup | `:8788/default` reappeared while validating fixes | Old pre-patch shell commands were still in flight and ran `spark start/restart spark-telegram-bot` without a profile | Stopped stale default-start process chain; verified only `:8789/spark-agi` and `:5173` are listening |
| 2026-04-26 | stale-running-board | After a Spawner restart, two old missions reappeared as Running even though their newest events were from the previous day | Mission Control board trusted persisted non-terminal relay history forever | Board now hides stale non-terminal missions after the configured stale window; focused tests cover stale running suppression; live board is 0 running / 0 paused / 6 completed / 1 failed |
| 2026-04-26 | installed-cli-profile-isolation | `spark restart spawner-ui` still started `spark-telegram-bot` default before `spark-agi` | The active Spark CLI checkout was editable from `Desktop/spark-cli` and still started the default receiver whenever profiles existed | Patched CLI start/restart/runtime expectation behavior so configured Telegram profiles replace default bot startup; focused CLI tests pass |
| 2026-04-26 | guard-001 | Planning prompt about whether to build Mission Control before canvas replied with the local Spawner URL and stale diagnostic-agent note | Local-service classifier saw "mission control dashboard" before the ideation classifier and mistook planning language for "open/show UI" | Ideation now suppresses local-service routing for planning prompts; added regression test; rebuilt/restarted `spark-agi` |
| 2026-04-26 | guard-001-retry | Same planning prompt now gave a product-reasoning answer: mission control first, two scope directions, and one clarifying question | None | Passing. Board stayed 0 running / 0 paused / 6 completed / 1 failed; only `:8789/spark-agi` and `:5173` listening |
| 2026-04-26 | telegram-style-001 | Passing guardrail reply still used Markdown bold markers and longer paragraphs than ideal for Telegram | Style rule only lived in prompt taste, not as a deterministic sanitizer or upstream character rule | Bot sanitizer strips paired Markdown emphasis while preserving bullets; LLM prompt asks for short skimmable paragraphs; same rules added to `spark-character` persona, critic, chip-rendered invariants, and sanitizer |
| 2026-04-26 | spark-character-auto-style-001 | `spark-character` auto-loop can now mine Telegram style failures from production outbound logs | Auto-evolution previously could see em dash/plumbing/reset/hedge issues, but not Markdown emphasis or dense opening paragraphs | Audit miner now emits `markdown_emphasis` and `dense_opening` diagnose lines; desktop and live `spark-character` suites pass 55 tests |
| 2026-04-26 | guard-002 | `maybe we should build a tiny kanban app...` returned mission disambiguation help instead of product ideation | Ideation classifier missed tentative "maybe we should build..." and "what would be the best first version" phrasing, so the message fell through to the Builder bridge | Added ideation patterns and exact regression test; desktop/live bot tests and builds pass; restarted `spark-agi` |
| 2026-04-26 | guard-002-retry | Kanban v1 prompt returned product ideation: fixed columns, simple cards, persistence, local-first scope, browser-vs-Telegram and Spawner-link questions | None | Passing. No Markdown emphasis markers; board stayed 0 running / 0 paused / 8 completed / 1 failed; only `:8789/spark-agi` and `:5173` listening |
| 2026-04-26 | guard-003 | `that sounds good` acknowledged prior kanban context and asked whether to shape a Spawner mission or discuss more | Mildly eager wording, but no mission launched | Passing safety gate. Board stayed 0 running / 0 paused / 9 completed / 1 failed; relay health `spark-agi@8789` |
| 2026-04-26 | guard-004 | `what were we going to build again?` recalled the older completed Spark Diagnostic Agent instead of the live kanban app thread | Recall prioritized completed-build memory from session context before newer planning context | Added kanban planning recall that wins over older completed-build memory; exact regression test passes; rebuilt/restarted `spark-agi` |
| 2026-04-26 | telegram-spacing-001 | Canned recall replies rendered as tight single-newline blocks in Telegram | Context-recall helper joined paragraph sentences with `\n` instead of blank-line paragraph breaks | Recall replies now join paragraphs with `\n\n`; tests assert spacing for Diagnostic Agent and kanban recall; rebuilt/restarted `spark-agi` |
| 2026-04-26 | build-004 | `please help me design... with kanban and canvas, but do not build yet` was misrouted as a mission update link preference | Preference parser treated plain `kanban and canvas` as `links: both` without requiring update/link preference language | Preference parser now requires explicit update/link wording; design/plan/scope and `do not build yet` route to ideation; focused tests pass; rebuilt/restarted `spark-agi` |
| 2026-04-26 | telegram-spacing-002 | Mission update preference acknowledgements used a single newline after the saved-preference sentence | Preference acknowledgement formatting was inline in the text handler and joined all lines with `\n` | Added tested acknowledgement formatter that inserts blank-line paragraph spacing; rebuilt/restarted `spark-agi` |
| 2026-04-26 | build-004-retry | Relay Workshop prompt returned design-only project shaping: kanban side, canvas side, shared data store, linking behavior, and v1 questions | Minor style note: still a little list-heavy, but clear and useful | Passing. No mission launched; board stayed 0 running / 0 paused / 9 completed / 1 failed; relay health `spark-agi@8789` |
| 2026-04-26 | guard-004-retry | `what were we going to build again?` returned current kanban context with a direct opener and blank-line paragraph spacing | None | Passing. No `Yes.` opener, no mission launched; board stayed 0 running / 0 paused / 9 completed / 1 failed; relay health `spark-agi@8789` |
