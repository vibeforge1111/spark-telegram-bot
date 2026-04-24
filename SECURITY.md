# Security

Launch v1 keeps Telegram ingress local and private by default.

## Supported Posture

- Telegram runs through long polling only.
- Webhook mode and `TELEGRAM_WEBHOOK_*` env are refused by startup checks.
- Only `/start` and `/myid` are public onboarding commands.
- Normal chat, Builder access, Spawner missions, memory, and LLM calls require `ADMIN_TELEGRAM_IDS`, `ALLOWED_TELEGRAM_IDS`, or explicit `TELEGRAM_PUBLIC_CHAT_ENABLED=1`.
- The local Spawner relay listens on `127.0.0.1` and requires `TELEGRAM_RELAY_SECRET`.

## Secrets

Never commit:

- `.env` or `.env.*`
- Telegram bot tokens
- LLM API keys
- relay secrets
- gateway state databases or logs

Rotate any token pasted into chat, terminal logs, screenshots, or issue text.

## Before Public Demo

Run:

```bash
npm run build
npm test
npm run health:polling
npm audit --omit=dev --audit-level=moderate
```

Then confirm `TELEGRAM_GATEWAY_MODE=polling` and that no `TELEGRAM_WEBHOOK_*` variables are set.
