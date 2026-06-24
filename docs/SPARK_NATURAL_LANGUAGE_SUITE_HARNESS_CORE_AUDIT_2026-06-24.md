# Spark Natural Language Suite Harness Core Audit

Date: 2026-06-24
Status: audit decision

## Question

Should the older natural-language Telegram suite remain as-is, be archived, or be refurbished for the new Harness Core control-proof system?

## Files Audited

- `ops/natural-language-live-commands.json`
- `ops/genesis-live-telegram-100.json`
- `ops/liveNlCommandSuite.ts`
- `ops/liveNlVerdictReport.ts`
- `ops/routeBoundaryHandlerHarness.ts`
- `src/liveNlVerdict.ts`
- `vendor/harness-core/ts-dist/index.d.ts`

## Inventory

Standard natural-language catalog:

- 73 total cases.
- 61 safe, 5 mission, 4 writes-files, 3 external.
- 23 suites.
- 3 multi-turn cases.
- 66 cases contain explicit side-effect or boundary language.

Genesis catalog:

- 100 total cases.
- 90 safe, 6 mission, 1 writes-files, 3 external.
- 10 even 10-case suites.
- 93 cases contain explicit side-effect or boundary language.

## Finding

The old suite is still valuable, but it is not the release-proof shape anymore.

It is good at preserving broad conversational behavior:

- route-hijack prevention
- no-action boundaries
- memory and context recall
- local-service and Spawner language
- mission/build/diagnostic phrasing
- low-information acknowledgements
- broad Genesis conversation drift

It is weak as a Harness Core release gate because the catalog expectation is mostly:

- `expectedRoute`
- `expectedOutcome`
- human-scored side effects after the fact

The new control-proof model needs first-class expectations for:

- fresh authority decision
- mutation class
- proof capsule or redacted proof ref
- evidence-plane joins
- reply surface shape
- streaming/rich-message behavior
- screenshot or Telegram visual confirmation
- user confirmation for intentional actions

The synthetic route-boundary harness also disables streaming and draft previews, which is correct for deterministic handler testing but means it cannot prove the current streaming and rich-message experience.

## Decision

Do not archive the standard natural-language suite.

Refurbish its role:

- Keep `ops/natural-language-live-commands.json` as the broad behavior and regression catalog.
- Keep `ops/routeBoundaryHandlerHarness.ts` as a fast route-boundary harness for selected old cases.
- Keep `ops/liveNlVerdictReport.ts` as a structured evidence-packet exporter for historical and broad live sessions.
- Stop treating `nl:live` alone as the control-proof release gate.

Treat `ops/genesis-live-telegram-100.json` as a historical breadth benchmark and periodic drift sweep, not as the everyday control-proof pack.

Create or maintain a smaller Harness-shaped canary pack for SparkRecursive_bot as the release gate. That pack should draw representative prompts from the old catalogs, but each case must carry the new fields: authority, mutation class, proof join, side-effect expectation, reply shape, screenshot/user-confirmation capture, and pass criteria.

Initial command:

```bash
npm run control:proof:canaries -- --list
npm run control:proof:canaries -- --checklist
```

## Refurbishment Plan

1. Add a new Harness-shaped control-proof canary pack of 20-30 cases.
2. Keep old NL prompts as source material, not the final schema.
3. Map old `risk` values to Harness mutation classes:
   - `safe` -> `none` or `read_only`
   - `mission` -> `launches_mission`
   - `writes_files` -> `writes_files`
   - `external` -> `external_network`
4. Map old `expectedRoute` to a non-authoritative expected route family.
5. Add expected authority outcomes and proof joins beside the route family.
6. Keep intentional action probes opt-in only.
7. Require Telegram visual evidence for streaming, rich messages, and media.
8. Use the old suite for broad regression before larger releases, after the smaller control-proof pack passes.

## Operating Rule

`npm run nl:live` answers "does Spark still understand a broad range of natural-language prompts?"

The control-proof canary pack answers "can Spark prove authority, side effects, trace joins, and Telegram readability for the behaviors we are about to ship?"

Both are useful. Only the second one should be used as the main release gate for the new Harness Core work.
