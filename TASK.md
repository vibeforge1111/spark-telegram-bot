# Spark Telegram <> Spawner Task

Status: in progress
Date: 2026-04-21

## Goal

Ship and harden one thin Telegram-to-Spawner bridge for running a plain-text goal, controlling the resulting mission, and receiving mission updates back from Spawner.

## Principles

- No features beyond the requested bridge.
- No abstractions for single-use code.
- No configurability unless it is required to make the bridge usable.
- No cleanup outside the files touched for this task.
- Every changed line must trace back to `/run` or mission control.

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

## Current State

- [x] `/run <goal>` exists
- [x] `/mission <status|pause|resume|kill> <missionId>` exists
- [x] bot and Spawner build for the current bridge

## Next Slice

1. Lock one request contract to Spawner
   verify: `/run` sends one stable shape with `goal` and correlation fields only
2. Add mission correlation
   verify: Telegram run can be traced by `missionId`, `requestId`, `chatId`, and `userId`
3. Accept event updates back from Spawner
   verify: normal mission progress does not require manual polling to be visible in Telegram
4. Keep mission control on existing Spawner endpoints
   verify: `status/pause/resume/kill` still round-trip against localhost
5. Run one full smoke test
   verify: `/run say exactly OK` completes end to end and reports back to Telegram

## Success Criteria

- Admin can run `/run <goal>` and get back a mission ID.
- Admin can run `/mission status <missionId>` and see provider state.
- Admin can run `/mission pause|resume|kill <missionId>`.
- Telegram can receive mission lifecycle updates without inventing a second control path.
- Bot and Spawner both build after the changes.
