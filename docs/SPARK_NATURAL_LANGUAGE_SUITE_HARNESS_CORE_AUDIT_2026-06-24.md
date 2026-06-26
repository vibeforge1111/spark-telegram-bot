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

## Refurbished Operating Model

The suite should become a three-lane system:

1. Legacy breadth lane: `npm run nl:live`, `npm run nl:replay`, and the old catalogs stay fast. They protect conversational coverage, route-hijack prevention, context recall, and old regression prompts. A pass here means "Spark still understands the old natural-language surface," not "Spark is control-proof."
2. Harness mapping lane: `npm run nl:harness-map` classifies old prompts into authority, mutation class, recommended use, and capture requirements. This lane exists to expose hidden mutations in old cases before promotion.
3. Control-proof lane: `npm run control:proof:canaries` is the new Harness-shaped release gate. Cases here must carry authority, mutation class, proof join, side-effect expectation, reply shape, screenshot or user-confirmation capture, and explicit pass criteria.

This keeps conversations fast while still letting the new Harness Core own the release proof. Converting the full old suite in place would make the everyday regression loop slower and blur the difference between broad conversation coverage and proof-grade control coverage.

Archive only cases that are duplicated, obsolete because the surface no longer exists, or unsafe to keep even as opt-in source material. Do not archive a case merely because it came from the older harness; first map it and decide whether it should remain legacy breadth, be promoted, or require intentional-action confirmation.

## 2026-06-24 Refurbishment Update

The suite should not be converted in place. Its normal runner should stay fast and useful for broad conversational regressions.

Instead, the old cases now have a lightweight Harness Core map:

```bash
npm run nl:harness-map
npm run nl:harness-map -- --catalog genesis100 --include-risky
npm run nl:live -- --harness-map --cases memory-001,access-002,mission-001
npm run nl:live -- --harness-map --harness-strict --cases smoke-001
```

The map derives:

- Harness authority expectation.
- Harness mutation class.
- Recommended use: keep as legacy breadth, promote after refurbishment, or run only with intentional action confirmation.
- Promotion gap: `none` for legacy breadth, or `name measured control-proof or trace-join gap before promotion` for cases that must not move forward until the proof gap is explicit.
- Whether proof and visual/user-confirmation capture are required if promoted.

This is deliberately a map, not a release gate. A mapped case is still missing live proof joins, side-effect capture, reply-shape expectations, and Telegram visual confirmation until it is copied into `control:proof:canaries` or an equivalent Harness-shaped canary.

Use `--harness-strict` only for candidate legacy subsets that are supposed to remain breadth-only. It exits nonzero when any selected case needs promotion or intentional-action confirmation, which keeps old "safe" labels from slipping into release proof without the new Harness fields.

Create or maintain a smaller Harness-shaped canary pack for SparkRecursive_bot as the release gate. That pack should draw representative prompts from the old catalogs, but each case must carry the new fields: authority, mutation class, proof join, side-effect expectation, reply shape, screenshot/user-confirmation capture, and pass criteria.

Initial command:

```bash
npm run control:proof:canaries -- --list
npm run control:proof:canaries -- --checklist
npm run control:proof:canaries -- --cases cp-streaming-001,cp-streaming-002 --checklist
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

Legacy NL evidence packets and observation templates now carry a deterministic claim boundary:

```text
claim_scope=legacy_breadth; release_gate=none; promotion_target=control_proof_canary
```

Automation and future agents should treat that scope as authoritative. A passing NL packet can support breadth confidence or promotion decisions, but it must not be joined into a release-ready claim until the relevant prompt has been promoted into the control-proof canary schema and rerun with proof joins, side-effect capture, reply-shape checks, and Telegram visual or user confirmation.

## Renewed Audit Decision

After checking the current mapper, canary pack, and focused tests, the decision still stands:

- Do not archive the old natural-language suite.
- Do not convert it in place into the Harness Core schema.
- Keep it fast and broad as a regression and drift sweep.
- Use `npm run nl:harness-map` only as a promotion helper.
- Use `npm run control:proof:canaries` as the current Harness-shaped live gate.

The reason is structural: older "safe" NL cases can still imply Harness mutations such as memory writes or access changes. Those cases are useful source material, but they need explicit authority, mutation, proof-join, side-effect, reply-shape, visual, and user-confirmation fields before they can act as release proof.

Refurbishment should happen by promotion:

1. Pick a representative old NL prompt.
2. Run `npm run nl:harness-map -- --case <id>` to classify the authority and mutation risk.
3. Copy the prompt into the control-proof canary schema only if it adds a missing behavior area.
4. Add exact pass criteria for proof joins, side effects, reply shape, and Telegram visual evidence.
5. Keep intentional actions out of default runs unless the operator explicitly includes them.

The live NL helper now rejects unknown explicit case ids. That keeps refurbishment work honest when an operator names old cases for mapping or promotion.

## 2026-06-24 14:14 +04 Re-Audit Notes

The renewed decision still matches the current code.

Commands checked:

```bash
npm run test -- --run tests/liveNlVerdict.test.ts tests/controlProofLiveCanaryPack.test.ts tests/turnIntent350Matrix.test.ts tests/harnessCoreVNext.test.ts tests/harnessContract.test.ts tests/naturalRouteDecision.test.ts
npm run nl:harness-map -- --cases memory-001,access-002,mission-001
npm run control:proof:canaries -- --list
npm run control:proof:canaries -- --category streaming --checklist
npm run control:proof:canaries -- --category rich_messages --checklist
npm run control:proof:canaries -- --cases cp-streaming-001,cp-streaming-002 --copy-paste
```

Result:

- The old NL suite is still useful as a fast breadth and drift sweep.
- The Harness map still correctly shows that old `safe` cases can hide real mutations; for example `memory-001` writes memory and `access-002` updates access.
- The control-proof canary pack is the right new Harness-shaped structure for release proof because it carries authority, mutation class, proof join, side-effect expectation, reply shape, and visual/user-confirmation capture.
- Streaming and rich-message behavior should stay in the canary pack, not in the legacy route harness, because the route harness intentionally strips live Telegram rendering behavior out of the loop. They are separate canary categories: use `cp-streaming-001,cp-streaming-002` together when judging the current Telegram feel.

Practical rule: refurbish by promotion, not conversion. Keep the old catalog quick and broad; copy only representative prompts into `control:proof:canaries` when they add coverage that the new Harness-shaped pack does not already have.

## 2026-06-24 Refurbishment Metadata

The control-proof canary pack now carries optional `sourceRefs` on promoted or derived cases.

Use this to keep the refurbished structure honest:

- `natural-language-live-commands.json` remains the old breadth catalog.
- `genesis-live-telegram-100.json` remains the historical/periodic drift benchmark.
- `control:proof:canaries` is the release-proof pack.
- When an old prompt becomes a canary, preserve its origin as `promoted_from`, `derived_from`, or `coverage_for`.

This gives the best of both systems: the old suite stays fast, and the new Harness Core structure can prove authority, mutation class, proof joins, side effects, reply shape, streaming/rich-message rendering, and live visual or user confirmation without losing the old regression lineage.

## 2026-06-24 14:40 +04 Streaming/Rich Recheck

The current code still supports the renewed decision.

Commands checked:

```bash
npm run test -- --run tests/liveNlVerdict.test.ts tests/controlProofLiveCanaryPack.test.ts
npm run nl:harness-map -- --cases memory-001,access-002,mission-001
npm run control:proof:canaries -- --category streaming --checklist
npm run control:proof:canaries -- --category rich_messages --checklist
npm run control:proof:canaries -- --cases cp-streaming-001,cp-streaming-002 --copy-paste
```

Result:

- The old NL suite should still be kept as fast breadth and promotion source material.
- The Harness map still shows hidden mutations in old "safe" cases, so converting the old suite in place would blur authority proof.
- Streaming and rich-message proof remains in `control:proof:canaries`, with screenshot and user-confirmation capture required for both current Telegram-feel checks.

## 2026-06-25 Recheck

The decision still holds after the source-staleness and duplicate-truth canary hardening slices.

Commands checked:

```bash
npm run nl:harness-map -- --cases memory-001,access-002,mission-001
npm run control:proof:canaries -- --category streaming --checklist
npm run control:proof:canaries -- --category rich_messages --checklist
npm run control:proof:canaries -- --list
```

Result:

- `memory-001`, `access-002`, and `mission-001` still require intentional-action confirmation when mapped into Harness Core shape. The old `safe` label is useful legacy metadata, not authority.
- Streaming and rich-message checks remain explicit canary categories with screenshot or user-confirmation capture. They should not be judged through the synthetic route-boundary harness because that path does not prove the live Telegram rendering experience.
- The control-proof canary pack now also rejects stale source snapshots and keeps duplicate-truth publish caveats classified, so promoted NL prompts must land in that pack or an equivalent Harness-shaped packet before they can support release claims.
- Keep refurbishing by promotion, not conversion: old NL cases stay fast breadth coverage, while promoted cases carry authority, mutation class, proof join, side-effect expectation, reply shape, and live evidence.

## 2026-06-25 Selection-Count Recheck

The decision still holds after the publish handoff proof-shape and docs-refresh slices. The latest `nl:harness-map` output now prints selected case count versus full catalog count, so operators can see when the safe-default lane is being audited instead of the complete catalog.

Commands checked:

```bash
npm run nl:harness-map
npm run nl:harness-map -- --include-risky
npm run nl:harness-map -- --catalog genesis100 --include-risky
npx ts-node tests/liveNlVerdict.test.ts
```

Current counts:

- Standard default map: `61 of 73` selected, with risky cases excluded unless explicitly selected.
- Standard full map: `73 of 73` selected, with risky cases included.
- Genesis full map: `100 of 100` selected, with risky cases included.

Result:

- Keep the standard and Genesis NL catalogs as breadth and promotion source material.
- Do not treat the default `61` selected cases as the full standard inventory; the full catalog remains `73` cases.
- Do not treat `nl:harness-map` or `nl:live` as release proof. Use them to choose promotion candidates, then move only the useful representatives into `control:proof:canaries` or an equivalent Harness-shaped packet.
- The current high-value promotion candidates remain the cases marked `promote_after_refurbish`; intentional action cases stay out of default live runs unless the operator explicitly includes and proves them.

## 2026-06-25 Capture-Requirement Recheck

The decision still holds after the trace-backlog proof wording slice.

The promotion helper now prints capture requirements and a `Promotion gap` requirement beside each mapped case. This closes a proof usability gap: an operator can see that old prompts promoted into Harness-shaped canaries need `observed_reply`, `side_effects`, `trace_join`, `proof_join`, `reply_shape`, `proof_panel`, and `screenshot_or_user_confirmation`, and also must name the measured control-proof or trace-join gap they close, instead of reading a plain "proof yes" cell as release-ready evidence.

Commands checked:

```bash
npm run nl:harness-map -- --cases memory-001,access-002,mission-001
npx ts-node tests/liveNlVerdict.test.ts
```

Result:

- Keep using the map as a promotion helper, not a release gate.
- Treat the new capture column as the minimum evidence list before any old NL prompt can support a control-proof release claim.
- Treat the `Promotion gap` column as the proof-first stop sign: if it says a measured gap must be named, do not promote the case for polish, UI expansion, media breadth, or composition upgrades alone.

## 2026-06-26 Evidence Boundary Recheck

The JSON evidence packet generated by `nl:verdict` now carries a stronger machine-readable authority boundary:

- It is a live QA evidence container, not release proof.
- Even when every selected legacy NL case passes, the packet remains legacy breadth evidence unless the case has been promoted into a Harness-shaped control-proof canary packet.
- It must not be treated as authority to execute high-agency actions.

This closes the misleading-proof gap where a fully filled old NL packet could look official enough to support release claims. The old suite still proves breadth and conversation drift; release and publish claims still go through `control:proof:canaries`.

## 2026-06-26 Observation Template Boundary Recheck

The blank `nl:verdict -- --observation-template` JSON now carries the same machine-readable authority boundary before anyone fills in replies or screenshots:

- It is a legacy natural-language live QA observation container, not Harness Core release proof.
- Passing every selected legacy case still remains breadth evidence unless the case is promoted into a Harness-shaped control-proof canary packet.
- The template must not be used to authorize high-agency actions.

This closes the pre-fill proof gap where a detached observation template could be copied around without the release-proof warning that appears on the final evidence packet.

## 2026-06-26 Observation Parser Boundary Recheck

The observation parser now enforces the same boundary when it imports filled JSON:

- Missing boundary metadata is normalized to `claimScope=legacy_breadth` and the standard `release_gate=none` authority warning.
- Any observation file that claims a non-legacy scope or release-proof gate is rejected before a packet can be built.
- The generated packet still writes the standard boundary, so old NL observations remain breadth evidence even when every selected case passes.

This closes the source-edge proof gap where a hand-edited observation file could try to promote an old NL run into release evidence by changing metadata instead of moving the case into `control:proof:canaries`.

## 2026-06-26 Builder Contract Join Recheck

Builder now exposes the same boundary at the source catalog edge through `ops/natural-language-live-commands.json` as `harness_core_contract`.

Required join:

- Builder catalog contract: `claim_scope=legacy_route_shape`, `release_gate=none`, `simulation_cases_are_release_proof=false`, `promotion_target=control_proof_canary`.
- Telegram legacy NL packets and templates: `claim_scope=legacy_breadth`, `release_gate=none`, `promotion_target=control_proof_canary`.
- Control-proof canaries: only promoted or derived representatives can support release claims, and only after authority, mutation class, side effects, proof join, trace join, reply shape, screenshot/user confirmation, and pass criteria are filled in.

Treat those names as one proof boundary across repos. The wording differs slightly because Builder is describing the route-shape matrix and Telegram is describing legacy breadth evidence packets, but both mean the same thing: old natural-language cases are source material and drift coverage, not Harness Core release proof.

Promotion remains proof-first. Do not use an old NL prompt to justify expanded UI, media handling, or new composition features unless the mapped case directly closes a measured control-proof or trace-join gap. If the case only proves that a surface would be nicer, keep it as legacy breadth or archive it until a proof gap names the missing authority, side effect, trace join, proof join, reply shape, or live Telegram evidence.
