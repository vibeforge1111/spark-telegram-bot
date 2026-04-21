# Telegram Gateway Target Architecture

Status: target architecture
Date: 2026-04-21

## Goal

Keep `@SparkAGI_bot` stable while allowing multiple internal workers, terminals, and runtimes to participate safely.

## Core Rule

One Telegram bot token must have one ingress owner.

That owner can fan out work internally to many processes.

## Correct Shape

```text
Telegram
  -> public HTTPS webhook
  -> spark-telegram-bot gateway
  -> internal routing
      -> spark-intelligence-builder
      -> spawner-ui
      -> worker terminals / local services
  -> gateway sends replies back to Telegram
```

## What Must Not Happen

Do not run multiple Telegram receivers for the same bot token.

That means:

- no second polling process
- no second webhook server for the same token
- no old `spark_intelligence` poller reclaiming the token
- no direct Spawner-to-Telegram delivery path

## Multi-Terminal Model

Multiple terminals can still work together if they stay behind the gateway.

Safe patterns:

- gateway -> local HTTP worker
- gateway -> Builder command/runtime
- gateway -> Spawner mission dispatch
- gateway -> queue or relay
- worker -> gateway -> Telegram reply

Unsafe pattern:

- terminal A owns Telegram
- terminal B also owns Telegram

## Why This Matches OpenClaw / Hermes

This mirrors the stable pattern used by OpenClaw and Hermes:

- one public gateway/webhook owner
- internal forwarding to the real runtime
- optional wake/resume path
- no competing Telegram receivers

## Current Practical Posture

Today:

- `spark-telegram-bot` is the ingress owner
- Builder is behind it
- Spawner is behind it

Later:

- Builder may absorb Telegram ingress
- but only after contract parity is proven
- and only if `spark-telegram-bot` is retired as ingress owner

There must never be two live ingress owners at once.

## Hardening Direction

The stable end state is:

- one permanently hosted public gateway
- one stable HTTPS hostname
- internal fan-out to workers and runtimes
- Telegram token ownership kept in one place

This is preferable to depending forever on:

- multiple local pollers
- ad hoc token sharing
- temporary tunnels as the final production design
