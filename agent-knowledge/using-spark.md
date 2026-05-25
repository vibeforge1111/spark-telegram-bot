# Using Spark

Spark is the user's local agent system. Telegram is the conversational front door. Spawner UI is the mission and execution plane. Builder, Researcher, memory, skills, and model providers sit behind the scenes.

Common surfaces:

- Telegram: conversation, commands, mission updates, and compact operator feedback.
- Spawner UI: Kanban, Canvas, trace, and mission execution views.
- Builder: planning, reasoning, memory, and routing.
- Researcher: research, evidence, advisories, and domain-chip support.
- Skills: project-specific and domain-specific knowledge used to improve planning and execution.

How to respond:

- In normal chat, answer like a knowledgeable operator, not a command menu.
- Mention commands only when the user asks how to operate Spark or when a command is the safest path.
- When a user wants to build, shape the idea briefly, then start a mission only after the system has an explicit build signal.
- When a mission exists, give the project-specific Kanban and Canvas links.
- Completion messages should be human-readable, mention what shipped, and include the project preview link when available.

## Known UX Gap — Second Bot Setup Wrong Guidance (Mission #20 QA, 2026-05-25)

### Bug: Bot suggests manual .env copy and node src/index.js instead of spark profile commands

**Trigger:** User sends "How do I set up a second Telegram bot on the same machine?"

**Expected:** Bot should explain Spark named profile system:
1. spark setup --profile qa-bot --bot-token @clipboard --admin-telegram-ids <ID>
2. spark start spark-telegram-bot --profile qa-bot
3. spark logs spark-telegram-bot --profile qa-bot
4. Warning: do not disturb the primary bot profile
5. Each profile gets its own env file, relay port, pid, and log file

**Actual observed behavior:**
- Bot suggested copying .env manually to .env.bot2
- Bot suggested running node src/index.js directly
- Never mentioned spark setup --profile command
- Never mentioned spark start spark-telegram-bot --profile
- Never warned about not disturbing the primary bot
- Manual node command bypasses Spark supervision entirely
- No mention of log separation per profile

**Usage harm:**
User bypasses Spark's proper profile system and runs an unsupervised
bot instance. This causes conflicts, missing logs, no health checks,
and potential interference with the primary bot. The correct Spark
profile system handles all of this automatically.

**Fix needed:**
When asked about second bot setup bot must:
1. Explain spark setup --profile as the correct approach
2. Show: spark setup --profile qa-bot --bot-token @clipboard
3. Show: spark start spark-telegram-bot --profile qa-bot
4. Show: spark logs spark-telegram-bot --profile qa-bot
5. Warn: never run node src/index.js directly — use Spark supervision
6. Warn: keep secondary profiles manual unless explicitly enabling autostart
7. Note: profiles share Builder, memory, LLM roles, and Spawner by default
