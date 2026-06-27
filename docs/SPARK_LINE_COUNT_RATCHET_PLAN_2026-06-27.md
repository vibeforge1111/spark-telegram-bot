# Spark Line-Count Ratchet Plan

Date: 2026-06-27
Status: reviewed baseline update for reliability cleanup

## Purpose

`npm run check:line-count` is part of the Spark reliability cleanup gate. It currently fails because the control-proof reliability work added or grew proof-heavy files before the R-21 line-count baseline was updated.

This update is not a feature expansion and does not weaken the release proof gates. It records the current oversized files as an explicit ratchet baseline so future work must shrink or at least not grow them.

## Current Violations

- `src/controlProofLiveCanaryPack.ts`: new god-file, 3829 lines.
- `src/index.ts`: grew from 10666 to 10804 lines.
- `tests/buildE2E.test.ts`: grew from 4547 to 4624 lines.
- `tests/controlProofLiveCanaryPack.test.ts`: new god-file, 4065 lines.
- `tests/missionRelayFormatting.test.ts`: grew from 1731 to 1741 lines.

## Owner And Plan

Owner: `spark-telegram-bot` reliability maintainers.

The baseline update is accepted only as a ratchet checkpoint. Follow-up cleanup should shrink these files in this order:

1. Extract `controlProofLiveCanaryPack` summary formatting, packet evidence detail helpers, and runtime evidence parsing into focused modules.
2. Split `tests/controlProofLiveCanaryPack.test.ts` fixtures from behavior assertions.
3. Move `src/index.ts` route/command helper clusters behind smaller handlers without changing Telegram behavior.
4. Split large E2E and mission relay formatting fixtures into reusable test helpers.

## Rule

Do not grow the updated baseline during reliability work. If a later slice touches one of these files, prefer extraction or deletion of duplicated fixtures before adding new lines.
