# Spark AGI Telegram Gateway

`spark-telegram-bot` is the Telegram gateway for `@SparkAGI_bot`.

It owns Telegram ingress, routes operator commands into `Spawner UI`, and relays mission lifecycle updates back into Telegram.

Webhook ingress is now queue-backed inside the gateway, so validated Telegram updates are persisted locally before command handling runs. That reduces message loss risk if the gateway restarts after acknowledging a webhook.
Gateway startup now also acquires a durable same-host ownership lease for the bot token, with heartbeat and stale-lock recovery, so a second local gateway instance refuses to start against the same token.

## What It Does

- receives Telegram updates through one gateway process
- supports local polling for debug and webhook mode for stable multi-process use
- keeps admin-only mission control commands in Telegram
- sends `/run` goals into `Spawner UI`
- relays mission status and terminal updates back to Telegram

## Current Architecture

```text
Telegram User
    |
    v
Spark Telegram Gateway (src/index.ts)
    |
    +--> Spark chat / conversation path
    |
    +--> Spawner bridge (src/spawner.ts)
              |
              v
        Spawner UI
        - /api/spark/run
        - /api/mission-control/status
        - /api/mission-control/command
        - /api/mission-control/board
```

Mission lifecycle events return through the local relay endpoint:

```text
Spawner UI
    |
    v
/spawner-events
    |
    v
Telegram replies
```

## Commands

General:

- `/start`
- `/myid`
- `/spark`
- `/remember <text>`
- `/recall <topic>`
- `/about`

Admin-only mission control:

- `/run <goal>`
- `/board`
- `/mission <status|pause|resume|kill> <missionId>`

## Gateway Modes

### Polling

Use for local debugging or emergency recovery only when no webhook is active for the bot token.

### Webhook

Use for stable ownership in multi-terminal or deployed setups.

Important rule:

- one Telegram token
- one active gateway owner

For `@SparkAGI_bot`, webhook mode is the canonical live mode. Only `spark-telegram-bot` may own the Telegram token or receive inbound Telegram updates.

## Builder Bridge

Normal chat messages can be routed into `spark-intelligence-builder` so the real Telegram webhook bot uses Builder's researcher and persistent memory path instead of the local fallback conversation memory.

Bridge env:

- `SPARK_BUILDER_BRIDGE_MODE=auto|off|required`
- `SPARK_BUILDER_REPO`
- `SPARK_BUILDER_HOME`
- `SPARK_BUILDER_PYTHON`
- `SPARK_BUILDER_TIMEOUT_MS`

Default behavior is `auto`, which looks for a sibling `spark-intelligence-builder` repo and its `.tmp-home-live-telegram-real` home. If the Builder bridge is unavailable, the bot falls back to the local `conversation + llm` path unless you set `SPARK_BUILDER_BRIDGE_MODE=required`.

See [TELEGRAM_WEBHOOK_SETUP.md](./TELEGRAM_WEBHOOK_SETUP.md) for production webhook setup and rollback.
See [TELEGRAM_GATEWAY_HARDENING.md](./TELEGRAM_GATEWAY_HARDENING.md) for the current hardening checklist and temporary operational gaps.
See [TELEGRAM_NAMED_TUNNEL_SETUP.md](./TELEGRAM_NAMED_TUNNEL_SETUP.md) for the stable-hostname cutover from the temporary quick tunnel.
See [TELEGRAM_GATEWAY_TARGET_ARCHITECTURE.md](./TELEGRAM_GATEWAY_TARGET_ARCHITECTURE.md) for the long-term single-owner ingress model with internal worker fan-out.
See [TELEGRAM_GATEWAY_COMPARATIVE_ARCHITECTURE_REVIEW.md](./TELEGRAM_GATEWAY_COMPARATIVE_ARCHITECTURE_REVIEW.md) for the OpenClaw/Hermes tradeoff review and Spark target design.

Operator check:

```bash
npm run health:webhook
```

Public ingress intentionally exposes only:

- `POST <webhook path>`
- `GET /healthz`

Named tunnel readiness check:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\cloudflared\check.ps1
```

## Setup

1. Copy `.env.example` to `.env`.
2. Set `BOT_TOKEN`.
3. Set `ADMIN_TELEGRAM_IDS`.
4. Start `spawner-ui` if you want `/run`, `/mission`, and `/board` to work.
5. Start the bot:

```bash
npm run dev
```

For webhook mode, configure:

- `TELEGRAM_GATEWAY_MODE=webhook`
- `TELEGRAM_WEBHOOK_URL`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_WEBHOOK_PORT`

Then verify:

```bash
npm run health:webhook
```

## Related Docs

- [FEATURE_TELEGRAM_WEBHOOK_GATEWAY.md](./FEATURE_TELEGRAM_WEBHOOK_GATEWAY.md)
- [TELEGRAM_WEBHOOK_SETUP.md](./TELEGRAM_WEBHOOK_SETUP.md)
- [TELEGRAM_NAMED_TUNNEL_SETUP.md](./TELEGRAM_NAMED_TUNNEL_SETUP.md)
- [TELEGRAM_GATEWAY_TARGET_ARCHITECTURE.md](./TELEGRAM_GATEWAY_TARGET_ARCHITECTURE.md)
- [TELEGRAM_GATEWAY_COMPARATIVE_ARCHITECTURE_REVIEW.md](./TELEGRAM_GATEWAY_COMPARATIVE_ARCHITECTURE_REVIEW.md)
- [TASK.md](./TASK.md)

## Notes

- Memory and Spark intelligence can be offline without breaking the mission-control path.
- `Spawner UI` is the source of truth for mission state.
- Telegram is the summary and control surface, not a second workflow system.
- Current live webhook ingress may be backed by a temporary tunnel until a named tunnel or fixed HTTPS endpoint is installed.
- This repo is the current production Telegram ingress owner. If Telegram ingress later moves into `spark-intelligence-builder`, that should happen by deliberate contract-parity migration, not by running both ingress paths at once.
