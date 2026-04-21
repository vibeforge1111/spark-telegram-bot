# Spark Telegram <> Spawner Task

Status: in progress
Date: 2026-04-21

## Goal

Ship and harden one thin Telegram-to-Spawner bridge for running a plain-text goal, controlling the resulting mission, and receiving mission updates back from Spawner.

Follow-on goal:

Move `@SparkAGI_bot` to a single-owner webhook gateway so multiple local terminals cannot steal Telegram updates from each other.

## Principles

- No features beyond the requested bridge.
- No abstractions for single-use code.
- No configurability unless it is required to make the bridge usable.
- No cleanup outside the files touched for this task.
- Every changed line must trace back to `/run` or mission control.

## Diligence

- Mirror Spawner mission states exactly in Telegram.
- Carry `missionId`, `requestId`, `chatId`, and `userId` together.
- Carry Telegram `update_id` through webhook handling and dedupe.
- Keep Telegram updates short and meaningful.
- Keep admin-only mission control strict.
- Make failures say where the bridge broke.
- Keep one Telegram token owner in production mode.

## Scope

### In

- `/run <goal>` in Telegram
- `/mission <status|pause|resume|kill> <missionId>` in Telegram
- one Spawner endpoint to turn a plain-text goal into a dispatched mission
- admin-only gate on orchestration commands
- mission correlation fields for Spark-originated runs
- mission updates flowing back to Telegram through Spark or the bot

### Out

- provider selection UX
- approval workflows
- recursive agent planning
- any Paperclip work
- multi-bot gateway orchestration

## Current State

- [x] `/run <goal>` exists
- [x] `/mission <status|pause|resume|kill> <missionId>` exists
- [x] bot and Spawner build for the current bridge
- [x] Telegram ingress is stable under multi-process contention
  verify: with a webhook-mode owner active, a second forced polling process refused startup before `getUpdates` and could not steal the bot token
- [x] public webhook ingress works end to end
  verify: `@SparkAGI_bot` received `/start` and `/run say exactly OK` through live webhook ingress, created mission `spark-1776772275057`, and delivered the terminal completion update back to Telegram
- [x] webhook mode restored after tunnel failure
  verify: broken `localtunnel` ingress was replaced, Telegram webhook ownership was re-established on `https://assumption-nickname-tested-atlas.trycloudflare.com/telegram-live`, and live Telegram commands worked again

## Phases

### Phase 1. Contract + Correlation

1. Lock one request contract to Spawner
   status: done
   verify: `/run` sends one stable shape with `goal` and correlation fields only
2. Add mission correlation
   status: done
   verify: Telegram run can be traced by `missionId`, `requestId`, `chatId`, and `userId`

### Phase 2. Event Relay

1. Accept event updates back from Spawner
   status: done
   verify: normal mission progress does not require manual polling to be visible in Telegram
2. Keep mission control on existing Spawner endpoints
   status: done
   verify: `status/pause/resume/kill` still round-trip against localhost

### Phase 3. Telegram Board

1. Add `/board`
   status: done
   verify: real missions are grouped by `running`, `paused`, `completed`, `failed`, and optionally `draft`
2. Keep it message-native
   status: done
   verify: no second workflow state is introduced

### Phase 4. Smoke Test

1. Run one full smoke test
   status: done
   verify: Telegram `/run say exactly OK` created mission `spark-1776769087811`, `/mission status` returned live provider state, and `/board` reflected the active run
2. Run one localhost bridge smoke test before the live Telegram check
   status: done
   verify: Spawner accepted `requestId/chatId/userId`, mission `spark-1776766317580` completed, and the mission board reflected the terminal `completed` state

### Phase 5. Webhook Gateway

1. Add webhook mode for Telegram ingress
   status: done
   verify: local webhook mode accepted updates on `/telegram-hook` and reused the existing bot handlers
2. Validate webhook secret and dedupe `update_id`
   status: done
   verify: wrong secret returned `401`, first delivery for `update_id=900003` returned `200`, and replay returned `duplicate: true`
3. Reuse existing command handlers through the webhook path
   status: done
   verify: synthetic Telegram `/board` updates were handled through `bot.handleUpdate()` without a second command router

### Phase 6. Single-Owner Enforcement

1. Block polling startup when webhook mode is configured
   status: done
   verify: forced `TELEGRAM_GATEWAY_MODE=polling` refused startup when webhook env was present, and polling startup now checks Telegram webhook ownership before `getUpdates`
2. Keep outbound Telegram sending inside the gateway only
   status: done
   verify: Spawner mission relay now requires `X-Spark-Telegram-Relay-Secret` when `TELEGRAM_RELAY_SECRET` is configured, so background Telegram sends are accepted only through the gateway relay

### Phase 7. Persistence + Recovery

1. Persist webhook dedupe and mission correlation safely
   status: done
   verify: webhook `update_id=910001` was persisted to `.spark-telegram-webhook-state.json` and replayed as `duplicate: true` after restart; mission relay subscriptions persist `missionId/requestId/chatId/userId/updateId`
2. Document production webhook setup and local debug fallback
  status: done
  verify: `TELEGRAM_WEBHOOK_SETUP.md` documents production webhook env, startup mode rules, webhook deletion, and local polling fallback

### Phase 8. Hardening Docs

1. Document single-owner operational hardening
   status: done
   verify: README, webhook setup, and feature docs all call webhook mode canonical and explain the remaining temporary tunnel gap
2. Publish a focused hardening checklist
   status: done
   verify: `TELEGRAM_GATEWAY_HARDENING.md` tracks stable endpoint, startup path, secret hygiene, health checks, and recovery order

### Phase 9. Health + Stable Tunnel Cutover

1. Add an operator webhook health command
   status: done
   verify: `npm run health:webhook` checked Telegram ownership, public webhook reachability, local webhook listener reachability, and local relay reachability against the live webhook setup and returned `Webhook health: OK`
2. Prepare named-tunnel cutover docs and config
   status: done
   verify: `TELEGRAM_NAMED_TUNNEL_SETUP.md` and `ops/cloudflared/config.example.yml` define the stable-hostname cutover path away from the temporary quick tunnel
3. Add a named-tunnel readiness check
   status: done
   verify: `ops/cloudflared/check.ps1` now detects the local `cloudflared` install, checks for an origin cert, and tells the operator whether named-tunnel cutover is blocked on `cloudflared tunnel login`

### Phase 10. Queue-Backed Ingress

1. Persist validated webhook updates before command handling
   status: done
   verify: webhook updates are now written to `.spark-telegram-inbox.json` before `200 OK`, so a restart after acknowledgement does not silently drop the update
2. Drain inbound Telegram updates through one internal processor
   status: done
   verify: queued Telegram updates are processed sequentially through one gateway-owned inbox processor instead of direct inline `bot.handleUpdate()` calls from the webhook route

### Phase 11. Durable Ownership Lease

1. Add a durable gateway ownership lease
   status: done
   verify: startup now writes a token-scoped ownership lease with pid/hostname/heartbeat and refuses to start when another live local gateway instance already owns the same bot token
2. Recover from stale ownership after crashes
   status: done
   verify: the ownership lease expires after a short TTL, so a crashed gateway does not permanently block restart on the same host

### Phase 12. Thin Public Ingress

1. Keep the local/public webhook server surface explicit
   status: done
   verify: the gateway HTTP server now intentionally exposes only the Telegram webhook path plus `GET /healthz`
2. Align health checks with the explicit ingress boundary
   status: done
   verify: `npm run health:webhook` now checks the local `GET /healthz` route instead of relying on a generic 404 response from the webhook listener

### Phase 13. Atomic Gateway State

1. Make gateway state writes atomic
   status: done
   verify: webhook dedupe state, relay registry state, inbound inbox state, and ownership leases now write through an atomic temp-file rename path instead of direct JSON overwrite
2. Create a cleaner seam for a future shared store
   status: done
   verify: gateway state read/write logic now goes through one small JSON-state helper instead of being duplicated across the gateway modules

### Phase 14. Configurable Gateway State Directory

1. Make gateway state location explicit
   status: done
   verify: gateway webhook state, relay state, inbox state, and ownership leases now resolve through `SPARK_GATEWAY_STATE_DIR` instead of assuming the repo working directory
2. Prepare hosted persistence mounts
   status: done
   verify: atomic state writes now create the target state directory automatically, so hosted deployments can mount a dedicated persistent state path without changing gateway code

### Phase 15. Hosted Architecture Lock-In

1. Define the hosted public gateway target
   status: done
   verify: `HOSTED_TELEGRAM_GATEWAY_ARCHITECTURE.md` defines the public ingress plane, control plane, execution plane, and data plane
2. Define the non-technical-user-safe onboarding target
   status: done
   verify: the hosted architecture doc explicitly removes tunnel/webhook complexity from end users and keeps that complexity inside Spark-owned infrastructure

### Phase 16. Transactional Gateway State Store

1. Consolidate gateway state into one transactional local store
   status: done
   verify: webhook dedupe state, relay state, inbox state, and ownership leases now persist through one SQLite-backed gateway state store instead of scattered JSON files
2. Preserve existing local state during migration
   status: done
   verify: the gateway state helper lazily imports existing JSON state files into the SQLite store on first read, so restart does not discard the current local gateway state

## Success Criteria

- Admin can run `/run <goal>` and get back a mission ID.
- Admin can run `/mission status <missionId>` and see provider state.
- Admin can run `/mission pause|resume|kill <missionId>`.
- Telegram can receive mission lifecycle updates without inventing a second control path.
- Bot and Spawner both build after the changes.
- Telegram update ownership stays stable even while other local terminals and agents are running.
