# Spark Reliability Eval Coverage

Date: 2026-06-26
Status: active implementation note

## Purpose

This checker makes the reliability ladder eval requirement explicit. It verifies that the current control-proof canary catalog still covers the old-edge categories that historically caused Spark drift:

- `do not run`
- `just explain`
- build/mission mentions
- images
- audio and voice
- stale memory conflicts
- streaming/rich messages
- publish handoffs

## Command

```bash
npm run control:proof:evals -- --strict
```

Useful variants:

```bash
npm run control:proof:evals
npm run control:proof:evals -- --json
```

## Boundary

This is a coverage gate, not a new feature gate. It does not create new UI, media handling, or streaming behavior. It proves that the named reliability categories are represented by current Harness-shaped canary cases with expected prompts, routes, authority expectations, mutation classes, reply shapes, risk levels, and capture requirements.

The gate also checks the capture shape needed to prove the route boundary: observed reply, side-effect evidence, proof-panel capture where applicable, screenshot for visual/media/publish surfaces, and user confirmation. No-action and publish-handoff categories must remain non-mutating/read-only; if they drift into action-capable mutation classes, this gate fails.

If a canary prompt, category, route, or required capture is changed, this checker should fail until the replacement still proves the same old-edge boundary.
