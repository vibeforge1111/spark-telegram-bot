# Spark Capability Evidence Gate

Date: 2026-06-26
Status: active control-proof gate

## Purpose

Spark should not say a capability is reliable just because a route exists, a registry card is visible, or a provider once answered. Each active capability lane needs explicit last-success evidence and last-failure or boundary evidence.

This gate derives those evidence records from the full SparkRecursive_bot control-proof canary packet. The canary packet is the current release-proof surface for Telegram, Recursive, Spawner, Builder, mission relay, access, media, streaming, rich messages, and publish-handoff behavior.

## Command

```bash
npm run control:proof:capabilities -- --strict
```

Use `--observations <path>` to inspect a non-default packet and `--json` for automation.

## Evidence Model

For each capability policy, the gate requires:

- category joins: every referenced canary case must belong to one of the policy's allowed canary categories
- `last-success`: one or more passing canary cases with all required captures present
- `last-failure/boundary`: one or more passing boundary cases that prove refusal, no-action, fallback, or constrained behavior
- publish evidence: for registry/publish capability, a visible publish-not-ready handoff instead of a hidden release claim

Category joins keep a capability from borrowing a valid but unrelated passing case. For example, streaming/rich-message reliability must draw from `streaming` or `rich_messages` cases, not a memory or publish case that happened to pass.

The same canary case cannot satisfy both `last-success` and `last-failure/boundary` for one capability. If a capability needs both a positive proof and a constrained-behavior proof, split them across distinct cases so the evidence does not double-count one observation.

Evidence timestamps are withheld when a required case is merely marked `pass` but still has missing captures. A capability record may only show `last-success` or `last-failure/boundary` when the relevant cases are both passing and capture-complete.

The gate does not turn selected-case proof into full release proof. It reads the full canary observations by default and keeps publish readiness separate from release-ready behavior proof.

## Failure Meaning

A strict failure means Spark has a capability lane without enough current evidence to make reliability claims. The fix is to add or refresh the relevant canary evidence, or add a named policy for why a capability does not need last-success and last-failure/boundary proof.

Do not fix this by claiming registry visibility, memory, provider status, or route existence as capability success.
