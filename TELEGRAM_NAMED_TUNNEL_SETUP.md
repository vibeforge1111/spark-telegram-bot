# Telegram Named Tunnel Setup

Status: planned hardening step
Date: 2026-04-21

## Purpose

Replace the temporary Cloudflare quick tunnel with a stable named tunnel for `@SparkAGI_bot`.

This is the next hardening step after webhook mode is already live and verified.

## Why

Quick tunnels are good for recovery and short-lived testing, but they are not the final production posture.

Named tunnels give you:

- a stable hostname
- persistent tunnel identity
- clearer operator ownership
- less manual URL churn in `TELEGRAM_WEBHOOK_URL`

## Target Shape

```text
Telegram
  -> https://bot.example.com/telegram-live
  -> Cloudflare named tunnel
  -> spark-telegram-bot local webhook listener
  -> Spawner relay + Builder bridge
```

`spark-telegram-bot` still remains the only Telegram ingress owner.

## Required Local Inputs

- a Cloudflare account with access to the target zone
- a hostname you control, for example `bot.example.com`
- `cloudflared` installed on the gateway machine
- the gateway already working locally on:
  - `http://127.0.0.1:8907`

## Repo Files

- example tunnel config:
  - [ops/cloudflared/config.example.yml](./ops/cloudflared/config.example.yml)
- webhook setup guide:
  - [TELEGRAM_WEBHOOK_SETUP.md](./TELEGRAM_WEBHOOK_SETUP.md)

## Cutover Steps

1. Install and authenticate `cloudflared`.
2. Create a named tunnel in your Cloudflare account.
3. Create DNS for the chosen hostname.
4. Copy the example config and fill in:
   - tunnel ID
   - credentials file path
   - hostname
   - local service port
5. Point `TELEGRAM_WEBHOOK_URL` at the stable HTTPS hostname, for example:
   - `https://bot.example.com/telegram-live`
6. Keep:
   - `TELEGRAM_GATEWAY_MODE=webhook`
   - `TELEGRAM_WEBHOOK_PORT=8907`
7. Start the named tunnel.
8. Run:
   - `npm run health:webhook`
9. Confirm in Telegram:
   - `/start`
   - `/run say exactly OK`

## Cloudflare Config Example

Use the checked-in template:

```yaml
tunnel: YOUR_TUNNEL_ID
credentials-file: C:\Users\USER\.cloudflared\YOUR_TUNNEL_ID.json

ingress:
  - hostname: bot.example.com
    service: http://127.0.0.1:8907
  - service: http_status:404
```

## Expected Env

```env
TELEGRAM_GATEWAY_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://bot.example.com/telegram-live
TELEGRAM_WEBHOOK_PORT=8907
TELEGRAM_WEBHOOK_SECRET=replace-with-random-secret
TELEGRAM_RELAY_PORT=8788
TELEGRAM_RELAY_SECRET=replace-with-second-random-secret
```

## Verification

The cutover is acceptable only when all of these are true:

- `npm run health:webhook` returns `Webhook health: OK`
- `getWebhookInfo` reports the stable hostname
- `/start` works from real Telegram
- `/run say exactly OK` completes end to end
- no polling receiver is started anywhere else

## Recovery

If named-tunnel cutover fails:

1. inspect the tunnel process
2. inspect DNS and hostname routing
3. inspect `getWebhookInfo`
4. inspect `npm run health:webhook`
5. only then consider temporary quick-tunnel recovery

Do not start polling unless you intentionally clear the webhook first.
