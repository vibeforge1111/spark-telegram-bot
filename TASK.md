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
  verify: `@SparkAGI_bot` received `/start` and `/run say exactly OK` through `https://clever-jeans-shop.loca.lt/telegram-live`, created mission `spark-1776772275057`, and delivered the terminal completion update back to Telegram

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

## Success Criteria

- Admin can run `/run <goal>` and get back a mission ID.
- Admin can run `/mission status <missionId>` and see provider state.
- Admin can run `/mission pause|resume|kill <missionId>`.
- Telegram can receive mission lifecycle updates without inventing a second control path.
- Bot and Spawner both build after the changes.
- Telegram update ownership stays stable even while other local terminals and agents are running.
