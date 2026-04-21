# Spark Telegram Webhook Gateway

Status: proposed
Date: 2026-04-21

## Product Change

Move `@SparkAGI_bot` from Telegram polling to a single webhook-owned gateway.

`spark-telegram-bot` becomes the only process allowed to:

- hold the Telegram bot token
- register or own the Telegram webhook
- accept inbound Telegram updates
- send outbound Telegram messages

Everything else sits behind that gateway:

- `Spark` handles planning, conversation, and routing decisions
- `Spawner` handles mission execution and lifecycle state
- other terminals and local services never poll Telegram directly

## Problem

The current polling setup is not stable in a multi-terminal environment.

Observed failure mode:

- multiple processes can start with the same Telegram bot token
- Telegram only allows one active `getUpdates` poller
- whichever process wins takes over the bot
- the wrong process can answer user commands
- the intended bot receives `409 Conflict`

This is not a polish issue. It breaks operator trust and makes the system hard to use.

## Goal

Create one secure and maintainable Telegram ingress path that:

- never competes with other local processes for updates
- keeps command routing stable
- preserves the current `/run`, `/mission`, and `/board` flow
- supports mission lifecycle updates back to Telegram
- makes `SparkAGI_bot` safe to run alongside many other terminals and agents

## Non-Goals

- no second orchestration runtime
- no new planning layer inside the webhook receiver
- no broad event platform rewrite
- no multi-bot management system
- no public admin dashboard in this slice

## Core Principles

- One Telegram token owner.
- One inbound update receiver.
- One outbound Telegram sender.
- Fast webhook acknowledgment, slow work off the request path.
- Spawner remains the source of truth for mission state.
- Telegram remains the summary and control surface.
- Every moving part must be traceable by `updateId`, `chatId`, `userId`, `requestId`, and `missionId` where applicable.

## Why Webhook Now

Polling is acceptable for a single local process. It is the wrong shape for your real workflow.

Webhook mode is the minimal stable architecture because it enforces:

- one ingress endpoint
- one authoritative gateway process
- no `getUpdates` ownership fights
- easier request validation and logging
- easier production deployment later

## Architecture

### 1. Telegram Ingress

Telegram sends updates to one public HTTPS endpoint owned by `spark-telegram-bot`.

The gateway:

- validates the Telegram secret header
- parses the update
- rejects unsupported or malformed updates
- records a dedupe key from `update_id`
- translates supported commands into internal actions
- returns `200` quickly

### 2. Internal Routing

The gateway routes updates into one of two paths:

- control path:
  - `/run`
  - `/mission status|pause|resume|kill`
  - `/board`
- conversation path:
  - normal Spark chat turns

The gateway does not execute long-running work inline.

### 3. Mission Execution

For `/run`, the gateway creates a `requestId`, calls the existing compact Spawner route, and persists mission correlation:

- `missionId`
- `requestId`
- `chatId`
- `userId`
- original Telegram `update_id`

### 4. Outbound Notifications

Only the gateway sends Telegram replies.

Spawner emits lifecycle events to the gateway webhook receiver used for mission relay. The gateway turns those events into:

- start confirmation
- completion update
- failure update
- explicit status replies

## Security Requirements

### Telegram Webhook Verification

- Require Telegram webhook secret validation on every inbound request.
- Reject missing or invalid secret headers with `401`.
- Do not trust IP alone.

### Token Ownership

- Only the gateway process may read `BOT_TOKEN` in production mode.
- Other local services must not start polling with that token.
- Add an explicit startup guard so polling mode and webhook mode cannot both own the same token at once.

### Fast Ack

- Webhook handler must return quickly after validation and enqueue/dispatch.
- Do not wait for Spawner mission completion inside the webhook request.

### Idempotency

- Deduplicate Telegram webhook updates by `update_id`.
- Deduplicate mission creation by `requestId`.
- Replayed webhook deliveries must not create duplicate missions.

### Internal Auth

- Keep Spawner auth in place for `/api/spark/run` and mission-control routes.
- Keep the Spawner-to-gateway relay endpoint private to localhost or protected by a shared secret if moved off-box later.

### Message Discipline

- Only send operator-meaningful updates.
- Never stream internal logs line by line into Telegram.

## Reliability Requirements

- If the gateway is up, Telegram commands always land in the same process.
- If Spawner is slow, Telegram still receives a quick acknowledgment.
- If Telegram retries a webhook, the update is ignored safely after dedupe.
- If mission relay delivery fails, the failure is logged with the mission and request identifiers.

## Maintainability Rules

- Keep one command router in the gateway.
- Keep one mission relay formatter in the gateway.
- Do not duplicate mission state interpretation outside Spawner.
- Do not introduce a generic workflow abstraction unless a second real caller needs it.
- Prefer file-backed or SQLite-backed dedupe/state over hidden in-memory assumptions for production mode.

## Research Signals To Borrow

These patterns are worth following from upstream systems:

- `Hermes Agent`: Telegram webhook mode with secret-token verification and profile/token isolation.
- `OpenClaw` / `vercel-openclaw`: one public webhook owner, validation at the edge, fast path to hot runtime, wake-up path when the runtime is cold.
- `OpenClaw` issue history: multi-account and routing bugs are common, so ownership, routing, and account identity need to stay explicit.

## Proposed Implementation

### Phase 1. Webhook Gateway Skeleton

- Add webhook mode env/config to `spark-telegram-bot`
- Add inbound Telegram webhook route
- Validate secret token header
- Parse and dedupe `update_id`
- Route `/run`, `/mission`, `/board`, and normal chat into existing handlers

Verify:
- one webhook request becomes one gateway action
- duplicate delivery does not create duplicate work

### Phase 2. Single-Owner Enforcement

- Add a startup mode switch: polling or webhook, not both
- Make webhook mode the preferred production path
- Add a guard that blocks polling startup when webhook mode is configured

Verify:
- local accidental poller conflicts stop happening in production mode

### Phase 3. Mission Relay Hardening

- Reuse the existing mission relay endpoint
- Protect it with a shared secret or local-only trust boundary
- Keep lifecycle updates concise
- Include provider status on terminal events

Verify:
- `/run` gets start and completion updates without polling

### Phase 4. Persistence + Recovery

- Persist dedupe keys and mission-to-chat correlation safely
- Recover cleanly after gateway restart

Verify:
- a restart does not orphan active mission notifications

### Phase 5. Production Deployment Path

- Document public HTTPS requirements
- Register webhook via Telegram `setWebhook`
- document rollback to polling for local-only debugging

Verify:
- one stable production ingress exists for `@SparkAGI_bot`

## Success Criteria

- `@SparkAGI_bot` has one authoritative update receiver.
- Competing local pollers no longer steal the bot in production mode.
- `/run`, `/mission`, and `/board` still work through the same user-facing commands.
- Mission lifecycle updates reach Telegram through the gateway, not from ad hoc background processes.
- Telegram update handling is secure, deduplicated, and observable.

## Acceptance Test

1. Configure webhook mode for `@SparkAGI_bot`.
2. Send `/run say exactly OK` from Telegram.
3. Confirm one mission is created in Spawner.
4. Confirm a completion update arrives automatically.
5. Start another local process with the same bot token and confirm it does not take over Telegram updates.
