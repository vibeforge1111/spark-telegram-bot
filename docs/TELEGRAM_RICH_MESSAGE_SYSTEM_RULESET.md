# Telegram Rich Message System Ruleset

This is the Spark-owned contract for Telegram rich text, streaming drafts, and
client-safe final replies. Read it together with
`docs/TELEGRAM_PLATFORM_SYSTEM_RULESET.md`, which owns the broader platform
rules for guest mode, bot-to-bot, inline results, automation, link/media
privacy, and adoption tiers. It applies to all Telegram-facing Spark systems:
Spawner, Builder, memory/wiki, recursive/domain-chip, provider/access,
browser/computer-use, installer, Cockpit, Labs, Swarm, and Telegram itself.

Last checked against official Telegram docs on 2026-06-15.

## Official Surface Map

Primary sources:

- Bot API `sendMessage` and formatting options:
  https://core.telegram.org/bots/api#sendmessage
- Bot API rich message formatting:
  https://core.telegram.org/bots/api#rich-message-formatting-options
- Bot API `sendRichMessage`:
  https://core.telegram.org/bots/api#sendrichmessage
- Bot API `sendRichMessageDraft`:
  https://core.telegram.org/bots/api#sendrichmessagedraft
- Telegram 2026-06-11 product update:
  https://telegram.org/blog/watch-apps-and-more
- Telegram 2026-05-07 streaming text product update:
  https://telegram.org/blog/ai-bot-revolution-11-new-features

Telegram now has four distinct reply surfaces that must not be confused:

| Surface | Bot API method | Spark use | Limit / boundary |
| --- | --- | --- | --- |
| Basic final text | `sendMessage` | Client-safe fallback, simple chat, compatibility cards | 4096 chars after entity parsing |
| Rich final message | `sendRichMessage` | Long or block-rich final replies when live clients render them well | 32768 UTF-8 chars, 500 blocks, 16 nesting levels, 50 media attachments |
| Rich draft stream | `sendRichMessageDraft` | Private-chat partial previews while an answer is being generated | Ephemeral 30-second preview; must be finalized with `sendRichMessage` or compatible final send |
| Message edit | `editMessageText` with text or `rich_message` | Optional future clutter reduction for bot-owned messages | Never use to fake truth; final state still needs owner evidence |

## Formatting Capability Ladder

Use the smallest surface that preserves readability and truth.

1. Plain final text
   - Use for ordinary conversational replies.
   - Must still be readable with no formatting.

2. Basic HTML final text
   - Use for short status cards and compatibility fallbacks.
   - Allowed tools: bold headings, inline links, simple bullets, visible section
     separators, and disabled link previews for dense local links.
   - Do not depend on blank lines alone for section separation. Telegram Desktop
     can render dense messages with too little visible breathing room.

3. Rich final message
   - Use for structurally rich messages: headings, paragraphs, pre/code,
     footers, dividers, real lists/checklists, blockquotes, details, tables,
     math blocks, anchors/footnotes, and HTTP/HTTPS media blocks.
   - Use `InputRichMessage.html` by default. Use rich Markdown only when the
     source is already safe Markdown and does not require heavy escaping.
   - Keep `skip_entity_detection: false` unless a message intentionally disables
     automatic entity detection.

4. Rich draft stream
   - Use only for routes approved by the streaming route policy.
   - Private chats only unless Telegram documents and live QA proves other chat
     types.
   - Drafts are presentation, not memory, not audit truth, and not completion
     evidence.
   - Reuse one non-zero `draft_id` per turn so Telegram animates updates.

## Rich HTML Rules

The rich HTML renderer may use only tags Telegram documents as supported. The
current useful set for Spark is:

- inline: `b`, `strong`, `i`, `em`, `u`, `ins`, `s`, `strike`, `del`, `code`,
  `mark`, `sub`, `sup`, `tg-spoiler`, `a`, `tg-emoji`, `tg-time`, `tg-math`
- blocks: `h1` through `h6`, `p`, `pre`, `footer`, `hr`, `ul`, `ol`, `li`,
  `blockquote`, `aside`, `details`, `summary`, `tg-math-block`
- richer artifacts: `table`, `caption`, `tr`, `th`, `td`, `figure`,
  `figcaption`, `cite`, `img`, `video`, `audio`, `tg-collage`,
  `tg-slideshow`, `tg-map`

Rules:

- Escape user and provider text before inserting it into HTML.
- Do not send unsupported tags and hope the client accepts them.
- Do not put media URLs into rich media blocks unless they are HTTP/HTTPS and
  intentionally public or locally safe for the target user.
- Prefer labeled links such as `Open preview`, `Open canvas`, and `Open board`
  over raw local URLs.
- Disable link previews on dense diagnostic/status cards unless the preview is
  the actual content the user needs.
- Tables are for small comparisons only; move broad diagnostics to Workspace.
- Details blocks are good for optional debug detail, but the top-level summary
  must stand alone if the details render collapsed.
- Footnotes/references are for evidence definitions, not for hiding blockers.

## Client-Safe Readability Rules

Live Telegram Desktop proof beats renderer assumptions.

- A message is not readable just because its HTML is semantically structured.
- If blockquotes, dividers, headings, or paragraph spacing render flat in the
  active client, the production card must include visible text-level separation.
- For compact Spark cards, section boundaries must survive as plain text:
  `title`, visible divider, `section heading`, bullets, visible divider, next
  section.
- Never rely only on `\n\n` between sections for important status cards.
- The renderer must recover section boundaries from dense governed replies such
  as `Title / Section / bullet / Section / bullet`, because model-shaped answers
  can legitimately lose blank lines before delivery.
- Avoid raw IDs, hashes, long paths, stack traces, and provider internals unless
  the user asked for raw detail.
- A card may look quieter than Telegram's newest rich-text demo if that makes it
  more reliable for launch-day Desktop and mobile users.

## Streaming Truth Rules

- `sendRichMessageDraft` is for partial previews only. The final answer must be
  sent after the draft, and only the final answer can be remembered or audited as
  delivered content.
- Draft text must never claim `saved`, `created`, `deleted`, `sent`, `fixed`,
  `finished`, or `ready` before owner proof exists.
- Mission/build execution should use mission relay events, not chat drafts.
- Memory saves, access/config changes, destructive routes, diagnostics, and
  permission denials are final-only unless a route-specific typed event protocol
  proves the partial text cannot mislead the user.
- If draft delivery fails, disable drafts for that turn and send the final reply
  normally.

## Spark Ownership Rules

- Telegram owns rendering and delivery, not Builder truth, memory truth, Spawner
  execution truth, or installer truth.
- Rich formatting must not change route, owner, authority, or completion claims.
- A pretty message is never proof that a build shipped or a system is healthy.
- Completion claims require owner terminal success, verification proof, and no
  newer owner failure for the same artifact.
- Failure claims must name the owner-visible blocker or say which proof is
  missing.

## Implementation Rules

- `src/telegramRichMessage.ts` owns rich/fallback rendering.
- `src/telegramDraft.ts` owns draft streaming and draft route policy helpers.
- `src/outboundSanitize.ts` owns final Telegram-safe sanitization and chunking.
- `src/index.ts` may choose the transport, but should not hand-format card HTML.
- Tests must cover:
  - escaping provider/user text
  - labeled local links
  - visible section separation in compatibility cards
  - rich-message extra stripping
  - draft private-chat gating
  - final-only routes that must not draft-stream

## Live QA Gate

For Telegram UX changes, passing unit tests is not enough.

Before claiming a Telegram rich-message fix is ready:

1. Run focused renderer/draft tests.
2. Build the bot.
3. Sync/restart the runtime when testing the live module.
4. Send at least one natural prompt in Telegram Desktop via CUA.
5. Capture a screenshot of the visible reply.
6. Check route/owner ledgers when the reply makes any state claim.
7. If the screenshot is cramped, flat, clipped, or misleading, the feature is
   not ready even if the API call succeeded.
