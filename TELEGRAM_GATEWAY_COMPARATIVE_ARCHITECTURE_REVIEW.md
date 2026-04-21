# Telegram Gateway Comparative Architecture Review

Status: reviewed
Date: 2026-04-21

## Purpose

Compare the Telegram ingress patterns used by OpenClaw and Hermes, identify the main security and operational tradeoffs, and define the better target architecture for Spark.

## Bottom Line

Spark should use a hybrid of the two systems:

- copy OpenClaw's public ingress ownership and internal fast-path / wake-path split
- copy Hermes's token-lock / instance-isolation discipline
- keep the public gateway thinner than either system

The correct Spark production shape is:

```text
Telegram
  -> one hosted Spark Telegram gateway
  -> internal routing / queue
      -> Builder
      -> Spawner
      -> workers
  -> one gateway-owned outbound sender
```

Not this:

- multiple Telegram receivers for the same token
- local polling as the permanent production model
- direct worker-to-Telegram sending

## OpenClaw

### What It Does Well

- treats channels and webhooks as a stable hosted app concern
- uses the app endpoint as the Telegram ingress owner
- forwards to the sandbox/runtime on a fast path when hot
- uses a wake/resume workflow when the runtime is cold

That is directionally the correct production pattern.

### Main Tradeoffs

- more moving parts
- more routing and persistence complexity
- stronger dependency on hosted infra and durable state

### Practical Risks Seen In Issue History

- account / bot routing confusion
- persistence and pairing drift in containerized deployment
- startup or webhook timing edge cases

Examples:

- `accountId` ignored in Telegram routing: `openclaw/openclaw#9351`
- secondary bot not receiving messages: `openclaw/openclaw#32874`
- bindings not honored in groups: `openclaw/openclaw#9545`
- pairing approval not persisting in Docker: `openclaw/openclaw#46567`
- webhook startup delay / message corruption risk: `openclaw/openclaw#26156`

### Spark Takeaway

Copy the ingress ownership and fast-path / wake-path split, but keep the first Spark version simpler:

- one bot
- one workspace
- one routing policy

Avoid clever multi-account routing until the core path is proven.

## Hermes

### What It Does Well

- strong local/operator usability
- one messaging gateway abstraction across channels
- clear security doctrine around auth, approval, isolation, and container boundaries
- profile isolation and token-lock concepts

Hermes is better than many systems at saying that credentials and runtime instances must not overlap loosely.

### Main Tradeoffs

- unified gateway surface increases blast radius if adjacent public surfaces are weak
- polling-first local posture is easier, but breaks down under multi-process ownership conflicts
- webhook mode is available, but the public ingress model is less strongly separated than Spark should prefer

### Practical Risks Seen In Docs / Issue History

- duplicate gateway or webhook ownership conflicts
- internal/system messaging leaking into chat
- broader gateway surfaces creating higher impact if auth is weak

Examples:

- duplicate live gateway conflict: `NousResearch/hermes-agent#7061`
- internal system messages leaking to Telegram: `NousResearch/hermes-agent#7921`
- unauthenticated API-server RCE exposure when misconfigured: `NousResearch/hermes-agent#6439`

### Spark Takeaway

Copy Hermes's token-lock and isolation ideas, but do not let the public Telegram ingress grow into a broad operator or execution surface.

## Threat Model For Spark

### 1. Token Ownership Conflict

Risk:

- two pollers
- two webhook servers
- old fallback gateway reclaims the token

Impact:

- dropped or split Telegram updates
- operator confusion
- unpredictable behavior

Mitigation:

- one production ingress owner only
- durable ownership lock
- startup refusal when ownership is already active

### 2. Cross-Workspace Misrouting

Risk:

- the wrong bot/account/workspace mapping delivers a message into the wrong runtime

Impact:

- privacy breach
- wrong operator sees the wrong state or response

Mitigation:

- strict bot-to-workspace mapping
- no magic fallback routing
- explicit correlation and audit IDs

### 3. Public Surface Expansion

Risk:

- Telegram ingress process also exposes too many admin, execution, or dashboard surfaces

Impact:

- larger blast radius if auth is weak
- easier remote compromise path

Mitigation:

- keep the public gateway thin
- separate operator/control surfaces from ingress
- keep tool execution behind internal boundaries

### 4. Replay / Duplicate Delivery

Risk:

- Telegram retries
- proxy retries
- tunnel instability

Impact:

- duplicate missions
- duplicate side effects

Mitigation:

- `update_id` dedupe
- request correlation
- idempotent run creation

### 5. Internal Status Leakage

Risk:

- system/debug/operator text accidentally reaches the user chat

Impact:

- confusing user experience
- potential internal detail leak

Mitigation:

- one outbound sender
- message typing and filtering
- never let workers send Telegram directly

### 6. State Corruption During Restart

Risk:

- partial write of subscriptions, pairings, or ownership state

Impact:

- delivery loss
- ghost ownership
- bad recovery

Mitigation:

- durable state store
- explicit recovery checks
- health commands and replay-safe behavior

## Better-Than-Both Spark Design

### Public Gateway Responsibilities

The public Telegram gateway should do only:

- verify webhook secret
- validate payload shape
- dedupe `update_id`
- persist or enqueue inbound event
- route internally
- send Telegram replies

It should not become:

- the full execution runtime
- a general admin panel
- a broad model-provider API server

### Internal Routing Responsibilities

Internal systems can be richer:

- Builder handles reasoning, memory, and chat runtime
- Spawner handles execution and mission control
- workers handle specialized tasks

But they remain behind the gateway.

### Delivery Model

- one ingress owner
- one outbound sender
- many internal workers
- fast path when hot
- wake path when cold

### Deployment Target

Production target:

- hosted stable Telegram gateway
- stable HTTPS hostname
- durable queue or relay between ingress and runtimes
- durable token ownership lock
- no direct local tunnel dependence for the final product

## What Spark Should Do Next

1. Keep `spark-telegram-bot` as the current single ingress owner.
2. Keep Builder and Spawner behind it.
3. Do not add another Telegram receiver.
4. Move from temporary tunnel posture to a stable hosted public gateway.
5. Add durable ownership lock and queue-backed ingress as the next real production step.

## Source Notes

Reviewed sources include:

- OpenClaw webhook architecture docs
- OpenClaw Telegram docs
- OpenClaw Telegram/account routing issue history
- Hermes Telegram docs
- Hermes security docs
- Hermes webhook docs
- Hermes release notes on profile/token isolation
- Hermes issue history around gateway conflicts and public-surface risk
