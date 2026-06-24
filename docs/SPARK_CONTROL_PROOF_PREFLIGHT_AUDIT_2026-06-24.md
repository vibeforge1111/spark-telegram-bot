# Spark Control Proof Preflight Audit

Date: 2026-06-24
Status: read-only audit runbook

## Purpose

Run this before the control-proof goal prompt. The goal is to capture current truth and organize gaps before implementation starts.

This audit is read-only unless a tiny blocker prevents the audit from completing. Do not repair findings during the audit pass. Classify them, record evidence, then plan fixes in durable slices.

## Audit Principles

- Harness Core is authority; tracing proves what happened.
- The audit should find gap classes, not chase one-off fixes.
- Prefer recent, local, redacted evidence.
- Do not paste tokens, raw prompts, raw chat ids, full paths from private artifacts, stack traces, or provider internals into user-facing notes.
- If evidence conflicts, fresh runtime state wins over memory or old docs.

## Gap Classes

Use these labels consistently:

- `action_without_proof`: high-agency action lacks a Harness proof capsule or verified authority pointer.
- `missing_trace_join`: one plane cannot join to the turn/request/final answer.
- `raw_ref_leak`: user-facing output shows local paths, raw ids, opaque hashes, stack traces, or provider internals.
- `robotic_failure_reply`: normal Telegram reply exposes policy/router reasons or sounds like a deterministic packet.
- `runtime_capability_drift`: access level says one thing but the active runner can or cannot actually do another.
- `media_payload_gap`: non-text Telegram input cannot normalize into a safe typed media envelope.
- `stale_doc_rule`: documentation still describes pre-R28 behavior as current.

## Evidence Sources

### Runtime Health

Commands:

```bash
spark live status
spark status
spark providers test --role chat
```

Record:

- Spark Live ready or not.
- Telegram profiles running, especially `primary` and `sparkqa-bot`.
- Provider route and model.
- Any transient status races, marked as transient only after a clean rerun.

### Harness And Contract Coverage

Commands:

```bash
spark os compile --json
spark verify --deep
```

Record:

- contract coverage release blockers
- high-agency legacy gates
- dirty runtime truth
- missing source paths or stale generated artifacts

If `spark os compile --json` is unavailable in this checkout, record that as `runtime_capability_drift` and identify the owning module.

### Telegram Audits

Local evidence files:

```text
/Users/alchemistab/.spark/state/spark-telegram-bot/final-answer-gate-audit.jsonl
/Users/alchemistab/.spark/state/spark-telegram-bot/node-outbound-audit.jsonl
/Users/alchemistab/.spark/state/spark-telegram-bot/route-confidence-audit.jsonl
```

Record for the last 100 rows where available:

- request id coverage
- trace ref coverage
- raw path/id leaks
- replies without trace context
- ordinary replies containing policy/router reason codes
- final answers that followed an action without a proof pointer

### Builder Bridge

Local evidence file:

```text
/Users/alchemistab/.spark/state/spark-intelligence/logs/gateway-trace.jsonl
```

Record:

- request id coverage
- trace ref coverage
- gateway failures by class
- Builder replies that do not join to Telegram final-answer audit
- any raw error text that would be unsafe in Telegram

### Spawner And Mission Dispatch

Local evidence file:

```text
/Users/alchemistab/.spark/state/spawner-ui/prd-auto-trace.jsonl
```

Commands:

```bash
spark logs spawner-ui -n 100
```

Record:

- Governor authority present or missing
- request id and trace ref coverage
- dispatch rows without proof
- raw local path leaks in trace-facing fields
- whether proof-panel data can be rendered from one trace ref

### System Map, Memory, And Voice

Local evidence files:

```text
/Users/alchemistab/.spark/state/system-map/trace-index.json
/Users/alchemistab/.spark/state/system-map/memory-movement-index.json
/Users/alchemistab/.spark/state/system-map/voice-surface-view.json
/Users/alchemistab/.spark/state/spark-voice-comms/voice-runtime-state.json
```

Record:

- trace index freshness
- memory movement visibility and non-authority labeling
- voice readiness
- whether memory and voice can carry shared trace refs without exposing raw content

### Documentation Drift

Commands:

```bash
rg -n "keyword|memory.*authori|pending.*authori|trace.*authori|mission id|provider.*authori|legacy_local_gate|save the day" docs
```

Record:

- docs that imply pre-R28 authority behavior
- docs missing links to control-proof plan
- docs that need "New control-proof note" sections

## Output Packet

Write the audit result as a short packet before implementation begins:

```text
Control-proof preflight audit
Date:
Scope:

Runtime:
- Spark Live:
- Telegram profiles:
- Provider:

Harness:
- Contract blockers:
- Legacy high-agency gates:
- Dirty runtime truth:

Trace continuity:
- Telegram:
- Builder:
- Spawner:
- Provider:
- Memory:
- Voice:

Surface:
- Raw reason leaks:
- Repetitive fallback loops:
- Access/runtime drift:

Media:
- Text:
- Voice/audio:
- Photo/image:
- Document/file:

Docs:
- Stale docs:
- Docs updated before execution:

Gap register:
- [class] evidence -> proposed durable slice
```

## Gate To Start The Goal Prompt

Start the goal prompt only when:

- the audit packet exists or the user explicitly chooses to skip it
- the current branch and dirty state are known
- runtime health has been checked or marked unavailable
- docs index, preflight audit, plan, and goal prompt all point to each other
- first implementation slice is chosen from the gap register

