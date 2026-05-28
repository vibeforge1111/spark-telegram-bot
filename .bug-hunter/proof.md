# Bug Hunter Proof

## Before / After

Before: /start showed a long command list in Telegram. After: /start returns a short welcome with /diagnose, /run, /help, and an invitation to chat, while the full command list moved to /help.

## Why

/start returned a long command catalog before giving one clear next action.

## Evidence

| Field | Value |
|---|---|
| PR | [113](https://github.com/vibeforge1111/spark-telegram-bot/pull/113) |
| Repo | vibeforge1111/spark-telegram-bot |
| Severity | medium |
| Files changed | `src/index.ts` |
| Branch | `fix/start-progressive-discovery-main` |
| Validated | pass (0 errors, 0 warnings) |