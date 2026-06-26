# Spark Trace Join Checker

Date: 2026-06-26
Status: active implementation note

## Purpose

The trace join checker verifies the turn-level chain:

`user intent -> route decision -> action/no-action -> reply`

It is separate from the per-plane trace continuity audit. The continuity audit proves each evidence file is internally healthy. The trace join checker proves a Telegram route decision can be joined to delivered reply/proof evidence through redacted request, trace, and proof refs.

## Sources

- Natural route ledger: `spark.nlp.route_execution.v1`
- Final answer audit: `final-answer-gate-audit.jsonl`
- Node outbound audit: `node-outbound-audit.jsonl`

The route ledger now writes by default to Spark state and stores optional redacted `request_id`, `trace_ref`, and `harness_proof_ref` fields when turn context exists. It still excludes raw prompt text, chat ids, user ids, file paths, payloads, and provider internals. Set `SPARK_NATURAL_ROUTE_LEDGER=0` only for an intentional local experiment; doing so removes trace-join proof.

## Command

```bash
npm run control:proof:trace-join -- --strict
```

Useful variants:

```bash
npm run control:proof:trace-join -- --sample 100
npm run control:proof:trace-join -- --json
```

## Live Telegram Gate

Use the live gate before claiming SparkRecursive_bot has fresh deployed trace-join proof:

```bash
npm run control:proof:live-trace
```

This is shorthand for strict trace-join checking with `--require-live-evidence --min-route-rows 4 --min-no-action-rows 4`. It fails when the route ledger has fewer than four clean joined route rows, when those rows are stale, or when those rows do not also prove four clean no-action/read-only turns from the safe prompt set. The checker proves the safe prompt set through redacted route/action signatures, not raw prompt text.

The live report separates the route-ledger state from the join result:

- `missing`: the expected route ledger file is absent.
- `empty`: the ledger exists but has no rows.
- `invalid`: the ledger exists but has parse errors or no valid `spark.nlp.route_execution.v1` rows.
- `ready`: the ledger has valid natural-route rows.

When route rows are absent while final-answer or outbound Telegram proof audit rows exist, treat it as a route-ledger capture gap. First verify the live relay is running the current built source and that the live runtime did not disable `SPARK_NATURAL_ROUTE_LEDGER`, then send the safe SparkRecursive_bot prompts and rerun the live gate.

Safe Telegram prompts for the four live rows:

```text
I am mentioning build and mission, but do not start anything. What is the current Spark risk profile?

I am asking about a bug in mission routing. Do not launch a mission; just explain the likely failure class.

Do not repair anything. Just tell me whether a repair is needed right now, using fresh state.

If memory says Spawner is down but spark live status says it is up, which source wins?
```

After the prompts, rerun the live gate. A passing result must show `Live route proof: ready`, `No-action route proof: ready`, `Safe prompt proof: ready`, and no missing join, reply, proof, action/no-action, stale, or route-mismatch gaps.

Live rows must also be current. The default live evidence freshness window is four hours; use `--max-live-age-minutes <minutes>` only for an intentional local audit.

## Repeatable Handler Proof

Use the route boundary handler harness for a local Telegram-shaped proof sample:

```bash
npx ts-node ops/routeBoundaryHandlerHarness.ts --cases guard-006,guard-007,build-004,domain-chip-003
```

The harness now writes the natural route ledger and metadata-only outbound audit into the same temporary state directory, then embeds the trace join checker result in its report. A clean harness report must show joined route rows, zero missing reply joins, and zero missing proof joins.

This is handler-level proof. It runs the real text handler with Telegram-shaped update objects, but it does not call Telegram `getUpdates`, start bot polling, or prove Bot API delivery. Live Telegram proof is still required before claiming the deployed bot has produced fresh live route rows.

## Clean Result

A joined route row must have:

- intent and route decision fields
- action or no-action delivery evidence
- request and trace join keys
- a reply join in final-answer or outbound evidence
- a proof join when a Harness proof ref is present
- no shadow-vs-executed route mismatch
- no stale live route evidence when `--require-live-evidence` is active

An empty route sample is not clean proof. It means no route evidence was available to inspect.

The live gate also requires the safe prompt sample to be clean joined no-action/read-only evidence. Four joined action rows are not enough to pass `npm run control:proof:live-trace`; four generic no-action rows are not enough; and four sampled no-action rows with missing reply/proof joins are not enough either. The live proof must show the named no-action boundary was exercised end to end through the expected safe route/action signatures.

Legacy route rows that predate join refs should remain visible as gaps when inspected. Do not backfill them unless the backing evidence proves the exact request, trace, proof, action/no-action, and reply join.

## Relationship To The Ladder

This closes the route-to-reply proof boundary for reliability ladder step 4. It does not replace proof-capsule coverage; keep `npm run control:proof:capsules -- --strict` in the same reliability battery so action-capable routes still prove exactly one appropriate proof path or explicit no-action evidence.
