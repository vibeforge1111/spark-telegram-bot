# Telegram Platform System Ruleset

This is the Spark-wide rulebook for using Telegram's current bot platform
without turning presentation features into authority, truth, or hidden side
effects.

Last checked against official Telegram docs on 2026-06-15.

## Official Source Map

Primary sources:

- Bot API changelog and method/object reference:
  https://core.telegram.org/bots/api
- Bot API rich message formatting:
  https://core.telegram.org/bots/api#rich-message-formatting-options
- Bot API `sendMessage`:
  https://core.telegram.org/bots/api#sendmessage
- Bot API `sendRichMessage`:
  https://core.telegram.org/bots/api#sendrichmessage
- Bot API `sendRichMessageDraft`:
  https://core.telegram.org/bots/api#sendrichmessagedraft
- Telegram 2026-06-11 product update:
  https://telegram.org/blog/watch-apps-and-more
- Telegram 2026-05-07 AI bot product update:
  https://telegram.org/blog/ai-bot-revolution-11-new-features

## Platform Capability Registry

| Capability | Telegram surface | Spark use | Adoption tier |
| --- | --- | --- | --- |
| Basic text | `sendMessage` | Compatibility fallback, simple chat, short status | Production |
| Basic formatting | `parse_mode`, entities, link preview options | Short HTML compatibility cards | Production |
| Rich final messages | `sendRichMessage`, `InputRichMessage` | Long readable final replies, cards, lists, tables, details, evidence summaries | Production with live-client QA |
| Rich final edits | `editMessageText` with `rich_message` | Future clutter reduction for bot-owned messages | Gated |
| Draft streaming | `sendRichMessageDraft` | Private-chat ephemeral answer previews | Gated by route policy |
| Thinking block | `<tg-thinking>` / `RichBlockThinking` | Draft-only "thinking" placeholder | Labs only |
| Rich inline query answers | `InputRichMessageContent` | Future inline/guest/Web App rich answers | Gated |
| Guest AI bots | guest query surfaces | Answer only the tagged message/reply context | Gated by privacy review |
| Bot-to-bot replies | bot message replies | Future orchestrated agent workflows | Labs only |
| Profile chat automation | user-connected bot automation | Future user-authorized assistant mode | No production use yet |
| Guardian/join-request bots | join request query APIs | Future group screening workflows | Separate product design required |
| Inline media | rich `img`, `video`, `audio`, `figure` blocks | Public media summaries, generated visuals, preview thumbnails | Gated by URL/privacy policy |
| Collage/slideshow | `<tg-collage>`, `<tg-slideshow>` | Visual result galleries | Labs only until client QA |
| Tables | rich Markdown or HTML tables | Small comparisons and scorecards | Production only for tiny tables |
| Details/summary | `<details>`, `<summary>` | Optional debug detail under a clear top summary | Production with fallback copy |
| Footnotes/references | rich Markdown footnotes / references | Evidence definitions and caveats | Gated for readability |
| Math | inline/block formulas | Benchmarks, scoring formulas, technical reports | Gated |
| Poll links | poll option link support | Future research or feedback polls | Out of bot-reply scope |
| Telegram Browser link behavior | in-app browser and user link settings | Link-label policy and preview expectations | Production awareness |
| Colored buttons | Bot API reply markup styling where available | Future action emphasis | Gated by action authority |

## Non-Negotiable Authority Boundary

Telegram is Spark's field console. It does not own Spark truth.

Rich messages, streaming drafts, inline results, buttons, guest replies,
bot-to-bot messages, chat automation, browser previews, and media blocks are
delivery surfaces only. They must never:

- authorize a build, publish, memory write, access change, deletion, repair,
  provider run, browser/computer-use action, installer action, or external side
  effect
- turn raw keywords into execution intent
- claim completion without owner terminal success and verification proof
- hide a failure or missing proof behind polished formatting
- promote draft text, streamed text, inline content, or rendered cards into
  memory truth

Every high-agency action still follows:

```text
fresh user turn evidence
-> TurnIntentEnvelopeVNext
-> GovernorDecisionV1
-> AuthorizationDecisionV1
-> owner consumer verification
-> side-effect proof
-> final Telegram readout
```

## Rich Message Design Rules

Use rich messages to improve scanning, not to make messages decorative.

- The plain text reading order must be correct before rich formatting is added.
- A final message must fit one user question, not become a dashboard dump.
- Use headings for actual sections, not every sentence.
- Use lists for grouped facts, not paragraph fragments.
- Use tiny tables only when columns make comparison faster than bullets.
- Use details blocks for optional material only; the visible summary must carry
  the decision, status, blocker, or next move.
- Use footnotes only for evidence definitions and caveats that do not change the
  action.
- Use math only when the formula itself is useful to the user.
- Use media only when it reveals the real artifact or result.
- Use collages/slideshows only after desktop and mobile clients render them
  reliably for the active Spark audience.

## Streaming Rules

Telegram draft streaming is a responsiveness layer, not execution telemetry.

- Use `sendRichMessageDraft` only in private chats and only for routes approved
  by the streaming route policy.
- Reuse one non-zero draft id per turn.
- Treat the draft as a temporary preview that disappears after roughly 30
  seconds.
- Always send a final persisted message after a streamed draft.
- Never draft-stream completion, memory save, access/config mutation, destructive
  action, mission/build execution, provider run, publish, installer, or
  browser/computer-use claims unless a route-specific typed event protocol
  proves the partial text cannot mislead the user.
- Do not edit old final messages to mimic streaming.
- If streaming fails, fall back to one final message and record the delivery
  failure as presentation telemetry only.

## Guest, Bot-to-Bot, and Automation Rules

These surfaces are powerful enough to change Spark's social boundary.

Guest mode:

- Treat the mentioned message and direct replies as the available context.
- Do not infer private chat history, workspace state, or group membership from a
  guest mention.
- Do not store guest content as durable memory unless the user and owner policy
  explicitly permit it.

Bot-to-bot:

- Require machine-origin policy before acting on another bot's message.
- Never let another bot's formatted output become user authority.
- Store bot-to-bot activity as metadata unless a governed owner imports it.

Profile automation:

- Treat user-connected automation as a separate product mode, not ordinary
  Telegram chat.
- Require explicit per-chat scope, pause/disable controls, and audit visibility
  before production use.

Guardian/join-request flows:

- Do not mix group admission decisions with Spark's personal operator memory or
  build authority.
- Design a separate data-retention and appeal policy before implementation.

## Link, Media, and Privacy Rules

- Prefer labeled links such as `Open preview`, `Open canvas`, `Open board`, and
  `Open report`.
- Do not expose raw local paths, tokens, ids, hashes, or chat identifiers.
- Disable previews for dense local status cards unless the preview is the
  content being inspected.
- Use HTTP/HTTPS media blocks only for intentionally shareable assets.
- Do not put private local files, credentialed URLs, or transient workspace paths
  into rich media blocks.
- Assume users may open links in Telegram Browser or a preferred external
  browser, so link labels must make the destination clear without relying on a
  preview.

## Spark Product Templates

### Build Or Spawner Readout

Use for "how is X going?", "open the result", "what changed?", or "is it done?"

```text
<artifact name> is <status>.

What I can prove
- <owner evidence>
- <preview/canvas/board availability>

What matters now
- <blocker or next verification>

Open preview: <link>
Open board: <link>
```

Do not claim shipped or finished from a pretty preview alone.

### Failure Or Blocker

```text
That run is blocked.

Blocker
- <owner-visible blocker or missing proof>

What still exists
- <canvas/board/partial artifact if any>

Open board: <link>
```

Avoid "unknown error" when owner logs contain a better blocker. If no better
blocker is available, say which proof is missing.

### Dense System Status

```text
Spark status is <good/neutral/blocked/bad>.

Clear
- <short item>

Needs attention
- <short item>

Inspect
- <link>
```

Move large diagnostics to Workspace or the board.

### Natural Chat

```text
<one or two plain paragraphs that answer the latest message>
```

Do not force a report card shape onto ordinary conversation.

## Test And QA Rules

Every Telegram platform change needs the smallest meaningful proof:

- unit tests for renderer, sanitizer, route policy, or authority boundary
- one positive case proving the intended route still works
- one negative trap proving examples, meta-talk, and no-action turns do not
  execute
- `npm run build`
- live Telegram Desktop CUA screenshot for user-visible formatting or streaming
- ledger check whenever the reply makes a state, completion, failure, memory,
  access, build, provider, browser/computer-use, installer, or publish claim

Launch readiness for a Telegram feature means:

- accepted by Bot API
- readable in live Telegram Desktop
- safe as plain text if rich rendering is degraded
- correctly tied to owner evidence
- no hidden authority change
- no duplicate truth store
- rollback available through env flag, route policy, or transport fallback

## Implementation Ownership

- `src/telegramRichMessage.ts` owns rich final rendering and rich transport
  payload hygiene.
- `src/telegramDraft.ts` owns draft streaming controls and draft route policy.
- `src/outboundSanitize.ts` owns final text sanitization and chunking.
- Natural route and intent modules may decide whether a route is chat, readout,
  ask, explain, or action, but must not decide formatting truth.
- Builder, Spawner, memory, wiki, CLI, installer, Cockpit, Labs, Swarm, and
  provider owners remain authoritative for their own state.
