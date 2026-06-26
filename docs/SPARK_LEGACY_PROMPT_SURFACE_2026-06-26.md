# Spark Legacy Prompt Surface Gate

Date: 2026-06-26
Status: active control-proof gate

## Purpose

Legacy source material can remain useful for history, breadth, and explicit inspection, but it must not become hidden authority in ordinary Spark prompts or human-facing summaries.

This gate checks prompt-facing source files and human canary summary markdown for specific historical plans, catalogs, runbooks, handoff folders, and common human-readable titles that are classified as read-only evidence or archive candidates in `docs/SPARK_LEGACY_SOURCE_INVENTORY_2026-06-26.md`.

## Command

```bash
npm run control:proof:legacy-prompts -- --strict
```

Use `--json` when automation needs structured output.

## Boundary

The gate scans:

- prompt-building and ordinary Telegram/Builder/mission surface source files
- `outputs/live-canary-full/live-canary-summary.md`
- `outputs/live-canary-safe-first/live-canary-summary.md`

The gate intentionally does not scan docs, tests, ops scripts, or raw JSON evidence packets. Those surfaces may explicitly inspect or preserve legacy references as evidence. Human summaries and prompt surfaces may not carry those references unless a future gate adds an explicit inspected-history exception with proof.

## Failure Meaning

A strict failure means a legacy plan/source name or title reached a prompt or human summary surface where it could shape a fresh turn invisibly. The fix is to either:

- remove the legacy reference from the prompt/UI surface,
- promote the relevant invariant into an active Harness Core doc/test/canary, or
- move the historical detail behind an explicit inspect/raw/debug surface.

Do not silence the failure by renaming old evidence as current authority.
