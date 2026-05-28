# Bug Hunter Proof

## Before / After

Before: Builder LLM led with the spark security revoke-all command then added warnings after -- default LLM pattern for how-to questions, with no knowledge guard overriding it for destructive operations. After: agent-knowledge/using-spark.md Boundaries rule instructs Spark to always explain blast radius first, offer a dry-run alternative if available, and show the command only after explicit user confirmation.

## Why

When a user asks how to run spark security revoke-all, Spark immediately shows the command then adds a warning after. For a destructive irreversible command that revokes all security tokens and credentials, the warning comes too late.

## Evidence

| Field | Value |
|---|---|
| PR | [253](https://github.com/vibeforge1111/spark-telegram-bot/pull/253) |
| Repo | vibeforge1111/spark-telegram-bot |
| Severity | high |
| Files changed | `agent-knowledge/using-spark.md` |
| Branch | `fix/destructive-command-warning-order-main` |
| Validated | pass (0 errors, 0 warnings) |