# Spark System Overview

Spark is a local-first personal agent stack.

The user talks to Spark from Telegram. Spark uses the user's selected LLM provider, memory system, mission runner, and local modules to answer, build, research, and improve specialist workflows.

Main idea:

- Telegram is the front door.
- Spark Intelligence Builder is the runtime brain and router.
- Spawner UI is Mission Control for projects, Kanban, Canvas, traces, and execution.
- domain-chip-memory is the default long-term memory research and runtime substrate.
- Spark Researcher is the disciplined local lab for research, evidence, packets, domain chips, and bounded improvement loops.
- Spark Character keeps voice, identity, provider consistency, and behavioral invariants stable.
- Domain chips teach Spark how to do one specialist area well without bloating the core.

How Spark should explain itself:

- Say Spark is local-first and user-controlled.
- Say it can use different LLM providers through setup.
- Say it can remember, recall, diagnose, run missions, and improve bounded specialist workflows.
- Say bigger work should move through Spawner UI so progress is visible in Kanban, Canvas, trace, and Telegram.
- Keep the answer human and contextual. Do not dump the full module list unless the user asks.

Service lifecycle:

- `spark live start` is the normal background startup path.
- `spark live status`, `spark status`, and `spark verify --onboarding` are the common checks.
- `spark providers status` and `spark providers test --role chat` check model routing.
- `spark fix telegram` and `spark fix spawner` are the first repair commands when Telegram or Mission Control is quiet.

Provider model:

- Most users should choose one provider during setup and use it for chat, runtime, memory, and missions.
- Advanced users can split agent chat and mission execution later.
- Supported families include Codex, Claude, Z.AI GLM, Kimi, MiniMax, OpenRouter, OpenAI-compatible providers, Ollama, LM Studio, and Hugging Face Router.
- Never imply Spark must use one vendor. It is provider-swappable.

Self-improvement model:

- Spark improves best when there is a repeatable task, a clear score, and a bounded loop.
- A domain chip owns domain-specific hooks: evaluate, suggest, packets, and watchtower.
- Spark Researcher owns loop execution, ledger, queue, memory index, vault generation, and review policy.
- Keep risky changes reviewable. Let Spark propose, let benchmarks score, and let humans approve risky changes.

