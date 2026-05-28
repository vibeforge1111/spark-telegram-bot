# Bug Hunter Proof

## Before / After

Before: redactText had no pattern covering Windows user paths, so the real machine username appeared verbatim in the Reason: line sent to Telegram. After: the WINDOWS_USER_PATH regex replaces any drive-letter Users name backslash segment with C:\Users\<username>\ before the string leaves the process. Token and secret redaction is unaffected.

## Why

When a spark CLI subprocess fails, the ChildProcessError message includes the full resolved path including the real machine username. This flows through extractErrorText and redactText unchanged, then appears in the Reason: line sent to Telegram, exposing the real Windows account name to any Telegram user who triggers an error.

## Evidence

| Field | Value |
|---|---|
| PR | [246](https://github.com/vibeforge1111/spark-telegram-bot/pull/246) |
| Repo | vibeforge1111/spark-telegram-bot |
| Severity | high |
| Files changed | `src/redaction.ts` |
| Branch | `fix/redact-windows-user-path-main` |
| Validated | pass (0 errors, 0 warnings) |