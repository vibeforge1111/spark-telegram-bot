# Telegram Known Provider Failure Evidence

Safe before evidence for the Spark Compete PR:

- `before-mission-board-known-error.png` shows the Mission Board for the Hydration Tracker App mission with the known provider error visible: `codex CLI "codex" not found in PATH`.
- `before-telegram-unknown-error.png` shows the matching Telegram failure path where the user-facing reply only showed `unknown error`.

These screenshots avoid bot tokens, chat IDs, login codes, private usernames, raw logs, raw conversations, and private repo maps.

After evidence is covered by the targeted formatter test in `tests/missionRelayFormatting.test.ts`, which recreates the generic relay event plus Mission Board provider-result state and verifies Telegram formats the known provider error instead of `unknown error`.
