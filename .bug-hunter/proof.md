# Bug Hunter Proof

## Before / After

Before: errorExplain.ts unknown-category repair field contained spark logs spark-telegram-bot --lines 80 with no paste warning; Builder LLM generated paste crash logs spontaneously with no knowledge guard. After: repair field prioritises /diagnose and warns do not paste raw log output into Telegram chat; agent-knowledge/using-spark.md Boundaries section prohibits raw log paste requests.

## Why

When a user reports a bug and asks for debugging help, Spark responds with 'Paste the crash logs directly here' and surfaces 'spark logs spark-telegram-bot --lines 80' as a repair suggestion. Raw logs can contain API tokens, private filesystem paths, and sensitive user data.

## Evidence

| Field | Value |
|---|---|
| PR | [252](https://github.com/vibeforge1111/spark-telegram-bot/pull/252) |
| Repo | vibeforge1111/spark-telegram-bot |
| Severity | high |
| Files changed | `src/errorExplain.ts, agent-knowledge/using-spark.md` |
| Branch | `fix/no-raw-log-paste-in-debug-help-main` |
| Validated | pass (0 errors, 0 warnings) |