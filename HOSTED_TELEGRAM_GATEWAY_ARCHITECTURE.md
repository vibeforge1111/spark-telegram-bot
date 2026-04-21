# Hosted Telegram Gateway Architecture

Status: target deployment architecture
Date: 2026-04-21

## Purpose

Define the production architecture for a secure, non-technical-user-friendly Spark Telegram product.

This is the hosted target, not the temporary local-tunnel posture.

## Product Goal

Make Telegram onboarding feel simple for non-technical users while keeping the risky parts centralized and professionally managed by Spark.

Users should never need to:

- run a tunnel
- choose polling vs webhook
- manage webhook secrets
- expose a local machine publicly
- reason about multiple bot receivers

## Core Principle

Complexity belongs to Spark, not to the user.

## Deployment Planes

### 1. Public Ingress Plane

One small hosted service owns Telegram ingress.

Responsibilities:

- receive Telegram webhooks
- verify webhook secret
- validate request shape and size
- dedupe `update_id`
- persist/enqueue inbound events
- send Telegram replies

It should expose only:

- Telegram webhook route
- minimal health route

It should not expose:

- admin UI
- provider configuration APIs
- direct execution APIs
- dashboards
- general tool runtimes

### 2. Control Plane

A separate operator/admin surface manages:

- bot onboarding
- token storage
- access policy
- workspace/user mapping
- model/provider settings
- chip/system enablement
- audit and support tooling

This plane must not share the public Telegram ingress boundary.

### 3. Execution Plane

Internal systems do the real work:

- Builder for reasoning, memory, and agent runtime
- Spawner for mission orchestration
- workers for specialized tasks

These services should not receive Telegram webhooks directly.

### 4. Data Plane

Durable storage for:

- inbound event queue
- dedupe state
- token ownership lock
- mission correlation
- workspace/user bindings
- audit trail

The current file-backed gateway state is acceptable for internal development, but the hosted product should move to a real shared store.

## Trusted Flow

```text
Telegram
  -> Hosted Spark Telegram Gateway
  -> Durable queue / state store
  -> Builder / Spawner / workers
  -> Hosted Spark Telegram Gateway
  -> Telegram
```

## Non-Technical User Experience

The ideal product flow is:

1. User connects Telegram bot through a guided UI.
2. Spark validates the token and stores it securely.
3. User chooses:
   - who may talk to the bot
   - primary/fallback model
   - which chips/systems to enable
4. Spark applies safe defaults.
5. User starts using Telegram immediately.

The user should not see:

- webhook URLs
- tunnel setup
- reverse proxy setup
- relay secrets
- local gateway modes

## Security Model

### Public Ingress Security

- mandatory Telegram webhook secret validation
- method and content-type enforcement
- strict request size limits
- explicit route allowlist
- fast ack only after durable enqueue
- one outbound Telegram sender

### Internal Security

- Builder and Spawner remain behind the gateway
- internal auth between services
- dangerous execution stays behind execution-plane boundaries
- no worker sends Telegram directly

### Multi-Tenant Safety

- explicit bot-to-workspace binding
- explicit workspace-to-runtime routing
- no ambiguous fallback routing
- correlation IDs on every run

## Primary Risks

### 1. Ingress Compromise

If the public gateway is compromised, an attacker may gain bot-token use or routing control.

Mitigation:

- thin ingress
- isolated secrets
- no execution surface on the public service

### 2. Cross-Workspace Misrouting

A routing or binding bug could leak messages or actions across users.

Mitigation:

- strict binding model
- audit trail
- no heuristic routing

### 3. Duplicate / Replayed Updates

Webhook retries can trigger duplicate runs.

Mitigation:

- dedupe
- idempotent run creation
- durable inbound queue

### 4. Control Plane Overreach

If operator/admin capabilities share the same public boundary, blast radius grows sharply.

Mitigation:

- separate control plane
- separate auth boundary

## Spark Implementation Roadmap

### Stage 1. Current Internal Foundation

Already in place:

- queue-backed ingress
- same-host ownership lease
- thin public HTTP surface
- explicit health route
- atomic local state writes
- configurable state directory

### Stage 2. Hosted Production Gateway

Next:

- deploy gateway on a stable public host
- replace quick tunnel posture with stable HTTPS
- mount persistent gateway state

### Stage 3. Shared Durable Store

Next after hosting:

- move gateway state from local files to shared durable storage
- support stronger recovery and future HA

### Stage 4. Control Plane Separation

Then:

- separate bot onboarding and admin/config APIs from public ingress
- keep ingress service thin

### Stage 5. Full Product Onboarding

Then:

- guided non-technical onboarding
- default-safe model/chip selection
- zero tunnel/webhook complexity shown to users

## Recommendation

For Spark, the safest product architecture is not local polling and not broad public hosting.

It is:

- one thin hosted webhook gateway
- one separate control plane
- one separate execution plane
- one durable data plane
- one bot token owner at a time
