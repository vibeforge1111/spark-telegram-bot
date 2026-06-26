# Spark Surface Eval Gate

Date: 2026-06-26
Status: active control-proof gate

## Purpose

Spark replies can be logically correct and still fail the product if they sound like a template, expose internal routing, or make the user parse a deterministic packet. This gate checks the human-facing replies in the full SparkRecursive_bot canary packet.

## Command

```bash
npm run control:proof:surface -- --strict
```

Use `--observations <path>` to inspect another canary packet and `--json` for automation.

## Boundary

The gate checks observed replies for natural, compact-card, media, and clarification surfaces. It skips proof panels because `/proof` is intentionally an inspect surface.

The gate fails:

- missing observed replies
- raw Harness reason codes, proof refs, trace refs, local paths, or stack traces
- legacy plan, catalog, runbook, or handoff names/titles in observed replies
- generic chatbot phrases
- ordinary replies that collapse into `Mission`, `Provider`, `Move`, or similar report-card headings
- bold Markdown, dash-family punctuation, emoji spam, or oversized paragraph dumps
- proof-panel and canary-summary status rows leaking into natural surfaces, such as `Blocking gap planes`, `Legacy proof gaps visible`, `Gate scope`, `Release gate`, or `Publish gate`

## Use

Run this after canary evidence is refreshed and before claiming that Spark is pleasant to use, not only logically correct. If a reply fails, fix the source surface or recapture the canary with the corrected reply shape.
