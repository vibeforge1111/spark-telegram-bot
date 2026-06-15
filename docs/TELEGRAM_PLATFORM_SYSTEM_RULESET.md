# Telegram Platform System Ruleset

This is the Spark-wide rulebook for using Telegram's current bot platform
without turning presentation features into authority, truth, or hidden side
effects.

Last checked against official Telegram docs on 2026-06-15.

## Official Source Map

Primary sources:

- Bot API changelog and method/object reference:
  https://core.telegram.org/bots/api
- Bot platform features:
  https://core.telegram.org/bots/features
- Spark whole-system Telegram surface map:
  docs/TELEGRAM_WHOLE_SYSTEM_RULESET.md
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

## Telegram Whole-System Map

For the complete source-backed surface registry, ingress/egress authority map,
root-cause patch rules, and QA coverage matrix, read
`docs/TELEGRAM_WHOLE_SYSTEM_RULESET.md` first. This section is the short-form
runtime policy.

Telegram is now more than "send a text reply." Spark must model it as a set of
separate surfaces, each with its own authority, privacy, and rendering boundary.

| Surface | What Telegram provides | Spark production rule |
| --- | --- | --- |
| 1:1 bot chat | Ordinary messages, rich final messages, private-chat drafts, buttons, media | Primary Spark operator console. Safe for rich/readable final replies and route-approved drafts. |
| Group/supergroup chat | Mentions, replies, topics, admin controls, join-request flows | Final-only unless a feature has group-specific privacy and wrong-chat QA. Never assume 1:1 memory scope. |
| Guest bot query | Bot can be mentioned in a chat where it is not a member and receives only the tagged message/reply context | Answer-only by default. Do not infer history, membership, or workspace authority. |
| Bot-to-bot conversation | Bots may respond to bot-origin messages | Labs only. Machine-origin text is evidence, never user authority. |
| Inline query / Web App query | `InputMessageContent`, including rich message content, can be returned through query-style surfaces | Gated. Rich output is still a delivery payload, not execution authority. |
| Profile chat automation | A user can connect a bot to respond on their behalf with configured chat scope | Separate product mode. Requires per-chat scope, pause controls, and an audit view before production. |
| Join-request guardian | Bot APIs for screening group join requests and Web App flows | Separate governance plane. Do not mix admission decisions with personal Spark memory. |
| Telegram Browser | User-controlled in-app or external browser opening for links and `.md` rendering | Link labels must be self-explanatory. Do not rely on previews or browser choice for safety. |

The route envelope must record which surface produced the turn. A private-chat
turn, a guest query, an inline result, a bot-to-bot message, and a group mention
are not interchangeable evidence.

## Transport Decision Tree

Choose the smallest Telegram transport that preserves meaning:

1. Use `sendMessage` when the answer is short, conversational, or compatibility
   matters more than structure.
2. Use `sendMessage` with safe HTML when a compact status card needs bold labels,
   simple links, and maximum fallback reliability.
3. Use `sendRichMessage` when the final reply benefits from Telegram rich blocks:
   real headings, paragraphs, lists, dividers, blockquotes, details, tables,
   pre/code, math, media, anchors, references, or long evidence summaries.
4. Use `sendRichMessageDraft` only for route-approved private-chat previews while
   the final answer is being generated.
5. Use inline rich message content only for query surfaces after privacy and
   context-scope review.
6. Use media blocks only when the media is intentionally shareable through an
   HTTP/HTTPS URL and reveals the real artifact or result.

Do not pick a richer transport just because it is available. Richness must reduce
reading effort or improve interaction, not add spectacle.

## Bot API Contract Rules

- `InputRichMessage` must contain exactly one of `html` or `markdown`.
- Prefer rich HTML for Spark-generated cards because escaping and supported-tag
  control are easier to audit. Use rich Markdown only for trusted Markdown
  sources that already match Telegram's rich-message grammar.
- Leave `skip_entity_detection` off unless automatic detection would create a
  specific bug such as accidental command, phone, e-mail, hashtag, or cashtag
  linking in a diagnostic card.
- `sendRichMessage` sends the final persistent message. It may include reply
  markup, notification flags, content protection, thread/direct-topic routing,
  and other Telegram-supported delivery extras.
- `sendRichMessageDraft` is ephemeral. It is a temporary preview for a private
  chat; Spark must send a final persisted message afterward.
- `editMessageText` with `rich_message` is only for bot-owned message edits. It
  must never be used to rewrite history, hide a failure, or mimic streaming.
- Rich inline query content is a query answer payload. It must not start a build,
  memory write, publish, browser/computer-use action, provider run, schedule, or
  installer action unless a separate governed turn authorizes it.
- Media blocks must use HTTP/HTTPS URLs. Do not embed local file paths,
  credentialed URLs, private artifacts, or transient workspace files as rich
  media.
- Paid broadcast, effects, and other attention features are delivery controls.
  They need explicit product policy before Spark uses them in production.

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

## Rich Block Adoption Rules

| Telegram rich feature | Spark use | Rule |
| --- | --- | --- |
| Paragraphs and headings | Normal readable cards | Default rich structure. Headings must be real sections, not decorative emphasis. |
| Lists and checklists | Tasks, blockers, review queues, choices | Good for grouped facts. Checklists imply item state; use only when state is real. |
| Dividers | Separating dense sections | Use sparingly. Visible plain-text fallback must still scan well. |
| Blockquotes and pull quotes | Quoted user text, owner evidence snippets, notable caveats | Do not use quotes as authority. Label the source when it matters. |
| Details/summary | Optional debug detail | The summary must stand alone. Do not hide blockers or approvals inside collapsed details. |
| Tables | Tiny comparisons, scores, capability matrices | Use only when two to four columns beat bullets. Avoid broad diagnostics in Telegram. |
| Pre/code | Commands, exact snippets, short logs | Never include secrets. Move long logs to Workspace. |
| Anchors, references, footnotes | Evidence definitions, caveats, local glossary | Gated until live clients prove they stay readable. Never bury the decision in a footnote. |
| Math | Bench formulas and technical scoring | Gated. Use only when the formula itself helps the user. |
| Media blocks | Real screenshots, previews, generated assets | Use only public or local-safe HTTP/HTTPS URLs and only when the user benefits from seeing the asset inline. |
| Collage/slideshow | Visual result galleries | Labs until desktop and mobile QA prove layout quality. |
| Map/location | Location-specific workflows | Separate privacy review required. |
| Thinking block | Temporary draft placeholder | Draft-only. Never final. Never proof of work. |

## Long Message Policy

Telegram rich messages can hold much more than basic text, but Spark should not
turn Telegram into a raw report dump.

- Basic text remains the compatibility path for short replies.
- Rich final messages may be used for longer summaries only when the first screen
  carries the answer and the rest is genuinely useful.
- Long reports must still have an inspect surface in Workspace, Canvas, Board,
  logs, or a saved report.
- If a rich final message crosses normal `sendMessage` limits, add explicit
  renderer/chunking tests before widening runtime limits.
- Current implementation note: `src/telegramRichMessage.ts` intentionally trims
  rich output near the compatibility range until long-rich chunking and live
  client QA are added. Do not remove that cap as a casual cleanup.

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

Inline and Web App query flows:

- Treat query text as scoped query evidence, not private chat continuity.
- Do not import inline query content into memory unless the user explicitly
  approves and policy permits it.
- If returning rich content, the query answer must be self-contained and safe
  when forwarded or inserted into another chat.

Group and topic flows:

- Verify the chat, topic, and bot role before replying with operational state.
- Avoid leaking private workspace, local preview, or owner evidence into group
  contexts.
- Confirmation must happen in the same authority context or in a clearly linked
  private handoff; stale private-chat approval cannot silently authorize a group
  action.

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
- For `.md` files and report links that Telegram Browser may render directly,
  treat the document itself as user-facing product copy, not as a raw artifact
  dump.
- Buttons and reply markup may make actions easier to tap, but the button label
  is not the authorization record. The governed action id, owner verification,
  and ledger remain authoritative.

## Spark Message Shape Registry

Use this registry when turning Spark system output into Telegram copy.

| Spark output | Telegram shape | Must show | Must hide or move |
| --- | --- | --- | --- |
| Natural conversation | Short prose | Direct answer | System internals, forced sections |
| Build/Spawner state | Compact card with links | Status, proof boundary, preview/canvas/board links if real | Raw mission ids unless requested |
| Mission progress | Mission relay event | Current stage and blocker/next event | Chat-draft streaming of execution claims |
| Completion/failure | Outcome card | Owner proof or missing proof | Polished "done" without terminal evidence |
| Diagnostics | Compact card plus Workspace/log link | High-level health and warnings | Raw dumps, stack traces, tokens |
| Memory/wiki answer | Prose plus source boundary | What can be answered, source class, caveat if needed | Draft text as memory evidence |
| Provider/model run | Short result/readout | Which result matters and where to inspect | Provider telemetry unless asked |
| Browser/computer-use | Authorization or final evidence card | User approval boundary, visible result evidence | Hidden side effects, implicit browser control |
| Publish/PR/deploy | Confirmation/readout | Approval receipt, target, terminal result | Publishing from link/button text alone |
| Installer/Cockpit/Labs/Swarm | Readiness card | State, blocker, next verification | Launch claims without installer owner proof |
| Long report | Rich summary plus Workspace | Top verdict and inspect link | Full report inside Telegram by default |

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

## Documentation And Implementation Discipline

Before any Telegram feature or fix lands:

1. Name the affected Telegram surface: private chat, group/topic, guest, bot-to-bot,
   inline/Web App query, profile automation, join request, media/link, draft, or
   final message.
2. Name the Spark owner: Telegram rendering, Harness/Core authority, Builder,
   Spawner, memory/wiki, provider, browser/computer-use, installer, Cockpit,
   Labs, Swarm, or another owner.
3. Decide the smallest transport surface from the decision tree.
4. Add positive and negative tests for both readability and authority when the
   change can affect routing, claims, side effects, or user-visible trust.
5. Run live Telegram Desktop CUA when the claim is visual, spacing-related,
   streaming-related, link-related, or client-behavior-related.
6. Update this ruleset or the rich-message ruleset if a new Telegram capability
   is adopted, rejected, or deferred.

## Implementation Ownership

- `src/telegramRichMessage.ts` owns rich final rendering and rich transport
  payload hygiene.
- `src/telegramDraft.ts` owns draft streaming controls and draft route policy.
- `src/outboundSanitize.ts` owns final text sanitization and chunking.
- Natural route and intent modules may decide whether a route is chat, readout,
  ask, explain, or action, but must not decide formatting truth.
- Builder, Spawner, memory, wiki, CLI, installer, Cockpit, Labs, Swarm, and
  provider owners remain authoritative for their own state.
