# Bug Hunter Proof

## Before / After

Before: when the Builder route gate failed before mission creation, Spark returned a generic Builder memory path failure; /diagnose could report healthy; /board showed the previous mission rather than the failed attempt, leaving the user unsure of mission state. After: the patch renders a pre-mission Builder gate failure reply that says no mission was created, says the attempt will not appear in /board, explains /diagnose can still be healthy, and gives a /run retry path.

## Why

When the Builder route gate fails before mission creation, Spark returns a generic Builder memory path failure message. It directs the user to /diagnose, but /diagnose can report healthy at that point and /board shows the previous mission, leaving the user unable to determine whether the attempted build was queued, failed, or never started.

## Evidence

| Field | Value |
|---|---|
| PR | [244](https://github.com/vibeforge1111/spark-telegram-bot/pull/244) |
| Repo | vibeforge1111/spark-telegram-bot |
| Severity | medium |
| Files changed | `src/errorExplain.ts, src/index.ts` |
| Branch | `fix/pre-mission-builder-gate-failure-message-main` |
| Validated | pass (0 errors, 0 warnings) |