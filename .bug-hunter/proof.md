# Bug Hunter Proof

## Before / After

Before: task_failed handler clipped the raw error string with no recovery path. After: renderTaskFailureBody() detects bare unknown errors, substitutes a bounded explanation, and appends /run retry and /mission status commands. No raw logs, chat IDs, or private content included.

## Why

When a build step failed with no error detail, Spark returned a bare unknown-error message with no recovery path.

## Evidence

| Field | Value |
|---|---|
| PR | [239](https://github.com/vibeforge1111/spark-telegram-bot/pull/239) |
| Repo | vibeforge1111/spark-telegram-bot |
| Severity | high |
| Files changed | `src/missionRelay.ts` |
| Branch | `fix/task-failed-meaningful-error-main` |
| Validated | pass (0 errors, 0 warnings) |