# Telegram Full Completion Report Evidence

Safe before evidence for the Spark Compete PR:

- `before-telegram-truncated-report.png` shows a Telegram completion handoff where Spark says the result is ready, but the report text ends mid-word at `What chan...`.

Safe after evidence:

- `after-telegram-detailed-report.png` shows a Telegram completion handoff after the fix where Spark sends the detailed report sections, including `Changed`, `Verification passed`, `Pushed commit`, and the clean worktree status.

The automated after proof is the targeted formatter regression test in `tests/missionRelayFormatting.test.ts`, which recreates a screenshot-shaped Codex success report and verifies the final report sections reach Telegram instead of being clipped or condensed away.
