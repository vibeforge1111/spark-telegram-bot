# Context Window Live Test Plan

This plan tests whether Spark keeps a useful same-session context window in the Telegram product path.

## Goal

Spark should understand short follow-ups like "do the second one" by using the nearest relevant conversation artifact, while still letting explicit access changes, memory recall, and capability denials work naturally.

## Test Tiers

1. UX regression smoke
   - Command: `npm run context:ux`
   - Runs the short, high-signal regressions before touching context or memory routing.
   - Covers stale memory override, same-session code-word recall, choice-list acknowledgement, and short option follow-ups.
   - Isolated `SPARK_GATEWAY_STATE_DIR`, random test user, no live polling.

2. Handler acceptance
   - Command: `npm run context:live -- --allow-fail`
   - Uses Telegram-shaped update payloads through `handleTextMessage`.
   - Uses the real Builder bridge when available and the real chat LLM fallback.
   - Isolated `SPARK_GATEWAY_STATE_DIR`, random test user, no live polling.

3. Stress handler acceptance
   - Command: `npm run context:live -- --stress --allow-fail`
   - Adds distractor turns before resolving an older numbered option.
   - Good for checking warm summary and artifact survival.

4. Human true-inbound Telegram
   - Command: `npm run nl:live -- --suite context_window --profile testerthebester --send`
   - Sends prompt cards to Telegram.
   - A human pastes each prompt to the real bot.
   - This is the only safe true-inbound Telegram tier while the live bot owns polling.

## What We Score

- Access continuity: "Change it to 4" after an access request updates access.
- List continuity: "Let's do the second one" after a numbered list follows the list, not access Level 2.
- Choice-list restraint: "I am choosing between..." stores options without picking one early.
- Context after distractors: short references survive several unrelated turns.
- Capability steering: blocked research/build requests name the needed access level.
- Same-session memory: explicit code words can be recalled later.
- Stale-context resistance: newer explicit user intent wins over older summaries and persistent memories.

## Known Limits

- Bot API cannot safely create inbound user messages while the production bot owns `getUpdates`.
- The automated harness bypasses Telegraf middleware and calls the exported text handler directly.
- Slash commands are covered by existing command tests and the prompt-card suite, not the handler harness.
- Long-context quality needs periodic real conversations, not only synthetic probes.

## Research Shape

This plan follows the same general direction as current agent memory systems:

- Keep recent turns verbatim and compact older turns.
- Preserve exact artifacts like numbered lists separately from summaries.
- Retrieve cold memory as supporting evidence, never as higher priority than the newest user message.
- Test for lost-in-the-middle behavior with facts placed before, inside, and after distractor turns.

Useful references:

- Google ADK context compaction: https://google.github.io/adk-docs/context/compaction/
- LangGraph short-term and long-term memory: https://docs.langchain.com/oss/python/langgraph/add-memory
- Letta and MemGPT context window management: https://docs.letta.com/guides/agents/architectures/memgpt
- Lost in the Middle: https://arxiv.org/abs/2307.03172

## Release Gate

Before claiming the context window is ready:

- `npm run context:ux` should pass before and after context-routing changes.
- `npm run context:live -- --allow-fail` should pass all core checks.
- `npm run context:live -- --stress --allow-fail` should pass all stress checks or produce a documented gap.
- `npm run nl:live -- --suite context_window --profile testerthebester --send` should be run manually once against the live bot.
- `/context` should show hot turns, artifacts, compaction events, and safe input budget after the live test.
