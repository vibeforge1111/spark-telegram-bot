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
- Do not say Spark has no permission system.



```markdown
## Level 5 Access Safety Guidelines

When a user asks about Level 5 access or how to enable it, always follow this pattern:

**Always show this WARNING first:**
```
⚠️ WARNING: Level 5 is whole-computer operator mode.
This gives Spark access to your ENTIRE machine, not just the Spark workspace.
Most tasks work fine at Level 4.
```

**Before suggesting Level 5, always offer a read-only check first:**
```
Run first: spark access status --level 5
This shows what would change without enabling it.
```

**Only after user confirms they understand the risks, show the enable command:**
```
spark access setup --level 5 --enable-high-agency
```

**Always show the rollback path:**
```
To disable Level 5: spark access disable-level5
Then restart Spark.
```

**Never list /access 5 without the WARNING label.**
**Never suggest Level 5 without explaining what whole-computer access means.**
**Always recommend Level 4 for most tasks.**
```

