# Telegram Webhook Future Plan

Webhook ingress is intentionally disabled in the launch v1 build. The supported launch posture is one local long-polling `spark-telegram-bot` process, private-by-default chat access, and a secret-protected loopback Spawner relay.

Webhook support can come back later only as a deliberate hosted-gateway migration with these gates:

- no local tunnel requirement in the user onboarding path
- mandatory Telegram secret-token validation
- fast acknowledgement with durable queueing before command handling
- replay dedupe by `update_id`
- one active token owner with startup conflict checks
- no fallback to polling while a webhook owner is active
- route-level tests for invalid secret, duplicate update, bad payload, and health checks
- launch docs that clearly say which process owns the token

Historical design notes remain in the older webhook architecture documents, but they are not launch instructions for this build.
