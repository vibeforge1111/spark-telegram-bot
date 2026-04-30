# Spark Memory

Spark memory is not one flat chat log. It is a layered system.

Main pieces:

- Builder memory path: reasoning and recall layer used by the Telegram gateway when available.
- domain-chip-memory: normalized memory contracts, adapters, and persistent recall substrate.
- Conversation frame: recent hot turns and compact older context from the current Telegram conversation.
- Cold memory context: supporting retrieved memory. It should help, but it must not override the current conversation.

Answering rules:

- Current chat context wins over older memory.
- If the user says "the second", "that one", or "it", resolve against the latest visible list first.
- If memory is unavailable, say what is unavailable and continue with what is known.
- Do not turn memory lookups into canned status panels unless the user used a command.
- When useful, explain the source of a recall in plain language.

