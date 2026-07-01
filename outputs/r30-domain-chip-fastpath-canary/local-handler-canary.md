# R30 Domain Chip Fast-Path Canary

Generated: 2026-07-01T16:42:20.158Z
Claim scope: local_telegram_handler_replay_only

Status: pass
Cases: 8/8 passed

## Cases

- PASS r30-prd-fast-001 (prd_writing)
- PASS r30-daily-fast-001 (daily_schedule)
- PASS r30-daily-fast-002 (daily_schedule)
- PASS r30-daily-loop-advisory-001 (daily_schedule)
- PASS r30-boundary-prd-calendar-001 (boundary)
- PASS r30-boundary-live-timezone-001 (boundary)
- PASS r30-boundary-meta-timezone-001 (boundary)
- PASS r30-boundary-domain-chip-create-001 (boundary)

## Allowed Claims

- PRD Writing and Daily Schedule fast-path routes pass local Telegram handler replay for covered fresh prompts.
- Covered local no-wrong-fast-path boundaries for PRD calendar prompts, Spark runtime timezone prompts, generic no-action timezone discussion, and Domain Chip creation prompts.
- Daily Schedule loop-mode requests are advisory only in Telegram handler replay.

## Disallowed Claims

- Live Telegram deployment readiness is proven.
- A live Telegram message was sent or observed.
- Daily Schedule loop-mode requests operationally start an autoloop from Telegram.
- Any real calendar, CRM, repo, registry, installer pin, or network state was mutated.
