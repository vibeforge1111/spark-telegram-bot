# Spark Telegram Render Firewall

Date: 2026-06-26
Status: active implementation note

## Purpose

The render firewall is the Telegram delivery boundary for ordinary replies. It keeps hidden context, raw proof or trace details, raw Telegram platform ids, local paths, stack traces, provider secret keys, legacy source names, and raw Harness policy reason codes out of the chat surface.

This is not a copy-style rule. It is an enforcement layer in `src/outboundSanitize.ts`, applied before Telegram final delivery, rich message delivery, and draft preview text.

## Surface Rule

- `ordinary`: default for natural replies, Builder replies, Spawner follow-ups, mission relay text, and normal chat.
- `inspect`: allowed for explicit proof/status/diagnose/raw/review/picker surfaces when trace context marks the reply as inspect-like.

Ordinary replies redact:

- raw reason codes such as `tool_not_allowed_by_policy`
- raw proof refs such as `turn:sha256:...`
- raw trace refs such as `trace:...`
- raw Telegram platform ids such as `chat_id`, `user_id`, `message_id`, and `file_id`
- hidden context keys such as `context_packet`
- legacy source filenames and old doc names
- local file paths and stack traces
- provider credential key names

Inspect replies may keep proof and trace refs when useful, and may also keep platform ids on explicit raw-detail surfaces, but still hide local paths, stack traces, and provider credential key names.

## Wiring

Central wrappers in `src/index.ts` infer the surface from outbound trace context:

- proof, diagnose, diagnostic, status, raw, review, picker, and inspect signals use the inspect surface
- everything else uses the ordinary surface

This means `ctx.reply`, `bot.telegram.sendMessage`, rich final messages, and draft previews share the same default protection.

Legacy source redaction uses the same blocked refs as the legacy prompt/UI summary surface gate. If a historical prompt source is blocked from fresh prompts, its path and human-readable title are also blocked from ordinary Telegram replies unless the user explicitly inspects history. The render-firewall tests must iterate every prompt-surface blocked ref, not only sample examples, so adding a new blocked legacy source cannot create an ordinary Telegram leak.

## Verification

Regression coverage lives in `tests/outboundSanitize.test.ts`.

Expected local checks for this slice:

1. `npm test -- --run tests/outboundSanitize.test.ts`
2. `npm run control:proof:render-firewall`
3. `npm run build`
4. `npm run control:proof:audit -- --sample 100 --fresh-strict`

The aggregate reliability battery also includes this gate through `npm run control:proof:reliability`.

## Downstream Gates

This closes the ordinary-render leak boundary. It is now one gate inside the full reliability battery, not the next-task list by itself.

Keep it aligned with the other active gates:

- trace join checker: user intent -> route decision -> action/no-action -> reply
- proof capsule coverage: every action-capable route has exactly one declared proof path or explicit no-action proof
- capability evidence: current canary packet supplies last-success and last-failure/boundary evidence
- surface eval: ordinary replies can fail when they are logically correct but robotic

If one of those gates fails, fix the measured gate directly. Do not treat this render-firewall note as permission to expand UI, media, rich composition, or feature scope.
