# Launch Conversation QA - 2026-05-08

This is the launch-day, low-risk conversation quality pass for Spark Telegram.
It improves the already-working conversation surface by testing and observing
it. It does not change memory routing, durable memory promotion, Builder bridge
contracts, provider selection, or Telegram ingress ownership.

## Launch-safe rule

Use report-only checks before launch. Do not rewrite the runtime prompt,
memory packet contract, active personality resolver, or Builder bridge flow on
launch day.

Generated chat replies are not expected to be deterministic word-for-word across
providers. Launch QA should enforce deterministic invariants instead: no leaks,
good spacing, bounded memory authority, clear next action, and no raw internal
symbols in Telegram.

Spark should stay conversational rather than sounding like a generic chat box.
Read the room: if the user is moving fast, be crisp; if they are frustrated,
acknowledge the actual friction; if they are exploring, be curious without
turning the reply into a plan dump. The agent should reciprocate the user's
energy while staying grounded and useful.

## What is already working

- Telegram conversation frames preserve recent turns and exact list artifacts.
- Short references such as "option 2", "that one", and "this" resolve against
  recent local context before old memory.
- Cold memory context is filtered and bounded before prompt injection.
- Memory directives require Builder memory-route confirmation before claiming a
  save succeeded.
- Cross-user local conversation context is isolated.
- Outbound Telegram text strips bold emphasis, replaces dash-family characters,
  chunks long replies, and redacts secrets.
- Builder self-awareness replies separate evidence boundaries from capability
  claims.
- spark-character scoring and output sanitization protect against known voice
  drift.

## Do not touch before launch

- Durable memory schemas, movement ledgers, or promotion gates.
- Builder `memory inspect-capsule` payload shape.
- Active persona resolution and agent/user/session scoping.
- Telegram ingress ownership or relay identity behavior.
- Provider routing, model switching, or Builder bridge execution paths.
- Any automatic style-to-memory learning.

## Launch conversation checks

Run the offline checks below. They do not send Telegram messages and do not
write production memory.

```powershell
cd C:\Users\USER\Desktop\spark-telegram-bot
node node_modules\ts-node\dist\bin.js tests\launchConversationQuality.test.ts
node node_modules\ts-node\dist\bin.js tests\conversationMemory.test.ts
node node_modules\ts-node\dist\bin.js tests\conversationIntent.test.ts
node node_modules\ts-node\dist\bin.js tests\builderBridge.test.ts
node node_modules\ts-node\dist\bin.js tests\outboundSanitize.test.ts
node node_modules\ts-node\dist\bin.js tests\llmProvider.test.ts
npm test
npm run build

cd C:\Users\USER\Desktop\spark-character
python -m pytest -q tests/test_scoring.py tests/test_output_sanitizer.py tests/test_persona.py tests/test_chip_loader.py

cd C:\Users\USER\Desktop\spark-intelligence-builder
python -m pytest -q tests/test_memory_orchestrator.py tests/test_telegram_generic_memory.py tests/test_telegram_episodic_memory.py tests/test_memory_validation_wrapper.py tests/test_researcher_bridge_security.py
```

## Pass criteria

- No internal subsystem leak in normal chat copy.
- No em dash or bold emphasis in outbound Telegram text.
- Paragraph spacing makes the reply easy to scan in Telegram.
- Current conversation references outrank older memory.
- Cold memory remains supporting context and does not include stale diagnostic
  failures or wiki diagnostic packets.
- Memory saves are claimed only after a confirmed Builder memory route.
- Self-awareness answers stay source-bounded and do not overclaim route health.
- Provider/runtime failures produce actionable user-facing repair copy.

## Report-only style lint

The launch QA test includes a test-only conversation style lint. It does not
modify replies at runtime and it does not write memory. It catches drift shapes
that are easy to miss in manual Telegram checks:

- single-newline paragraph joins where a blank line should separate thoughts
- decorative three-line gaps
- paragraphs that are too dense to scan
- bold Markdown and dash-family characters
- secret-like text
- internal trace, packet, exception, and CLI jargon in normal replies
- plan-dump framing where a short conversational answer would fit
- generic support-chat phrases such as "How may I assist you today?"

The same test also runs a report-safe lint over real Telegram formatter outputs
for route probes, diagnostics scans, self-awareness, and error recovery. That
variant allows bullet/list report structure, but still rejects secret-like text,
raw internal symbols, Markdown bold, dash-family characters, and plan dumps.

Golden examples live in:

```text
tests/fixtures/launchConversationGoldenReplies.ts
```

They cover setup success, setup failure, memory saved, memory unavailable,
"what do you remember?", self-awareness boundaries, route failure, unknown
answers, casual support, fast-moving users, and frustrated feedback.

Failure replies should explain the user-visible state and the next safe check.
They should not paste raw Python launcher commands, stack traces, packet names,
or route internals into Telegram.

## Telegram paragraph-spacing ruleset

Use this for launch-sensitive conversational replies, especially onboarding,
voice setup, self-awareness, memory status, and recovery messages.

- One idea per paragraph group.
- Use a blank line between the state/result and the next action.
- Keep paragraphs to one or two short sentences.
- For setup guidance, prefer:
  - result paragraph
  - blank line
  - next action paragraph
- Do not cram a final instruction directly after a dense status sentence.
- Do not create a decorative blank line after every sentence; group sentences
  that are the same thought.
- Keep slash commands inline with backticks in docs and generated examples.

Good:

```text
Nice, Kokoro is already installed for this Spark. The local voice files are connected too.

You can test it with `/voice onboard local`.
```

Good:

```text
Nice, local voice is ready: faster-whisper for listening, Kokoro for replies.

Ask me for one short voice reply, then send a quick Telegram voice note.
```

Too cramped:

```text
Kokoro is already installed for this Spark. I can see the local voice model files too, so Spark can use Kokoro for private voice replies from this machine.
Try /voice onboard local, then ask for a short voice reply.
```

Too choppy:

```text
Kokoro is already installed.

The local voice files are connected.

You can test it now.
```

## Safe post-launch hardening

After launch, in a separate hardening pass:

1. Add a real `telegram.md` spark-character surface overlay.
2. Compare Builder bridge and local fallback outputs in shadow mode.
3. Introduce a shared style packet only after offline parity tests pass.
4. Scope active persona lookup by agent, user, pairing, or explicit override.
5. Preserve memory movement traceability before changing any recall context.
