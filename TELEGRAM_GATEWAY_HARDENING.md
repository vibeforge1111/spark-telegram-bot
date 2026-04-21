# Telegram Gateway Hardening

Status: active
Date: 2026-04-21

## Purpose

This file tracks the remaining work to move `@SparkAGI_bot` from a working webhook deployment to a hardened one.

Use it as the operator checklist. Do not treat it as a redesign doc.

## Current Target

Keep this system shape:

- Telegram = ingress surface
- `spark-telegram-bot` = single gateway owner
- `spark-intelligence-builder` / Spark = downstream reasoning
- `spawner-ui` = mission execution backend
- Spawner relay = local event feed into the gateway

## Hardening Priorities

### 1. Stable Public HTTPS Endpoint

Target:

- named Cloudflare tunnel or fixed HTTPS domain

Not target:

- ad hoc tunnel rotation as a normal operating pattern

Verify:

- Telegram `getWebhookInfo` stays clean
- webhook URL remains reachable across process restarts
- `/start` and `/run say exactly OK` still work after restart

### 2. Canonical Startup Path

Target:

- one documented way to start the gateway
- one documented way to restart it

Verify:

- operators do not improvise alternate bot launchers
- old polling launchers and legacy continuous pollers stay disabled

### 3. Secret Hygiene

Rotate and document:

- `BOT_TOKEN` only when actually needed
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_RELAY_SECRET`

Verify:

- webhook requests without the secret fail
- relay requests without the secret fail

### 4. Health Checks

Add and use checks for:

- local gateway process health
- public webhook reachability
- Telegram `getWebhookInfo`
- local relay listener

Verify:

- operators can tell whether failure is tunnel, webhook, local process, or relay

### 5. Recovery Discipline

Polling remains allowed only for:

- intentional local debugging
- emergency recovery when webhook ingress is broken

Polling is not a normal redundancy mechanism.

Verify:

- operators clear the webhook before polling fallback
- operators return to webhook mode after recovery

## Current Temporary Pieces

- quick tunnel style ingress may still be in use
- recovery state still uses local JSON files
- health checks are still manual

These are the next things to replace. They do not change the gateway ownership model.

## Recovery Order

When Telegram looks broken:

1. Check public webhook URL health.
2. Check local gateway process.
3. Check Telegram webhook registration.
4. Check Spawner relay path.
5. Only then switch to polling fallback.

## Done Condition

This file can be considered complete when:

- webhook ingress uses a stable named tunnel or fixed domain
- one startup path is canonical
- secrets are rotated and documented
- health checks exist and are repeatable
- polling is clearly emergency-only in practice, not just in docs
