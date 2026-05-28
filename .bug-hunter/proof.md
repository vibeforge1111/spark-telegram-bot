# Bug Hunter Proof

## Before / After

Before: npm run health:polling from module parent failed with ENOENT. After: docs now direct users to source/ directory where the command works correctly.

## Why

Running npm run health:polling from ~/.spark/modules/spark-telegram-bot/ fails with npm ENOENT because package.json is under source/.

## Evidence

| Field | Value |
|---|---|
| PR | [101](https://github.com/vibeforge1111/spark-telegram-bot/pull/101) |
| Repo | vibeforge1111/spark-telegram-bot |
| Severity | medium |
| Files changed | `README.md` |
| Branch | `docs/health-polling-source-dir-main` |
| Validated | pass (0 errors, 0 warnings) |