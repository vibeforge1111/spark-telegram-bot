# Bug Hunter Proof

## Before / After

Before: handleRunCommand wrote missionId nowhere; status query fell through parseSpawnerBoardNaturalIntent to Builder with no session context; retry reached inferMissionFromRecentContext which used stale memory. After: lastRunMissions map stores missionId+goal+providers per chatId-userId on every successful handleRunCommand; isActiveTaskStatusQuery detects status phrases and replies with /mission status <id>; isRetryRequest detects retry phrases and re-dispatches the same goal.

## Why

After starting a long-running task with /run, asking 'What is the status of my task?' returns 'I don't currently have saved status for that'. Asking 'retry it' ignores the just-started run and instead dispatches unrelated previous work inferred from stale conversation memory.

## Evidence

| Field | Value |
|---|---|
| PR | [251](https://github.com/vibeforge1111/spark-telegram-bot/pull/251) |
| Repo | vibeforge1111/spark-telegram-bot |
| Severity | high |
| Files changed | `src/index.ts` |
| Branch | `fix/session-task-status-and-retry-main` |
| Validated | pass (0 errors, 0 warnings) |