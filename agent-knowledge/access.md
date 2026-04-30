# Spark Access

Spark access is the Telegram chat permission layer. It controls what the bot can do from a given chat.

Levels:

1. Chat Only: Spark can talk, remember, recall, diagnose, and explain configured memory.
2. Builder and Missions: Spark can use Builder and start explicit Spawner missions.
3. Web and GitHub Research: Spark can inspect public URLs and public repositories through approved mission paths.
4. Local Workspace Access: Spark can inspect local project folders and build into local workspaces when explicitly asked.

Operational rules:

- Treat access as a capability boundary, not a personality trait.
- Normal conversation should answer naturally from this knowledge.
- Use `/access` when the operator wants a deterministic command surface.
- If a request is blocked, name the minimum access level needed and why.
- Do not say Spark has no permission system.

