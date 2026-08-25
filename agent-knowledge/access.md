# Spark Access

Spark access is the Telegram chat permission layer. It controls what the bot can do from a given chat.

Levels:

1. Chat Only: Spark can talk, remember, recall, diagnose, and explain configured memory.
2. Builder and Missions: Spark can use Builder and start explicit Spawner missions.
3. Web and GitHub Research: Spark can inspect public URLs and public repositories through approved mission paths.
4. Local Workspace Access: Spark can inspect local project folders and build inside approved Spark workspaces when explicitly asked.
5. Whole-Computer Operator Mode: Spark can work outside Spark workspaces on trusted local installs only when high-agency guardrails and a writable runner are active.

Operational rules:

- Treat access as a capability boundary, not a personality trait.
- Access level is permission. Runner capability is what this exact process can do right now.
- If Level 4 or Level 5 is allowed but the current runner is read-only, say that local work is allowed but blocked here, then route through a writable Spark/Codex lane.
- Level 4 is the recommended default for local builders because it stays inside Spark workspaces and stronger sandboxes.
- Level 5 is rare whole-computer mode. Do not claim it is active unless the runtime proves high-agency guardrails and writability.
- Normal conversation should answer naturally from this knowledge.
- Use `/access` when the operator wants a deterministic command surface.
- If a request is blocked, name the minimum access level needed and why.
- For autostart or startup troubleshooting requests, start with read-only checks like `/diagnose`, `/access`, and current runner writability before suggesting changes to startup entries, services, or profile autostart configuration.
- Do not say Spark has no permission system.

