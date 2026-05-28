# Bug Hunter Proof

## Before / After

Before: /board showed a latest mission ID, but /mission status (no ID) returned only generic usage. After: /mission status (no ID) now suggests a concrete copyable command using the latest board mission ID. No chat IDs, private usernames, tokens, private messages, raw logs, or sensitive screenshots included.

## Why

After /run say exactly OK completed and /board showed the latest completed mission ID, /mission status without an ID returned only generic usage.

## Evidence

| Field | Value |
|---|---|
| PR | [124](https://github.com/vibeforge1111/spark-telegram-bot/pull/124) |
| Repo | vibeforge1111/spark-telegram-bot |
| Severity | medium |
| Files changed | `src/spawner.ts, src/index.ts` |
| Branch | `fix/mission-status-latest-hint-main` |
| Validated | pass (0 errors, 0 warnings) |