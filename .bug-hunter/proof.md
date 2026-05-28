# Bug Hunter Proof

## Before / After

Before: errorExplain.ts repair fields contained spark verify --onboarding (five occurrences); spark-system.md listed it as a common check; no knowledge guard prevented raw paste requests. After: all five repair strings use real documented commands; spark-system.md lists only spark live status and spark status; using-spark.md explicitly prohibits invented flags and raw output paste requests.

## Why

When a user reported a broken setup, Spark suggested running spark verify --onboarding (a command that does not exist) and asked the user to paste the output here in Telegram chat.

## Evidence

| Field | Value |
|---|---|
| PR | [250](https://github.com/vibeforge1111/spark-telegram-bot/pull/250) |
| Repo | vibeforge1111/spark-telegram-bot |
| Severity | high |
| Files changed | `src/errorExplain.ts, agent-knowledge/spark-system.md` |
| Branch | `fix/spurious-verify-command-and-paste-request-main` |
| Validated | pass (0 errors, 0 warnings) |