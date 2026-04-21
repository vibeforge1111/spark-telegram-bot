# Cloudflare Ingress Deployment Notes

Status: deployment guidance
Date: 2026-04-21

## Purpose

Document the safest Cloudflare posture for the Spark Telegram gateway based on current Cloudflare Tunnel guidance.

## Bottom Line

For production, Spark should avoid treating a developer machine plus an account-wide `cert.pem` as the long-term ingress model.

The better options are:

1. a directly hosted public gateway on stable HTTPS
2. a Cloudflare-backed hosted gateway where the runtime uses tunnel-specific credentials or tokens, not broad account-management credentials

## Why

Cloudflare documents two different trust levels:

- account certificate (`cert.pem`)
  - broad account-level tunnel management scope
- tunnel credential / token
  - scope limited to one tunnel

For a production bot ingress, narrower scope is better.

## Spark Recommendation

### Good For Internal Development

- local gateway
- local `cloudflared`
- temporary tunnel
- account certificate created by `cloudflared tunnel login`

This is acceptable for development, recovery, and internal testing.

### Better For Production

- hosted gateway instance
- stable public hostname
- tunnel-specific run credentials or a directly hosted public endpoint
- no long-lived dependency on a developer workstation

### What To Avoid

- treating a local developer machine as the permanent production ingress owner
- storing a broadly capable Cloudflare account certificate on many machines
- mixing tunnel-creation/admin credentials with the steady-state runtime path

## Cloudflare-Specific Takeaways

### Account Certificate Scope

Cloudflare's `cert.pem` is an account-management credential used to create, list, and manage tunnels. That is broader than what a long-running runtime process should need.

### Tunnel Credential Scope

Cloudflare's tunnel credentials or tokens are scoped to a specific tunnel and are more appropriate for the steady-state runtime path.

### Operational Meaning For Spark

This means:

- use `cloudflared tunnel login` only when you actually need to create or manage tunnels
- do not design the steady-state bot runtime around repeated account-level tunnel management
- prefer a fixed hosted deployment where tunnel administration and bot runtime are separate concerns

## Hosted Spark Path

The production target should look like this:

```text
Telegram
  -> stable public hostname
  -> hosted Spark Telegram gateway
  -> internal Builder / Spawner / workers
```

If Cloudflare Tunnel is part of that path, the runtime should use narrow tunnel credentials, while tunnel administration stays with trusted operators.

## Current Practical Position

Today, the quick tunnel is still acceptable for internal use while the gateway architecture hardens.

But the final product target should not depend on:

- a developer laptop
- a quick tunnel
- account-wide tunnel-management credentials left on operator machines
