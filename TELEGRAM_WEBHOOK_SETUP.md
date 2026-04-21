# Telegram Webhook Setup

Status: active
Date: 2026-04-21

## Purpose

Run `@SparkAGI_bot` through one stable webhook-owned gateway in production, while still allowing intentional local polling for debugging.

This is the operational guide for the webhook system described in [FEATURE_TELEGRAM_WEBHOOK_GATEWAY.md](/C:/Users/USER/Desktop/spark-telegram-bot/FEATURE_TELEGRAM_WEBHOOK_GATEWAY.md:1).

## Rule

One bot token must have one update owner.

For production:

- use webhook mode
- one gateway process owns the token
- no other process polls Telegram with the same token

For local debugging:

- polling is allowed only when no webhook is active for that token

## Modes

### `TELEGRAM_GATEWAY_MODE=auto`

- uses webhook mode when `TELEGRAM_WEBHOOK_URL` is configured
- otherwise uses polling mode

Use this when the deployment environment is clearly production or clearly local.

### `TELEGRAM_GATEWAY_MODE=webhook`

- requires `TELEGRAM_WEBHOOK_URL`
- requires `TELEGRAM_WEBHOOK_SECRET`
- never starts polling

Use this for production.

### `TELEGRAM_GATEWAY_MODE=polling`

- forces polling
- refuses startup if webhook env is present
- refuses startup if Telegram still reports an active webhook

Use this only for local debugging.

## Required Production Env

Set these in the environment for the single production gateway process:

```env
BOT_TOKEN=...
TELEGRAM_GATEWAY_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://your-domain.example/telegram
TELEGRAM_WEBHOOK_PORT=8443
TELEGRAM_WEBHOOK_SECRET=generate-a-random-secret
TELEGRAM_RELAY_PORT=8788
TELEGRAM_RELAY_SECRET=generate-a-second-random-secret
SPAWNER_UI_URL=http://127.0.0.1:4174
```

Notes:

- `TELEGRAM_WEBHOOK_URL` must be public HTTPS
- Telegram rejects self-signed or invalid TLS
- the path portion of the URL becomes the webhook route
- `TELEGRAM_WEBHOOK_SECRET` is validated against `X-Telegram-Bot-Api-Secret-Token`

## Recommended Production Topology

```text
Telegram
  -> HTTPS webhook
  -> spark-telegram-bot
  -> Spawner / Spark / local services
```

Only `spark-telegram-bot` should:

- receive Telegram updates
- call `setWebhook`
- call `deleteWebhook`
- send Telegram replies

`spawner-ui` should know only:

- `MISSION_CONTROL_WEBHOOK_URLS`
- `TELEGRAM_RELAY_SECRET`

It should not hold the Telegram bot token.

## Deployment Steps

1. Stop all polling processes using the same bot token.
2. Deploy `spark-telegram-bot` with webhook env configured.
3. Ensure the public URL terminates TLS correctly.
4. Start the gateway.
5. Confirm startup logs show:
   - `Telegram ingress: webhook ...`
6. Send `/start` to `@SparkAGI_bot`.
7. Run:
   - `/run say exactly OK`
8. Confirm:
   - mission starts
   - completion message arrives automatically

## Verification

The gateway should behave like this:

- invalid secret header -> `401`
- first valid webhook delivery -> `200`
- replayed `update_id` -> duplicate response

Operator-level checks:

- `/board`
- `/mission status <missionId>`
- Spawner mission board/status endpoints

## Rollback To Local Polling

Use this only for intentional local debugging.

1. Delete the Telegram webhook for the bot token.
2. Unset:
   - `TELEGRAM_WEBHOOK_URL`
   - `TELEGRAM_WEBHOOK_SECRET`
3. Set:
   - `TELEGRAM_GATEWAY_MODE=polling`
4. Start the local bot.

If Telegram still reports an active webhook, the bot will refuse to start in polling mode. That is intentional.

## Clearing A Webhook

Example:

```powershell
$token = "<BOT_TOKEN>"
Invoke-RestMethod -Method POST -Uri "https://api.telegram.org/bot$token/deleteWebhook" -Body @{ drop_pending_updates = 'false' }
```

## Common Failure Modes

### `409 Conflict`

Cause:
- another process is polling the same token

Fix:
- stop the competing poller
- or move fully to webhook mode

### Polling refused because webhook ownership is active

Cause:
- Telegram still has a webhook registered for the token

Fix:
- delete the webhook first
- or run the gateway in webhook mode

### Webhook requests do not arrive

Cause:
- bad TLS
- unreachable public URL
- wrong path
- reverse proxy not forwarding requests

Fix:
- verify the public HTTPS endpoint externally
- verify the exact configured path
- verify the reverse proxy forwards the secret header

### Completion messages do not arrive

Cause:
- mission relay path is broken
- Spawner webhook relay not configured
- gateway not reachable on relay port

Fix:
- verify `MISSION_CONTROL_WEBHOOK_URLS`
- verify the same `TELEGRAM_RELAY_SECRET` is configured in both repos
- verify local relay receiver is running
- verify the mission exists in `.spark-spawner-missions.json`

## Local State Files

These files are expected:

- `.spark-spawner-missions.json`
  - mission-to-chat correlation for Telegram relay delivery
- `.spark-telegram-webhook-state.json`
  - recent webhook `update_id` dedupe state

Do not treat them as durable cross-machine storage. They are local recovery state for one gateway instance.

## Operational Recommendation

Production:

- `TELEGRAM_GATEWAY_MODE=webhook`
- exactly one gateway instance per bot token

Local debugging:

- clear Telegram webhook first
- `TELEGRAM_GATEWAY_MODE=polling`
- run one local process only
