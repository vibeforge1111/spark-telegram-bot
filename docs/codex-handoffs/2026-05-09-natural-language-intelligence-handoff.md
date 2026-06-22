# Spark Natural Language Intelligence Handoff

Date: 2026-05-09

## Purpose

This is the handoff for a parallel terminal owning Spark's natural-language intelligence layer.

This lane is not only about recursive loops. It covers every place where a human talks to Spark and expects it to understand intent from wording, style, recent context, and the current work-in-progress.

The goal is to make Telegram feel like a real conversational control surface for Spark:

- normal chat,
- build requests,
- creator-system setup,
- recursive loops,
- Workspace reports,
- memory/wiki actions,
- access changes,
- local service questions,
- provider/model routing,
- review decisions,
- and follow-up language like "run it", "make this better", "where did we land?", "show me proof", or "what needs my call?"

## Current State

Recent commits in `spark-telegram-bot`:

- `0e107b0 Add contextual recursive Telegram intents`
- `adfee5e Broaden contextual recursive phrasing`
- `1dbe4d2 Resolve recursive intents from workspace context`
- `dede650 Use working context for creator intents`

Recent docs commits in `spark-domain-chip-labs`:

- `0e604ba Document natural recursive loop workflow`
- `89b06eb Add conversational follow-up examples`
- `419c081 Document contextual recursive intent safety`
- `2fcc84e Document context-aware creator followups`

Live Spark AGI runtime has been mirrored manually in:

`C:\Users\USER\.spark\modules\spark-telegram-bot\source`

Current live status after restart:

- Spark AGI relay is OK on `spark-agi@8789`.

## Files To Own

Primary source:

- `C:\Users\USER\Desktop\spark-telegram-bot\src\conversationIntent.ts`
- `C:\Users\USER\Desktop\spark-telegram-bot\src\index.ts`
- `C:\Users\USER\Desktop\spark-telegram-bot\tests\conversationIntent.test.ts`

Docs:

- `C:\Users\USER\Desktop\spark-telegram-bot\docs\QA_OPERATOR_TELEGRAM_RECURSION.md`
- `C:\Users\USER\Desktop\spark-domain-chip-labs\docs\creator_system\NATURAL_LANGUAGE_RECURSIVE_LOOP_GUIDE.md`

Live runtime mirror, only after desktop source passes:

- `C:\Users\USER\.spark\modules\spark-telegram-bot\source\src\index.ts`
- `C:\Users\USER\.spark\modules\spark-telegram-bot\source\docs\QA_OPERATOR_TELEGRAM_RECURSION.md`

## Boundaries

The natural-language terminal should own:

- phrase coverage,
- context-window routing,
- false-positive prevention,
- intent confidence rules,
- style/persona-aware wording,
- natural-language benchmark cases,
- docs for what people can say,
- and eventually a dedicated benchmark/eval suite for language routing.

Avoid changing:

- recursive execution internals,
- Workspace sync contracts,
- Spark Swarm bridge auth/session code,
- benchmark/autoloop runtime semantics,
- or any code that mutates Workspace state unless the change is strictly about intent routing into an existing command.

If a routing change needs a new recursive command behavior, hand it back to the recursive-control terminal.

## Key Design Rule

Natural language should be context-aware, not keyword-trigger-happy.

Use recent working context before routing. The current implementation uses roughly the last 10-15 Telegram turns for ambiguous follow-ups.

Good:

- "make this better with benchmarks and autoloops" after discussing Spark QA Operator plans a QA Operator creator mission.
- "where did we land?" after `/recursive sessions` reports the active/recent Workspace recursion.
- "show me proof for the frontier benchmark" resolves the visible Workspace loop.

Bad:

- "what's next?" during generic product planning should not become `/recursive report`.
- "make this better" without a clear subject should not create a vague creator mission.
- "status" should prefer pending mission state when a mission is pending, not old recursive context.
- Long-term memory should not override recent chat when deciding what "this" means.

## Current Natural-Language Surfaces

Existing parser areas in `conversationIntent.ts` include:

- build context recall,
- shipped project improvement,
- local service questions,
- Spawner board questions,
- domain-chip creation,
- creator mission setup,
- recursive command intent,
- memory/wiki routing,
- Spark self-improvement planning,
- access control questions,
- mission update preferences,
- and low-information reply suppression.

The live runtime has some natural creator logic embedded in `src/index.ts`, so keep desktop and live source aligned carefully.

## Recommended Next Work

1. Build a natural-language intent matrix.

   Create a structured fixture that maps:

   - current message,
   - last 10-15 messages,
   - expected route,
   - expected command payload,
   - why it should route,
   - why nearby false positives should not route.

2. Expand tests by scenario, not only by phrase.

   Recommended buckets:

   - active build planning,
   - pending creator mission,
   - active recursive loop,
   - Workspace session list just shown,
   - memory/wiki conversation,
   - access-control conversation,
   - plain ideation,
   - ambiguous "it/this/that" follow-ups,
   - non-admin messages,
   - and old context drift.

3. Add route confidence labels.

   Suggested shape:

   - `route`
   - `confidence`
   - `context_source`
   - `matched_signals`
   - `blocked_by`

   This can stay internal at first; it will help benchmark and debug why Spark routed a message.

4. Add conversational style variants.

   Include direct, casual, founder-ish, non-technical, terse, typo-heavy, and exploratory wording.

   Examples:

   - "where are we with the QA thing?"
   - "can you make that smarter with evals?"
   - "proof?"
   - "ship another pass on this"
   - "did it actually improve or nah?"
   - "what needs me?"

5. Connect to Spark Character.

   The parser should not become a pile of random phrases. Use Spark Character/personality docs to keep replies warm, concise, and human, while the routing stays typed and conservative.

6. Create a dedicated natural-language skill or benchmark pack.

   Candidate artifact:

   - `domain-chip-spark-natural-language-router`
   - benchmark pack for routing and false positives,
   - specialization path for improving language-router behavior,
   - autoloop policy that can propose new phrases only when tests prove no regressions.

## Validation Commands

Desktop:

```powershell
cd C:\Users\USER\Desktop\spark-telegram-bot
npx ts-node tests/conversationIntent.test.ts
npm run build
```

Live runtime mirror:

```powershell
cd C:\Users\USER\.spark\modules\spark-telegram-bot\source
npm run build
```

Smoke test live parser in test mode as needed:

```powershell
$env:SPARK_BOT_TEST_MODE='1'
$env:BOT_TOKEN='0:test'
$env:ADMIN_TELEGRAM_IDS='1000000001'
node -e "(async()=>{const mod=await import('./dist/index.js'); console.log(mod.parseNaturalRecursiveCommandIntent('where did we land?', { recentMessages: ['Spark recursive loops', 'Spark QA Operator - path:spark-qa-operator'] }));})()"
```

Restart live bot after mirroring:

```powershell
spark restart spark-telegram-bot --profile spark-agi --allow-dirty-runtime
spark live status
```

## Release Rule

Do not treat natural-language expansion as stable unless each new route has:

- a positive test,
- a nearby false-positive test,
- context-window behavior verified,
- and no route priority regression for pending creator missions or explicit slash commands.

## Coordination With Recursive Terminal

The recursive terminal will keep working on:

- recursive loop execution,
- Workspace sync,
- report/trace/review clarity,
- QA Operator recursion quality,
- benchmark/autoloop readiness,
- and gated Swarm review packets.

Natural-language terminal should route into these surfaces but not change their execution semantics without coordination.
