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

## Clean Result

A joined route row must have:

- intent and route decision fields
- action or no-action delivery evidence
- request and trace join keys
- a reply join in final-answer or outbound evidence
- a proof join when a Harness proof ref is present
- no shadow-vs-executed route mismatch

An empty route sample is not clean proof. It means no route evidence was available to inspect.

Legacy route rows that predate join refs should remain visible as gaps when inspected. Do not backfill them unless the backing evidence proves the exact request, trace, proof, action/no-action, and reply join.

## Relationship To The Ladder

This closes the first enforceable piece of reliability ladder step 4. It does not by itself prove every action-capable route has exactly one proof capsule; that remains the next proof-capsule coverage slice.
