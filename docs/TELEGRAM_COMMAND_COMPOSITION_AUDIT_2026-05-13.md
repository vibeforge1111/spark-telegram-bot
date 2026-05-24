# Telegram Command Composition Audit - 2026-05-13

This audit ran the Telegram gateway command surface through the real Telegraf command middleware in `SPARK_BOT_TEST_MODE=1`. It used synthetic private-chat updates, a fake Telegram API transport, isolated state, disabled live Spark CLI execution by removing `spark` from PATH, and stubbed Spawner HTTP calls. The goal is composition QA, not live service validation.

Composition lens from `spark-telegram-composition`:

- What happened?
- Is it good, neutral, blocked, or bad?
- What matters now?
- Where can the operator inspect full evidence?

## Harness Scope

- Registered Telegram commands found in source: 64
- Command cases exercised: 64
- Average usability score: 4.73 / 5
- Score spread: 47 excellent, 17 good, 0 okay, 0 rough, 0 poor
- Missing registered commands in harness: none
- Harness-only aliases/extras: none

Side-effect posture:

- `read_only`: command path should only read local state or render static text.
- `usage_only`: the harness chose a usage/help path to avoid starting work.
- `stubbed`: live service calls were intercepted and answered with local fixtures.
- `blocked`: live CLI/Builder actions were intentionally made unavailable to test the failure shape safely.

## Main Findings

1. The safe harness now has 0 rough/poor replies.
2. The clearest replies are compact command/status surfaces plus the new usage cards for `/run*`, `/mission`, `/chip`, `/loop`, `/schedule`, and `/voice`.
3. `/start` is now a first-move surface instead of a full command inventory, while keeping important operator shortcuts visible.
4. Compatibility aliases still inflate the perceived surface. They should stay functional, but primary docs should keep teaching the canonical commands.
5. Legacy dashboard commands now explain that the surface is paused for launch v1 and point users toward supported commands.

## Priority Improvements

| Priority | Commands | Improvement |
| --- | --- | --- |
| P1 | live success-path replies | Run real Telegram checks for `/chip create`, `/schedule`, `/mission status`, and `/run` with services online to ensure success replies stay concise. |
| P2 | compatibility aliases | Keep the canonical-command banner and hide aliases from primary help unless usage shows people still need them. |
| P2 | `/docker_smoke`, `/level5_setup` | Confirmation copy is intentionally safety-heavy; next polish could split it into a headline plus Why/Confirm rows. |
| P3 | live Telegram smoke | Re-run this list against a real private chat with Builder, Spawner, Spark CLI, and providers online to score success-path composition. |

## Scorecard

| Command | Family | Score | Posture | Observed first reply | Notes | Recommendation |
| --- | --- | ---: | --- | --- | --- | --- |
`/start` | Onboarding | 4 (good) | `stubbed` | 👋 Hey Audit, I'm Spark.<br>⚠️ Builder memory is offline right now, so I will avoid claiming saved memory.<br>✅ Mission relay is reachable.<br><br>Good first moves:<br>• /status - health and access<br>• /diagnose - deeper h [truncated] | Long for Telegram; should probably deep-link to Workspace or docs. | Keep the current shape; only minor polish needed.
`/myid` | Onboarding | 5 (excellent) | `read_only` | Your Telegram ID: 910000001<br>Username: @none<br>You are an admin | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/access` | Access | 5 (excellent) | `read_only` | Spark access: Access level 3<br>Current<br>• Public links, docs, GitHub research, and requested builds are on.<br>• Local files are off.<br><br>Levels:<br>• 1 - Chat, memory, recall, diagnostics. No builds.<br>• 2 - Requested [truncated] | Includes a Telegram keyboard, which helps choice-heavy flows. | Keep the current shape; only minor polish needed.
`/access_setup` | Access | 5 (excellent) | `blocked` | ⚠️ Set up safe workspace could not run.<br><br>Why: Spark CLI is not available to this Telegram runtime.<br><br>Next move: run /diagnose, or run the same access action from the Spark CLI. | Readable and compact in the safe harness. | Prefer /access as the Telegram front door and keep detailed setup in Spark CLI.
`/docker_doctor` | Access | 5 (excellent) | `blocked` | ⚠️ Check runner could not run.<br><br>Why: Spark CLI is not available to this Telegram runtime.<br><br>Next move: run /diagnose, or run the same access action from the Spark CLI. | Readable and compact in the safe harness. | Prefer /access as the Telegram front door and keep detailed setup in Spark CLI.
`/docker_smoke` | Access | 4 (good) | `usage_only` | This runs a no-secret Docker sandbox smoke. It may build or use a local image, but should not mount your home folder, Spark secrets, or the Docker socket.<br><br>To continue, send /docker_smoke confirm or tap Confirm. | First line is too dense to scan as a headline.; Includes a Telegram keyboard, which helps choice-heavy flows. | Prefer /access as the Telegram front door and keep detailed setup in Spark CLI.
`/level5_setup` | Access | 4 (good) | `usage_only` | Level 5 is whole-computer operator mode. Spark will write local guardrail env files and require a restart before it becomes active.<br><br>To continue, send /level5_setup confirm or tap Confirm. | First line is too dense to scan as a headline.; Includes a Telegram keyboard, which helps choice-heavy flows. | Prefer /access as the Telegram front door and keep detailed setup in Spark CLI.
`/level5_disable` | Access | 5 (excellent) | `usage_only` | This changes Spark access guardrail state and requires confirmation.<br><br>To continue, send /level5_disable confirm or tap Confirm. | Includes a Telegram keyboard, which helps choice-heavy flows. | Prefer /access as the Telegram front door and keep detailed setup in Spark CLI.
`/status` | Status | 4 (good) | `blocked` | ✅ System status<br><br>Builder memory: ⚠️ offline (auto)<br><br>⚠️ Spark Live health is unverified.<br><br>What happened<br>• Spark CLI is not available to this Telegram runtime.<br><br>What this means<br>• Telegram could not prove liv [truncated] | Long for Telegram; should probably deep-link to Workspace or docs. | Keep the current shape; only minor polish needed.
`/diagnose` | Status | 5 (excellent) | `stubbed` | 🔎 Running diagnostics...<br><br>Checks chat, access, relay, Spawner, and provider ping. Takes ~30s. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/spark` | Status | 5 (excellent) | `read_only` | Spark Intelligence<br><br>✅ Spark Telegram launch core is online.<br><br>Ready now<br>• Chat and command routing through Telegram<br>• Builder memory when the local bridge is healthy<br>• Spawner mission relay when local servi [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/about` | Memory | 5 (excellent) | `blocked` | ⚠️ Memory is degraded/offline right now.<br><br>I should answer from the current thread instead of treating old memory as authority.<br><br>Next move: run /diagnose if you want to check Builder memory. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/remember` | Memory | 5 (excellent) | `usage_only` | 🧠 Save a memory<br><br>Use: /remember <something important><br>Example: /remember I prefer concise mission updates. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/recall` | Memory | 5 (excellent) | `usage_only` | 🔎 Recall memory<br><br>Use: /recall <topic><br>Example: /recall mission update preferences | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/forget` | Memory | 5 (excellent) | `usage_only` | 🧹 Forget memory<br><br>Use: /forget <thing to forget><br>Example: /forget my old project nickname<br><br>If Builder memory is offline, try again after /diagnose shows memory is healthy. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/context` | Builder/AOC | 5 (excellent) | `blocked` | ⚠️ Spark could not reach the Builder memory path right now.<br><br>Why: Builder bridge command did not finish cleanly.<br><br>Next move<br>• Check now: Run /diagnose so Spark can check Builder, memory, and the selected m [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/operating_context` | Builder/AOC | 4 (good) | `blocked` | ↪️ /operating_context maps to /context.<br><br>⚠️ Spark could not reach the Builder memory path right now.<br><br>Why: Builder bridge command did not finish cleanly.<br><br>Next move<br>• Check now: Run /diagnose so Spark can [truncated] | Compatibility alias clearly points to the canonical command. | Keep as compatibility with the canonical-command banner; do not advertise it as a primary command.
`/agent_context` | Builder/AOC | 4 (good) | `blocked` | ↪️ /agent_context maps to /context.<br><br>⚠️ Spark could not reach the Builder memory path right now.<br><br>Why: Builder bridge command did not finish cleanly.<br><br>Next move<br>• Check now: Run /diagnose so Spark can chec [truncated] | Compatibility alias clearly points to the canonical command. | Keep as compatibility with the canonical-command banner; do not advertise it as a primary command.
`/aoc` | Builder/AOC | 5 (excellent) | `blocked` | ⚠️ Spark could not reach the Builder memory path right now.<br><br>Why: Builder bridge command did not finish cleanly.<br><br>Next move<br>• Check now: Run /diagnose so Spark can check Builder, memory, and the selected m [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/conversation_context` | Builder/AOC | 4 (good) | `read_only` | Conversation context harness<br>- Hot turns: 0<br>- Warm summary tokens: 0<br>- Artifacts: 0<br>- Compaction events: 0<br>- Safe input budget: unknown<br>- Requires larger model for full target: unknown | Uses CLI-style hyphen bullets where Telegram cards would scan better. | Keep the current shape; only minor polish needed.
`/black_box` | Builder/AOC | 5 (excellent) | `usage_only` | 🧾 Agent black box<br><br>Use<br>• /black_box [request_id]<br><br>What it shows<br>• Compact event evidence only.<br>• It does not promote memory or grant authority. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/blackbox` | Builder/AOC | 4 (good) | `usage_only` | ↪️ /blackbox maps to /black_box.<br><br>🧾 Agent black box<br><br>Use<br>• /black_box [request_id]<br><br>What it shows<br>• Compact event evidence only.<br>• It does not promote memory or grant authority. | Compatibility alias clearly points to the canonical command. | Keep as compatibility with the canonical-command banner; do not advertise it as a primary command.
`/black-box` | Builder/AOC | 4 (good) | `usage_only` | ↪️ /black-box maps to /black_box.<br><br>🧾 Agent black box<br><br>Use<br>• /black_box [request_id]<br><br>What it shows<br>• Compact event evidence only.<br>• It does not promote memory or grant authority. | Compatibility alias clearly points to the canonical command. | Keep as compatibility with the canonical-command banner; do not advertise it as a primary command.
`/self` | Builder | 5 (excellent) | `blocked` | ⚠️ Spark could not reach the Builder memory path right now.<br><br>Why: Builder bridge command did not finish cleanly.<br><br>Next move<br>• Check now: Run /diagnose so Spark can check Builder, memory, and the selected m [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/wiki` | Builder | 5 (excellent) | `blocked` | ⚠️ Spark could not reach the Builder memory path right now.<br><br>Why: Builder bridge command did not finish cleanly.<br><br>Next move<br>• Check now: Run /diagnose so Spark can check Builder, memory, and the selected m [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/voice` | Builder | 5 (excellent) | `blocked` | 🎙️ Voice setup is not ready yet.<br><br>What happened<br>• Telegram is running, but Builder did not return voice status.<br><br>Next move<br>• Run /diagnose, then try /voice again. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/ledger` | Builder Diagnostics | 5 (excellent) | `blocked` | Capability ledger review is unavailable right now. Run /diagnose to check the Builder bridge. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/capabilities` | Builder Diagnostics | 5 (excellent) | `read_only` | Capability garden needs review.<br><br>State<br>• 7 cards<br>• Status: local-artifacts=2, schema-shaped=3, seen=2<br>• Surfaces: creator-system=1, specialization-path=6<br><br>Review<br>• Cards are evidence, not trust.<br>• Gate ver [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/authority` | Builder Diagnostics | 4 (good) | `read_only` | Authority view has gated actions.<br><br>State<br>- Access L4; lane spark_workspace<br>- 5 Telegram access profiles; 5 Spawner lanes<br>- 5 browser approvals from 20 hooks<br>- 5 toxic capability pairs; 3 publication checks [truncated] | Uses CLI-style hyphen bullets where Telegram cards would scan better. | Keep the current shape; only minor polish needed.
`/trace` | Builder Diagnostics | 4 (good) | `read_only` | Trace repair needs attention.<br><br>State<br>• 39300 Builder events; 2403 trace groups<br>• 32924 missing trace refs; 3242 open high-severity events<br>• 0 orphan parent links<br><br>Recent<br>• 1h: 0/0 missing (0%)<br>• 24h: 116/4 [truncated] | Long for Telegram; should probably deep-link to Workspace or docs. | Keep the current shape; only minor polish needed.
`/trace_repair` | Builder Diagnostics | 4 (good) | `read_only` | ↪️ /trace_repair maps to /trace.<br><br>Trace repair needs attention.<br><br>State<br>• 39300 Builder events; 2403 trace groups<br>• 32924 missing trace refs; 3242 open high-severity events<br>• 0 orphan parent links<br><br>Recent<br>• [truncated] | Long for Telegram; should probably deep-link to Workspace or docs.; Compatibility alias clearly points to the canonical command. | Keep as compatibility with the canonical-command banner; do not advertise it as a primary command.
`/memory_movement` | Builder Diagnostics | 5 (excellent) | `read_only` | Memory movement is visible.<br><br>State<br>• supported; 5654 movement rows<br>• Movement: captured=81, saved=81, promoted=381, retrieved=2613, summarized=48<br>• Authority: authoritative_current=1970, authoritative_hist [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/memory_flow` | Builder Diagnostics | 4 (good) | `read_only` | ↪️ /memory_flow maps to /memory_movement.<br><br>Memory movement is visible.<br><br>State<br>• supported; 5654 movement rows<br>• Movement: captured=81, saved=81, promoted=381, retrieved=2613, summarized=48<br>• Authority: aut [truncated] | Compatibility alias clearly points to the canonical command. | Keep as compatibility with the canonical-command banner; do not advertise it as a primary command.
`/probe` | Route Diagnostics | 5 (excellent) | `usage_only` | 🧪 Route probe<br><br>Use<br>• /probe <route><br>• /probe core<br>• /probe all<br><br>Routes<br>• builder<br>• spawner<br>• memory<br>• researcher<br>• swarm<br>• browser<br>• local_work | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/route_probe` | Route Diagnostics | 4 (good) | `usage_only` | ↪️ /route_probe maps to /probe.<br><br>🧪 Route probe<br><br>Use<br>• /probe <route><br>• /probe core<br>• /probe all<br><br>Routes<br>• builder<br>• spawner<br>• memory<br>• researcher<br>• swarm<br>• browser<br>• local_work | Compatibility alias clearly points to the canonical command. | Keep as compatibility with the canonical-command banner; do not advertise it as a primary command.
`/nl_route` | Route Diagnostics | 5 (excellent) | `usage_only` | 🧭 Natural route probe<br><br>Use<br>• /nl_route <message><br><br>What it does<br>• Shows the diagnostic route decision only.<br>• Does not execute the route. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/natural_route` | Route Diagnostics | 4 (good) | `usage_only` | ↪️ /natural_route maps to /nl_route.<br><br>🧭 Natural route probe<br><br>Use<br>• /nl_route <message><br><br>What it does<br>• Shows the diagnostic route decision only.<br>• Does not execute the route. | Compatibility alias clearly points to the canonical command. | Keep as compatibility with the canonical-command banner; do not advertise it as a primary command.
`/run` | Mission Start | 5 (excellent) | `usage_only` | 🚀 Start a mission<br><br>Use<br>• /run <goal><br><br>Example<br>• /run audit the Telegram command copy and suggest fixes<br><br>Route<br>• Uses current mission provider: codex.<br>• /model shows or changes the default mission route. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/runminimax` | Mission Start | 5 (excellent) | `usage_only` | 🚀 Start a MiniMax mission<br><br>Use<br>• /runminimax <goal><br><br>Example<br>• /runminimax compare the current plan against the launch docs<br><br>Route<br>• Expert shortcut: sends directly to MiniMax.<br>• /model shows or changes t [truncated] | Readable and compact in the safe harness. | Consider moving provider choice into /model plus /run, leaving this as an expert shortcut.
`/runglm` | Mission Start | 5 (excellent) | `usage_only` | 🚀 Start a Z.AI GLM mission<br><br>Use<br>• /runglm <goal><br><br>Example<br>• /runglm compare the current plan against the launch docs<br><br>Route<br>• Expert shortcut: sends directly to Z.AI GLM.<br>• /model shows or changes the def [truncated] | Readable and compact in the safe harness. | Consider moving provider choice into /model plus /run, leaving this as an expert shortcut.
`/runzai` | Mission Start | 5 (excellent) | `usage_only` | 🚀 Start a Z.AI GLM mission<br><br>Use<br>• /runzai <goal><br><br>Example<br>• /runzai compare the current plan against the launch docs<br><br>Route<br>• Expert shortcut: sends directly to Z.AI GLM.<br>• /model shows or changes the def [truncated] | Readable and compact in the safe harness. | Consider moving provider choice into /model plus /run, leaving this as an expert shortcut.
`/runclaude` | Mission Start | 5 (excellent) | `usage_only` | 🚀 Start a Claude mission<br><br>Use<br>• /runclaude <goal><br><br>Example<br>• /runclaude compare the current plan against the launch docs<br><br>Route<br>• Expert shortcut: sends directly to Claude.<br>• /model shows or changes the d [truncated] | Readable and compact in the safe harness. | Consider moving provider choice into /model plus /run, leaving this as an expert shortcut.
`/runcodex` | Mission Start | 5 (excellent) | `usage_only` | 🚀 Start a Codex mission<br><br>Use<br>• /runcodex <goal><br><br>Example<br>• /runcodex compare the current plan against the launch docs<br><br>Route<br>• Expert shortcut: sends directly to Codex.<br>• /model shows or changes the defau [truncated] | Readable and compact in the safe harness. | Consider moving provider choice into /model plus /run, leaving this as an expert shortcut.
`/run2` | Mission Start | 5 (excellent) | `usage_only` | 🚀 Start a MiniMax and Z.AI GLM mission<br><br>Use<br>• /run2 <goal><br><br>Example<br>• /run2 compare the current plan against the launch docs<br><br>Route<br>• Expert shortcut: sends directly to MiniMax and Z.AI GLM.<br>• /model show [truncated] | Readable and compact in the safe harness. | Consider moving provider choice into /model plus /run, leaving this as an expert shortcut.
`/runall` | Mission Start | 5 (excellent) | `usage_only` | 🚀 Start a MiniMax, Z.AI GLM, Claude, and Codex mission<br><br>Use<br>• /runall <goal><br><br>Example<br>• /runall compare the current plan against the launch docs<br><br>Route<br>• Expert shortcut: sends directly to MiniMax, Z.AI G [truncated] | Readable and compact in the safe harness. | Consider moving provider choice into /model plus /run, leaving this as an expert shortcut.
`/board` | Mission Control | 4 (good) | `stubbed` | Spawner Board<br><br>Running: 0<br>- none<br><br>Paused: 0<br>- none<br><br>Completed: 0<br>- none<br><br>Failed: 0<br>- none<br><br>Created: 0<br>- none | Uses CLI-style hyphen bullets where Telegram cards would scan better. | Keep the current shape; only minor polish needed.
`/mission` | Mission Control | 5 (excellent) | `usage_only` | 🧭 Control a mission<br><br>Use<br>• /mission status <missionId><br>• /mission pause <missionId><br>• /mission resume <missionId><br>• /mission kill <missionId><br><br>Example<br>• /mission status spark-1776768300668<br><br>Tip<br>• /board s [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/updates` | Mission Control | 5 (excellent) | `read_only` | Live mission updates are set to normal.<br>Normal sends pickup, canvas-ready, final handoff, and failures.<br>Mission links are set to board.<br>Mission updates include the Mission board/Kanban link.<br><br>Usage:<br>/updat [truncated] | Usage is explicit. | Keep the current shape; only minor polish needed.
`/model` | Models | 5 (excellent) | `read_only` | 🧠 Spark model routing<br><br>Current<br>• Agent chat: audit_unsupported (glm-5.1)<br>• Missions: codex (gpt-5.5)<br><br>Common switches<br>• /model agent codex<br>• /model agent claude claude-sonnet-4-6<br>• /model mission codex<br>• [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/models` | Models | 5 (excellent) | `read_only` | 🧭 Recommended Spark provider paths<br><br>Choose one provider first. Spark uses it for agent chat, runtime, memory, retrieval, and missions. You can split agent vs mission later.<br><br>Fast picks<br>• Have ChatGPT/Code [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/workspaces` | Workspace | 5 (excellent) | `read_only` | ⚠️ Local workspace access is blocked.<br><br>Why<br>• This operating system request needs Access level 4 for sandboxed local work, or Access level 5 for whole-computer work.<br>• This chat is at Access level 3.<br><br>Next [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/workspace` | Workspace | 4 (good) | `read_only` | ↪️ /workspace maps to /workspaces.<br><br>⚠️ Local workspace access is blocked.<br><br>Why<br>• This operating system request needs Access level 4 for sandboxed local work, or Access level 5 for whole-computer work.<br>• Th [truncated] | Compatibility alias clearly points to the canonical command. | Keep as compatibility with the canonical-command banner; do not advertise it as a primary command.
`/creator` | Creator/Chip | 5 (excellent) | `usage_only` | 🎯 Creator missions<br><br>Use<br>• /creator plan [private\|github\|swarm] [risk low\|medium\|high] <brief><br>• /creator run <mission-creator-id><br>• /creator status <mission-creator-id><br>• /creator validate <mission-creato [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/chip` | Creator/Chip | 5 (excellent) | `usage_only` | 🌱 Create a domain chip<br><br>Use<br>• /chip create <natural language description><br><br>Example<br>• /chip create a QA operator that catches launch-blocking UI regressions<br><br>Next move<br>• Use /creator for planned creator mi [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/loop` | Creator/Chip | 5 (excellent) | `usage_only` | 🌀 Run a chip autoloop<br><br>Use<br>• /loop <chip_key> [rounds]<br><br>Example<br>• /loop startup-yc 3<br><br>What happens<br>• Spark asks the chip for candidates, evaluates them, and posts a summary. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/recursive` | Recursive | 5 (excellent) | `usage_only` | Spark Recursive Loops<br><br>Start here:<br>/recursive sessions - recent loops and next action<br>/recursive report <id> - readable result summary<br>/recursive start <targetKey> rounds <n> - run a local Builder chip loo [truncated] | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/schedule` | Scheduling | 5 (excellent) | `usage_only` | 🗓️ Schedule recurring work<br><br>Use<br>• /schedule "<cron>" mission <goal><br>• /schedule "<cron>" loop <chipKey> [rounds]<br><br>Example<br>• /schedule "*/5 * * * *" loop startup-yc 2<br><br>Manage<br>• /schedules lists or deletes scheduled work. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/schedules` | Scheduling | 5 (excellent) | `stubbed` | No schedules. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/clarify` | Clarification | 5 (excellent) | `read_only` | No pending clarification for you. Send a /build message first. | Readable and compact in the safe harness. | Keep the current shape; only minor polish needed.
`/resonance` | Deferred Dashboard | 5 (excellent) | `read_only` | Resonance<br><br>⚠️ Legacy dashboard commands are paused for launch v1.<br><br>Ready now<br>• Telegram chat and command routing<br>• Builder memory when the local bridge is healthy<br>• Spawner mission relay when local service [truncated] | Readable and compact in the safe harness. | Hide or retire this from Telegram help until the dashboard surface is real.
`/insights` | Deferred Dashboard | 5 (excellent) | `read_only` | ⚠️ Legacy dashboard commands are paused for launch v1.<br><br>Ready now<br>• Telegram chat and command routing<br>• Builder memory when the local bridge is healthy<br>• Spawner mission relay when local services are runni [truncated] | Readable and compact in the safe harness. | Hide or retire this from Telegram help until the dashboard surface is real.
`/lessons` | Deferred Dashboard | 5 (excellent) | `read_only` | ⚠️ Legacy dashboard commands are paused for launch v1.<br><br>Ready now<br>• Telegram chat and command routing<br>• Builder memory when the local bridge is healthy<br>• Spawner mission relay when local services are runni [truncated] | Readable and compact in the safe harness. | Hide or retire this from Telegram help until the dashboard surface is real.
`/process` | Deferred Dashboard | 5 (excellent) | `read_only` | ⚠️ Legacy dashboard commands are paused for launch v1.<br><br>Ready now<br>• Telegram chat and command routing<br>• Builder memory when the local bridge is healthy<br>• Spawner mission relay when local services are runni [truncated] | Readable and compact in the safe harness. | Hide or retire this from Telegram help until the dashboard surface is real.
`/reflect` | Deferred Dashboard | 5 (excellent) | `read_only` | ⚠️ Legacy dashboard commands are paused for launch v1.<br><br>Ready now<br>• Telegram chat and command routing<br>• Builder memory when the local bridge is healthy<br>• Spawner mission relay when local services are runni [truncated] | Readable and compact in the safe harness. | Hide or retire this from Telegram help until the dashboard surface is real.

## Family Notes

### Access

Average: 4.67 / 5.

No commands in this family scored below okay in the safe harness.

### Builder

Average: 5.00 / 5.

No commands in this family scored below okay in the safe harness.

### Builder Diagnostics

Average: 4.43 / 5.

No commands in this family scored below okay in the safe harness.

### Builder/AOC

Average: 4.38 / 5.

No commands in this family scored below okay in the safe harness.

### Clarification

Average: 5.00 / 5.

No commands in this family scored below okay in the safe harness.

### Creator/Chip

Average: 5.00 / 5.

No commands in this family scored below okay in the safe harness.

### Deferred Dashboard

Average: 5.00 / 5.

No commands in this family scored below okay in the safe harness.

### Memory

Average: 5.00 / 5.

No commands in this family scored below okay in the safe harness.

### Mission Control

Average: 4.67 / 5.

No commands in this family scored below okay in the safe harness.

### Mission Start

Average: 5.00 / 5.

No commands in this family scored below okay in the safe harness.

### Models

Average: 5.00 / 5.

No commands in this family scored below okay in the safe harness.

### Onboarding

Average: 4.50 / 5.

No commands in this family scored below okay in the safe harness.

### Recursive

Average: 5.00 / 5.

No commands in this family scored below okay in the safe harness.

### Route Diagnostics

Average: 4.50 / 5.

No commands in this family scored below okay in the safe harness.

### Scheduling

Average: 5.00 / 5.

No commands in this family scored below okay in the safe harness.

### Status

Average: 4.67 / 5.

No commands in this family scored below okay in the safe harness.

### Workspace

Average: 4.50 / 5.

No commands in this family scored below okay in the safe harness.

## Captured Reply Snippets

### /start

Score: 4 (good). Intent: Show first-run help and current launch posture.

Reply 1:

```text
👋 Hey Audit, I'm Spark.
⚠️ Builder memory is offline right now, so I will avoid claiming saved memory.
✅ Mission relay is reachable.

Good first moves:
• /status - health and access
• /diagnose - deeper health check
• /remember <text> - save an important detail
• /recall <topic> - ask what I remember

You can also just chat with me here.

Admin shortcuts:
• /run <goal> - start a Spawner mission
• /board - mission board
• /access <1|2|3|4|5> - choose chat permissions
• /access 5 - Approve Level 5 setup from Telegram
• /model - model routing
• /workspaces - local project folders

Advanced:
• /creator, /recursive, /context, /probe, /trace, /memory_movement, /wiki
```

Reply 2:

```text
Choose how much access this Telegram chat has.

Levels:
• 1 - Chat, memory, recall, diagnostics. No builds.
• 2 - Requested builds and missions.
• 3 - Public research plus requested builds. No local files.
• 4 - Workspace files and local debugging (`/access 4`). Recommended; setup: `/access_setup`.
• 5 - Whole-computer operator mode (`/access 5`). Confirm once.

Safety stays on: Spark still asks before secrets, destructive actions, publishing, or deploying.

Default right now: Access level 3.
Change it anytime with `/access 1` through `/access 5`.
```

### /myid

Score: 5 (excellent). Intent: Return the Telegram ID needed for allow/admin setup.

Reply 1:

```text
Your Telegram ID: 910000001
Username: @none
You are an admin
```

### /access

Score: 5 (excellent). Intent: Show current chat access and capability status.

Reply 1 (with keyboard):

```text
Spark access: Access level 3
Current
• Public links, docs, GitHub research, and requested builds are on.
• Local files are off.

Levels:
• 1 - Chat, memory, recall, diagnostics. No builds.
• 2 - Requested builds and missions.
• 3 - Public research plus requested builds. No local files.
• 4 - Workspace files and local debugging (`/access 4`). Recommended; setup: `/access_setup`.
• 5 - Whole-computer operator mode (`/access 5`). Confirm once.

Safety stays on: Spark still asks before secrets, destructive actions, publishing, or deploying.

Change anytime: `/access 1` through `/access 5`.

Access: Access level 3.
Runner: writable here.
Verdict: local filesystem work is off at this level.
```

### /access_setup

Score: 5 (excellent). Intent: Run safe workspace setup from Telegram.

Reply 1:

```text
⚠️ Set up safe workspace could not run.

Why: Spark CLI is not available to this Telegram runtime.

Next move: run /diagnose, or run the same access action from the Spark CLI.
```

### /docker_doctor

Score: 5 (excellent). Intent: Check Docker sandbox readiness.

Reply 1:

```text
⚠️ Check runner could not run.

Why: Spark CLI is not available to this Telegram runtime.

Next move: run /diagnose, or run the same access action from the Spark CLI.
```

### /docker_smoke

Score: 4 (good). Intent: Prompt before running Docker sandbox smoke.

Reply 1 (with keyboard):

```text
This runs a no-secret Docker sandbox smoke. It may build or use a local image, but should not mount your home folder, Spark secrets, or the Docker socket.

To continue, send /docker_smoke confirm or tap Confirm.
```

### /level5_setup

Score: 4 (good). Intent: Prompt before Level 5 setup.

Reply 1 (with keyboard):

```text
Level 5 is whole-computer operator mode. Spark will write local guardrail env files and require a restart before it becomes active.

To continue, send /level5_setup confirm or tap Confirm.
```

### /level5_disable

Score: 5 (excellent). Intent: Prompt before returning to safer sandbox.

Reply 1 (with keyboard):

```text
This changes Spark access guardrail state and requires confirmation.

To continue, send /level5_disable confirm or tap Confirm.
```

### /status

Score: 4 (good). Intent: Summarize launch health and access state.

Reply 1:

```text
✅ System status

Builder memory: ⚠️ offline (auto)

⚠️ Spark Live health is unverified.

What happened
• Spark CLI is not available to this Telegram runtime.

What this means
• Telegram could not prove live Spark health from here.
• This is not proof that Spawner or Telegram are offline.

Next move
• Run /diagnose, or check `spark live status` from the Spark CLI.

⚠️ Spark Access status is partly unverified.

Chat setting: Access level 3.
CLI effective access: unavailable.
Why: Spark CLI is not available to this Telegram runtime.

Runner: writable here.

Verdict: this runner could not read the authoritative access state, so I will not claim Level 5 is active.
```

### /diagnose

Score: 5 (excellent). Intent: Run full stack health diagnostics.

Reply 1:

```text
🔎 Running diagnostics...

Checks chat, access, relay, Spawner, and provider ping. Takes ~30s.
```

Reply 2:

```text
🔴 Spark diagnostics found an issue.
Health
🟢 Relay ready
🔴 Chat degraded
🟡 Builds degraded
🟢 Access Access level 3 / admin
Issue
plain chat provider is unhealthy. Check the selected chat model key/base URL, then restart the Telegram gateway.
Routes
Chat: zai
Builds: codex
Providers: 1/2 ready
Ping: codex failed
Workspace
Board: 0 running / 0 completed / 0 failed
Spawner UI: http://localhost:3333
Checked in 0.0s.
```

### /spark

Score: 5 (excellent). Intent: Show quick Spark launch-core status.

Reply 1:

```text
Spark Intelligence

✅ Spark Telegram launch core is online.

Ready now
• Chat and command routing through Telegram
• Builder memory when the local bridge is healthy
• Spawner mission relay when local services are running

Paused
• Legacy resonance/dashboard commands

Next move: use /status for live health or /run <goal> for missions.
```

### /about

Score: 5 (excellent). Intent: Ask Builder what it knows about the user.

Reply 1:

```text
⚠️ Memory is degraded/offline right now.

I should answer from the current thread instead of treating old memory as authority.

Next move: run /diagnose if you want to check Builder memory.
```

### /remember

Score: 5 (excellent). Intent: Validate remember usage without writing memory.

Reply 1:

```text
🧠 Save a memory

Use: /remember <something important>
Example: /remember I prefer concise mission updates.
```

### /recall

Score: 5 (excellent). Intent: Validate recall usage without querying memory.

Reply 1:

```text
🔎 Recall memory

Use: /recall <topic>
Example: /recall mission update preferences
```

### /forget

Score: 5 (excellent). Intent: Validate forget usage without changing memory.

Reply 1:

```text
🧹 Forget memory

Use: /forget <thing to forget>
Example: /forget my old project nickname

If Builder memory is offline, try again after /diagnose shows memory is healthy.
```

### /context

Score: 5 (excellent). Intent: Show Agent Operating Context.

Reply 1:

```text
⚠️ Spark could not reach the Builder memory path right now.

Why: Builder bridge command did not finish cleanly.

Next move
• Check now: Run /diagnose so Spark can check Builder, memory, and the selected memory model.
• Operator fix: spark fix telegram, then spark verify --onboarding.

Still stuck: spark doctor llm "Spark builder failure: builder_or_memory" --save-report --upstream-report
```

### /operating_context

Score: 4 (good). Intent: Alias for Agent Operating Context.

Reply 1:

```text
↪️ /operating_context maps to /context.

⚠️ Spark could not reach the Builder memory path right now.

Why: Builder bridge command did not finish cleanly.

Next move
• Check now: Run /diagnose so Spark can check Builder, memory, and the selected memory model.
• Operator fix: spark fix telegram, then spark verify --onboarding.

Still stuck: spark doctor llm "Spark builder failure: builder_or_memory" --save-report --upstream-report
```

### /agent_context

Score: 4 (good). Intent: Alias for Agent Operating Context.

Reply 1:

```text
↪️ /agent_context maps to /context.

⚠️ Spark could not reach the Builder memory path right now.

Why: Builder bridge command did not finish cleanly.

Next move
• Check now: Run /diagnose so Spark can check Builder, memory, and the selected memory model.
• Operator fix: spark fix telegram, then spark verify --onboarding.

Still stuck: spark doctor llm "Spark builder failure: builder_or_memory" --save-report --upstream-report
```

### /aoc

Score: 5 (excellent). Intent: Short alias for Agent Operating Context.

Reply 1:

```text
⚠️ Spark could not reach the Builder memory path right now.

Why: Builder bridge command did not finish cleanly.

Next move
• Check now: Run /diagnose so Spark can check Builder, memory, and the selected memory model.
• Operator fix: spark fix telegram, then spark verify --onboarding.

Still stuck: spark doctor llm "Spark builder failure: builder_or_memory" --save-report --upstream-report
```

### /conversation_context

Score: 4 (good). Intent: Show conversation-frame diagnostics.

Reply 1:

```text
Conversation context harness
- Hot turns: 0
- Warm summary tokens: 0
- Artifacts: 0
- Compaction events: 0
- Safe input budget: unknown
- Requires larger model for full target: unknown
```

### /black_box

Score: 5 (excellent). Intent: Show black-box trace usage.

Reply 1:

```text
🧾 Agent black box

Use
• /black_box [request_id]

What it shows
• Compact event evidence only.
• It does not promote memory or grant authority.
```

### /blackbox

Score: 4 (good). Intent: Alias for black-box trace usage.

Reply 1:

```text
↪️ /blackbox maps to /black_box.

🧾 Agent black box

Use
• /black_box [request_id]

What it shows
• Compact event evidence only.
• It does not promote memory or grant authority.
```

### /black-box

Score: 4 (good). Intent: Hyphen alias for black-box trace usage.

Reply 1:

```text
↪️ /black-box maps to /black_box.

🧾 Agent black box

Use
• /black_box [request_id]

What it shows
• Compact event evidence only.
• It does not promote memory or grant authority.
```

### /self

Score: 5 (excellent). Intent: Show Spark self-awareness status.

Reply 1:

```text
⚠️ Spark could not reach the Builder memory path right now.

Why: Builder bridge command did not finish cleanly.

Next move
• Check now: Run /diagnose so Spark can check Builder, memory, and the selected memory model.
• Operator fix: spark fix telegram, then spark verify --onboarding.

Still stuck: spark doctor llm "Spark builder failure: builder_or_memory" --save-report --upstream-report
```

### /wiki

Score: 5 (excellent). Intent: Show wiki health/status.

Reply 1:

```text
⚠️ Spark could not reach the Builder memory path right now.

Why: Builder bridge command did not finish cleanly.

Next move
• Check now: Run /diagnose so Spark can check Builder, memory, and the selected memory model.
• Operator fix: spark fix telegram, then spark verify --onboarding.

Still stuck: spark doctor llm "Spark builder failure: builder_or_memory" --save-report --upstream-report
```

### /voice

Score: 5 (excellent). Intent: Show voice route/onboarding status.

Reply 1:

```text
🎙️ Voice setup is not ready yet.

What happened
• Telegram is running, but Builder did not return voice status.

Next move
• Run /diagnose, then try /voice again.
```

### /ledger

Score: 5 (excellent). Intent: Review capability ledger.

Reply 1:

```text
Capability ledger review is unavailable right now. Run /diagnose to check the Builder bridge.
```

### /capabilities

Score: 5 (excellent). Intent: Show capability garden summary.

Reply 1:

```text
Capability garden needs review.

State
• 7 cards
• Status: local-artifacts=2, schema-shaped=3, seen=2
• Surfaces: creator-system=1, specialization-path=6

Review
• Cards are evidence, not trust.
• Gate verdicts, privacy review, rollback refs, and publication proof still decide promotion.

Top cards
• creator-system:spark-domain-chip-labs: local-artifacts (3 blockers)
• specialization-path:spark-researcher-specialization-path: schema-shaped (3 blockers)
• specialization-path:spark-swarm: local-artifacts (3 blockers)

Workspace
• Full evidence: `spark os capabilities --json`
```

### /authority

Score: 4 (good). Intent: Show authority status summary.

Reply 1:

```text
Authority view has gated actions.

State
- Access L4; lane spark_workspace
- 5 Telegram access profiles; 5 Spawner lanes
- 5 browser approvals from 20 hooks
- 5 toxic capability pairs; 3 publication checks tracked
- Trace verdicts: 29; verdicts allowed, blocked; actions mission_execution

Review
- This is evidence, not permission.
- High-agency actions still need source policy, runner state, confirmation, and trace.

Workspace
- Full evidence: `spark os authority --json` and `spark os trace --json`
```

### /trace

Score: 4 (good). Intent: Show trace repair summary.

Reply 1:

```text
Trace repair needs attention.

State
• 39300 Builder events; 2403 trace groups
• 32924 missing trace refs; 3242 open high-severity events
• 0 orphan parent links

Recent
• 1h: 0/0 missing (0%)
• 24h: 116/405 missing (28.6%)
• 7d: 10433/13128 missing (79.5%)

Top gaps
• memory_orchestrator/memory_read_requested: 8612 recorded/medium
• memory_orchestrator/memory_read_succeeded: 4307 recorded/medium
• attachment_snapshot/plugin_or_chip_influence_recorded: 2361 recorded/medium

Joins
• Spawner derived refs 122; Builder request overlaps 26/197
• Builder trace overlaps 26; Telegram final-answer join join_key_present

Review
• Trace health is observability evidence, not task success or memory truth.

Workspace
• Full evidence: `spark os trace --json`
```

### /trace_repair

Score: 4 (good). Intent: Alias for trace repair summary.

Reply 1:

```text
↪️ /trace_repair maps to /trace.

Trace repair needs attention.

State
• 39300 Builder events; 2403 trace groups
• 32924 missing trace refs; 3242 open high-severity events
• 0 orphan parent links

Recent
• 1h: 0/0 missing (0%)
• 24h: 116/405 missing (28.6%)
• 7d: 10433/13128 missing (79.5%)

Top gaps
• memory_orchestrator/memory_read_requested: 8612 recorded/medium
• memory_orchestrator/memory_read_succeeded: 4307 recorded/medium
• attachment_snapshot/plugin_or_chip_influence_recorded: 2361 recorded/medium

Joins
• Spawner derived refs 122; Builder request overlaps 26/197
• Builder trace overlaps 26; Telegram final-answer join join_key_present

Review
• Trace health is observability evidence, not task success or memory truth.

Workspace
• Full evidence: `spark os trace --json`
```

### /memory_movement

Score: 5 (excellent). Intent: Show memory movement summary.

Reply 1:

```text
Memory movement is visible.

State
• supported; 5654 movement rows
• Movement: captured=81, saved=81, promoted=381, retrieved=2613, summarized=48
• Authority: authoritative_current=1970, authoritative_historical=1344, supporting_not_authoritative=2338, structured_support=2
• Records: current_state=327, events=503, observations=821
• KB files 368; current-state files 23

Review
• Movement rows are evidence, not instructions.
• Blocked or dropped rows still need a separate promotion gate.

Next
• Have Builder write artifacts/memory-movement-index/memory-movement-status.json from inspect_memory_movement_status().
• Have domain-chip-memory expose movement counts by lane, authority, source family, and record type without record text.

Workspace
• Full evidence: `spark os memory --json`
```

### /memory_flow

Score: 4 (good). Intent: Alias for memory movement summary.

Reply 1:

```text
↪️ /memory_flow maps to /memory_movement.

Memory movement is visible.

State
• supported; 5654 movement rows
• Movement: captured=81, saved=81, promoted=381, retrieved=2613, summarized=48
• Authority: authoritative_current=1970, authoritative_historical=1344, supporting_not_authoritative=2338, structured_support=2
• Records: current_state=327, events=503, observations=821
• KB files 368; current-state files 23

Review
• Movement rows are evidence, not instructions.
• Blocked or dropped rows still need a separate promotion gate.

Next
• Have Builder write artifacts/memory-movement-index/memory-movement-status.json from inspect_memory_movement_status().
• Have domain-chip-memory expose movement counts by lane, authority, source family, and record type without record text.

Workspace
• Full evidence: `spark os memory --json`
```

### /probe

Score: 5 (excellent). Intent: Show route probe help.

Reply 1:

```text
🧪 Route probe

Use
• /probe <route>
• /probe core
• /probe all

Routes
• builder
• spawner
• memory
• researcher
• swarm
• browser
• local_work
```

### /route_probe

Score: 4 (good). Intent: Alias for route probe help.

Reply 1:

```text
↪️ /route_probe maps to /probe.

🧪 Route probe

Use
• /probe <route>
• /probe core
• /probe all

Routes
• builder
• spawner
• memory
• researcher
• swarm
• browser
• local_work
```

### /nl_route

Score: 5 (excellent). Intent: Show natural-route probe help.

Reply 1:

```text
🧭 Natural route probe

Use
• /nl_route <message>

What it does
• Shows the diagnostic route decision only.
• Does not execute the route.
```

### /natural_route

Score: 4 (good). Intent: Alias for natural-route probe help.

Reply 1:

```text
↪️ /natural_route maps to /nl_route.

🧭 Natural route probe

Use
• /nl_route <message>

What it does
• Shows the diagnostic route decision only.
• Does not execute the route.
```

### /run

Score: 5 (excellent). Intent: Show mission-start usage.

Reply 1:

```text
🚀 Start a mission

Use
• /run <goal>

Example
• /run audit the Telegram command copy and suggest fixes

Route
• Uses current mission provider: codex.
• /model shows or changes the default mission route.
```

### /runminimax

Score: 5 (excellent). Intent: Show MiniMax run shortcut usage.

Reply 1:

```text
🚀 Start a MiniMax mission

Use
• /runminimax <goal>

Example
• /runminimax compare the current plan against the launch docs

Route
• Expert shortcut: sends directly to MiniMax.
• /model shows or changes the default mission route.
```

### /runglm

Score: 5 (excellent). Intent: Show Z.AI/GLM run shortcut usage.

Reply 1:

```text
🚀 Start a Z.AI GLM mission

Use
• /runglm <goal>

Example
• /runglm compare the current plan against the launch docs

Route
• Expert shortcut: sends directly to Z.AI GLM.
• /model shows or changes the default mission route.
```

### /runzai

Score: 5 (excellent). Intent: Show Z.AI run shortcut usage.

Reply 1:

```text
🚀 Start a Z.AI GLM mission

Use
• /runzai <goal>

Example
• /runzai compare the current plan against the launch docs

Route
• Expert shortcut: sends directly to Z.AI GLM.
• /model shows or changes the default mission route.
```

### /runclaude

Score: 5 (excellent). Intent: Show Claude run shortcut usage.

Reply 1:

```text
🚀 Start a Claude mission

Use
• /runclaude <goal>

Example
• /runclaude compare the current plan against the launch docs

Route
• Expert shortcut: sends directly to Claude.
• /model shows or changes the default mission route.
```

### /runcodex

Score: 5 (excellent). Intent: Show Codex run shortcut usage.

Reply 1:

```text
🚀 Start a Codex mission

Use
• /runcodex <goal>

Example
• /runcodex compare the current plan against the launch docs

Route
• Expert shortcut: sends directly to Codex.
• /model shows or changes the default mission route.
```

### /run2

Score: 5 (excellent). Intent: Show two-provider consensus usage.

Reply 1:

```text
🚀 Start a MiniMax and Z.AI GLM mission

Use
• /run2 <goal>

Example
• /run2 compare the current plan against the launch docs

Route
• Expert shortcut: sends directly to MiniMax and Z.AI GLM.
• /model shows or changes the default mission route.
```

### /runall

Score: 5 (excellent). Intent: Show all-provider run usage.

Reply 1:

```text
🚀 Start a MiniMax, Z.AI GLM, Claude, and Codex mission

Use
• /runall <goal>

Example
• /runall compare the current plan against the launch docs

Route
• Expert shortcut: sends directly to MiniMax, Z.AI GLM, Claude, and Codex.
• /model shows or changes the default mission route.
```

### /board

Score: 4 (good). Intent: Show mission board summary.

Reply 1:

```text
Spawner Board

Running: 0
- none

Paused: 0
- none

Completed: 0
- none

Failed: 0
- none

Created: 0
- none
```

### /mission

Score: 5 (excellent). Intent: Show mission control usage.

Reply 1:

```text
🧭 Control a mission

Use
• /mission status <missionId>
• /mission pause <missionId>
• /mission resume <missionId>
• /mission kill <missionId>

Example
• /mission status spark-1776768300668

Tip
• /board shows recent mission IDs.
```

### /updates

Score: 5 (excellent). Intent: Show mission update preferences.

Reply 1:

```text
Live mission updates are set to normal.
Normal sends pickup, canvas-ready, final handoff, and failures.
Mission links are set to board.
Mission updates include the Mission board/Kanban link.

Usage:
/updates minimal | /updates normal | /updates verbose
/updates links none | kanban | canvas | both
```

### /model

Score: 5 (excellent). Intent: Show current model routing.

Reply 1:

```text
🧠 Spark model routing

Current
• Agent chat: audit_unsupported (glm-5.1)
• Missions: codex (gpt-5.5)

Common switches
• /model agent codex
• /model agent claude claude-sonnet-4-6
• /model mission codex
• /model mission claude claude-opus-4-7

More options
• /models - curated provider defaults
• /models claude - provider-specific details
• /model agent lmstudio <loaded-model-id>

You can pass an exact model id as the third value. Run /diagnose after changing to verify the route.
```

### /models

Score: 5 (excellent). Intent: Show model recommendations.

Reply 1:

```text
🧭 Recommended Spark provider paths

Choose one provider first. Spark uses it for agent chat, runtime, memory, retrieval, and missions. You can split agent vs mission later.

Fast picks
• Have ChatGPT/Codex: codex with gpt-5.5
• Have Claude: claude with Sonnet for agent, Opus for hard missions
• Have API keys: OpenAI, OpenRouter, Z.AI, MiniMax, or Hugging Face
• Want local/private: LM Studio for desktop, Ollama for terminal

Provider defaults
• zai: API key; agent glm-5.1; mission glm-5.1
• codex: ChatGPT/Codex sign-in; agent gpt-5.5; mission gpt-5.5
• claude: Claude sign-in or API key; agent Claude Sonnet 4.6 (claude-sonnet-4-6); mission Claude Opus 4.7 (claude-opus-4-7)
• openai: OpenAI API key; agent gpt-5.5; mission gpt-5.5
• openrouter: API gateway; agent openai/gpt-5.5; mission openai/gpt-5.5
• lmstudio: Local/private desktop; agent local-model; mission local-model
• [truncated]
```

### /workspaces

Score: 5 (excellent). Intent: Show local workspace inventory or access denial.

Reply 1:

```text
⚠️ Local workspace access is blocked.

Why
• This operating system request needs Access level 4 for sandboxed local work, or Access level 5 for whole-computer work.
• This chat is at Access level 3.

Next move
• Say "change my access level to 4" or send `/access 4` for Spark sandbox workspaces.
• Use `/access 5` only when you really want whole-computer operator mode.
```

### /workspace

Score: 4 (good). Intent: Alias for local workspace inventory.

Reply 1:

```text
↪️ /workspace maps to /workspaces.

⚠️ Local workspace access is blocked.

Why
• This operating system request needs Access level 4 for sandboxed local work, or Access level 5 for whole-computer work.
• This chat is at Access level 3.

Next move
• Say "change my access level to 4" or send `/access 4` for Spark sandbox workspaces.
• Use `/access 5` only when you really want whole-computer operator mode.
```

### /creator

Score: 5 (excellent). Intent: Show creator mission usage.

Reply 1:

```text
🎯 Creator missions

Use
• /creator plan [private|github|swarm] [risk low|medium|high] <brief>
• /creator run <mission-creator-id>
• /creator status <mission-creator-id>
• /creator validate <mission-creator-id> [maxCommands]

Example
• /creator plan private risk medium create a Startup YC benchmarked specialization path
```

### /chip

Score: 5 (excellent). Intent: Show chip creation usage.

Reply 1:

```text
🌱 Create a domain chip

Use
• /chip create <natural language description>

Example
• /chip create a QA operator that catches launch-blocking UI regressions

Next move
• Use /creator for planned creator missions, or /recursive for recursive loops.
```

### /loop

Score: 5 (excellent). Intent: Show chip autoloop usage.

Reply 1:

```text
🌀 Run a chip autoloop

Use
• /loop <chip_key> [rounds]

Example
• /loop startup-yc 3

What happens
• Spark asks the chip for candidates, evaluates them, and posts a summary.
```

### /recursive

Score: 5 (excellent). Intent: Show recursive Workspace help.

Reply 1:

```text
Spark Recursive Loops

Start here:
/recursive sessions - recent loops and next action
/recursive report <id> - readable result summary
/recursive start <targetKey> rounds <n> - run a local Builder chip loop

When something needs you:
/recursive review [id] - decisions waiting
/recursive approve <id> [rationale]
/recursive defer <id> <rationale>
/recursive reject <id> <rationale>
/recursive more-eval <id> <rationale>

Deep cuts:
/recursive paths - specialization lanes
/recursive trace <id> - detailed timeline
/recursive propose <chip-or-path-name> [submit]
/recursive sync prompt-benchmark <runJson> [report <reportPath>]
/recursive sync domain-chip-lab <telemetryJson> <chipKey> [chip-path <path>] [packet <path>]
/recursive sync domain-autoloop <manifestJson> <stateJson> [policy <path>] [journal <path>] [lane-report <path>]

Local mode: reports come from status files on this [truncated]
```

### /schedule

Score: 5 (excellent). Intent: Show schedule creation usage.

Reply 1:

```text
🗓️ Schedule recurring work

Use
• /schedule "<cron>" mission <goal>
• /schedule "<cron>" loop <chipKey> [rounds]

Example
• /schedule "*/5 * * * *" loop startup-yc 2

Manage
• /schedules lists or deletes scheduled work.
```

### /schedules

Score: 5 (excellent). Intent: List schedules.

Reply 1:

```text
No schedules.
```

### /clarify

Score: 5 (excellent). Intent: Handle a pending clarification answer.

Reply 1:

```text
No pending clarification for you. Send a /build message first.
```

### /resonance

Score: 5 (excellent). Intent: Show deferred resonance status.

Reply 1:

```text
Resonance

⚠️ Legacy dashboard commands are paused for launch v1.

Ready now
• Telegram chat and command routing
• Builder memory when the local bridge is healthy
• Spawner mission relay when local services are running

Next move: use /status, /diagnose, /run, or /board.
```

### /insights

Score: 5 (excellent). Intent: Show deferred insights status.

Reply 1:

```text
⚠️ Legacy dashboard commands are paused for launch v1.

Ready now
• Telegram chat and command routing
• Builder memory when the local bridge is healthy
• Spawner mission relay when local services are running

Next move: use /status, /diagnose, /run, or /board.
```

### /lessons

Score: 5 (excellent). Intent: Show deferred lessons status.

Reply 1:

```text
⚠️ Legacy dashboard commands are paused for launch v1.

Ready now
• Telegram chat and command routing
• Builder memory when the local bridge is healthy
• Spawner mission relay when local services are running

Next move: use /status, /diagnose, /run, or /board.
```

### /process

Score: 5 (excellent). Intent: Show deferred queue processing status.

Reply 1:

```text
⚠️ Legacy dashboard commands are paused for launch v1.

Ready now
• Telegram chat and command routing
• Builder memory when the local bridge is healthy
• Spawner mission relay when local services are running

Next move: use /status, /diagnose, /run, or /board.
```

### /reflect

Score: 5 (excellent). Intent: Show deferred reflection status.

Reply 1:

```text
⚠️ Legacy dashboard commands are paused for launch v1.

Ready now
• Telegram chat and command routing
• Builder memory when the local bridge is healthy
• Spawner mission relay when local services are running

Next move: use /status, /diagnose, /run, or /board.
```

## Interpretation

This is not a substitute for a live Telegram smoke with real Builder, Spawner, Spark CLI, and provider services online. It is valuable because it forces every registered command through Telegram composition and catches the failure/help/default states that users often see first.

Recommended next live pass: run the same command list against a private test chat with Builder and Spawner online, then compare success-path replies against this safe-harness baseline.
