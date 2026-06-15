# Telegram Whole System Ruleset

This is the Spark-owned map for Telegram as a full product surface, not just a
text transport. Use it before adding or changing Telegram-facing behavior in
Spark.

Last checked against official Telegram docs on 2026-06-15.

## Official Source Map

Primary sources inspected:

- Bot API reference and changelog:
  https://core.telegram.org/bots/api
- Bot platform features:
  https://core.telegram.org/bots/features
- Bot API rich message formatting:
  https://core.telegram.org/bots/api#rich-message-formatting-options
- Bot API `sendRichMessage`:
  https://core.telegram.org/bots/api#sendrichmessage
- Bot API `sendRichMessageDraft`:
  https://core.telegram.org/bots/api#sendrichmessagedraft
- Telegram Mini Apps:
  https://core.telegram.org/bots/webapps
- Inline bots:
  https://core.telegram.org/bots/inline
- Payments:
  https://core.telegram.org/bots/payments
- Telegram 2026-06-11 product update:
  https://telegram.org/blog/watch-apps-and-more
- Telegram 2026-05-07 AI bot product update:
  https://telegram.org/blog/ai-bot-revolution-11-new-features
- Telegram 2026-03-01 streaming/product update:
  https://telegram.org/blog/member-tags-disable-sharing-and-more

## Core Principle

Telegram is Spark's field console. It can make Spark faster, clearer, more
interactive, and more human-readable. It does not own Spark truth.

Every Telegram feature must be classified as one of:

1. Ingress evidence: a thing the user, Telegram, or another bot sent.
2. Presentation: a way Spark renders information back to the user.
3. Interaction affordance: a button, command, callback, Web App, inline result,
   deep link, or menu that helps the user act.
4. Side-effect surface: an operation that changes external state, spends money,
   publishes, saves memory, controls a browser/computer, starts a build, or
   mutates account/chat configuration.

Ingress evidence and interaction affordances may propose intent. They are never
authority by themselves. Authority still comes from the relevant Spark owner,
Harness/Core envelope, Governor decision, authorization decision, owner proof,
and final user-facing readout.

## Whole Surface Registry

| Telegram surface | What Telegram provides | Spark production rule |
| --- | --- | --- |
| Private bot chat | Messages, media, voice, commands, buttons, rich final messages, drafts | Primary Spark operator console. Rich formatting and draft previews are allowed only under route policy. |
| Group/supergroup/topic | Mentions, replies, topics, admin role boundaries, privacy mode | Treat as shared context. Never leak private workspace/state. Authority must match chat/topic scope. |
| Channel/direct messages | Channel posts, direct-message topics, suggested posts | Gated. Requires explicit owner/product policy before operational Spark state is posted. |
| Guest mode | One-shot reply to a mention or reply without chat membership | Answer-only by default. No history, membership, or durable-memory assumptions. |
| Bot-to-bot | Direct or group interaction with other bots when enabled | Labs unless machine-origin policy exists. Must dedupe and rate-limit to prevent loops. |
| Inline mode | Query from any chat and user-selected result insertion | Retrieval/share surface, not execution authority. Rich inline content must be self-contained. |
| Web App / Mini App | Full JS UI inside Telegram, theme/context data, events | Separate app surface. Must authenticate init data and preserve Spark owner boundaries. |
| Deep links | `/start` or `/startgroup` payloads from t.me links | Scoped intent hint only. Payloads need validation, freshness, and authorization. |
| Callback buttons | Button tap sends callback query, not a chat message | Interaction affordance. Callback data must map to a governed action id. |
| Reply keyboards | Button tap sends text into chat | Treat as user text but verify route and user authorization. |
| Chat/user selection | Service messages with selected ids | Sensitive identifiers. Verify access before acting on ids. |
| Rich final messages | Structured final message with headings, lists, tables, media, details, formulas | Presentation only. Use when structure reduces reading effort. |
| Rich drafts | Ephemeral partial rich preview while generating | Presentation only. Must be finalized by a persistent message. |
| Message edits | Mutate bot-owned message history | Clutter reduction only. Never rewrite failure history or owner proof. |
| Media/files | Uploads, file ids, HTTP fetches, local Bot API capabilities | Privacy-gated. File ids are bot-scoped. Local paths must not leak. |
| Polls/checklists | Native poll/checklist objects and service updates | Use only when Telegram owns the interaction state or the owner has a sync plan. |
| Payments/Stars/paid media | Invoices, pre-checkout, successful-payment service messages, digital goods | Separate commerce authority. Never ship or unlock from UI text alone. |
| Business/Secretary mode | User-authorized account automation and business updates | Separate product mode with per-chat scope, pause controls, and audit visibility. |
| Managed bots | A bot can manage bot creation/tokens when enabled | High-risk account authority. No production use without secret and ownership governance. |
| Join-request guardian | AI/admin screening and join-request query APIs | Separate group-admission plane. Do not mix with personal Spark memory. |
| Games/stickers/custom emoji | HTML5 games, sticker sets, custom emoji metadata | Product surfaces only. Must not be used as operational proof. |
| BotFather/profile | Commands, descriptions, menu, privacy/inline/guest/bot-to-bot settings | Deployment/config authority. Changes need operator approval and rollback notes. |
| Test environment/local Bot API | Dedicated test server, local API server capabilities | QA infrastructure. Do not infer production behavior without production-client proof. |

## Ingress Authority Rules

- Every inbound update must carry its Telegram surface in the route envelope:
  private chat, group/topic, channel, business, guest, inline, callback,
  Web App, poll, payment, join request, managed bot, or service message.
- Commands are not inherently valid because Telegram highlights them. Telegram
  command scopes are display hints; the backend must verify the command exists
  and that the user is authorized.
- Deep-link payloads are untrusted input. Validate length, encoding, route,
  freshness, owner, and replay risk before using them.
- Callback data is untrusted input. It must reference a known governed action,
  not free-form instructions.
- Reply-keyboard text is still natural text. It must pass the same intent and
  authority path as typed user text.
- Service messages are facts about Telegram state, not user instructions.
- Bot-to-bot input is machine-origin evidence. It cannot authorize a high-agency
  Spark action unless a machine-origin policy explicitly permits it.
- Guest-mode input includes only the summoning message and direct reply context.
  It must not read private memory or assume ongoing chat history.
- Inline query input is a retrieval/share request. It must not start builds,
  writes, browser/computer-use, installer actions, or publishes by default.

## Outbound Transport Rules

Choose the smallest transport that preserves meaning:

| Transport | Use when | Hard rule |
| --- | --- | --- |
| `sendMessage` plain text | Short chat, simple answers, maximum compatibility | Must be readable without formatting. |
| `sendMessage` with HTML/entities | Short cards, links, confirmations | Escape text and verify link labels. |
| `sendRichMessage` | Structured final answers, reports, status cards, evidence summaries | Presentation only; final persisted readout. |
| `sendRichMessageDraft` | Private-chat streaming preview while a safe answer is generated | Ephemeral, one draft id per turn, final message required. |
| `editMessageText` | Reduce clutter on bot-owned messages | Do not hide failures or rewrite proof. |
| `answerCallbackQuery` | Acknowledge button taps or open an approved URL | Callback ack is not action proof. |
| `answerInlineQuery` | Return selectable inline results | Returned content must be safe in the destination chat. |
| `sendChatAction` | Short "typing/uploading" presence | No truth value; never substitute for progress proof. |
| `sendPhoto`/media group/media rich blocks | The media itself is useful and shareable | No local paths, tokens, private URLs, or transient artifacts. |
| `sendPoll`/`sendChecklist` | Telegram-native interaction state is desired | Owner must define how state changes sync back to Spark. |
| `sendInvoice`/payment methods | Commerce flow | Requires commerce owner, test mode, and successful-payment verification. |
| Web App / game launch URL | User needs a full UI | Authenticate init data and enforce scope inside the app. |

## Rich Message Capability Rules

Telegram rich messages support much more than classic `parse_mode`: headings,
paragraphs, dividers, ordered/unordered/task lists, nested emphasis, block and
pull quotes, details blocks, tables, anchors, in-document references, footnotes,
inline and block formulas, maps, media blocks, captions, collages, and
slideshows.

Spark must adopt those features in tiers:

| Feature group | Production tier | Spark rule |
| --- | --- | --- |
| Paragraphs, headings, dividers | Production | Use for readable structure only. |
| Lists and task lists | Production | Use lists for grouped facts; use task lists only when item state is real. |
| Bold, italic, underline, strike, code, spoiler, mark, sub/sup | Production with restraint | Emphasis cannot carry the only important meaning. |
| Links and anchors | Production/gated by surface | Label links by destination; anchors are gated until client QA. |
| Blockquotes/pull quotes | Production with restraint | Source must be clear when quoting evidence or a user. |
| Details/summary | Production after live QA | Visible summary must contain the verdict; blockers cannot hide inside details. |
| Tables | Production for tiny tables | Maximum two to four useful columns for Spark cards. Avoid mobile-hostile diagnostics. |
| Pre/code blocks | Production for short exact snippets | No secrets, tokens, long logs, or private paths. |
| Footnotes/references | Gated | For caveats/definitions only, never for the main decision. |
| Math/formulas | Gated | Use when the formula itself is user-facing value. |
| Media blocks | Gated | HTTP/HTTPS only, privacy-reviewed, Desktop and mobile QA required. |
| Maps/location | Gated | Location privacy review required. |
| Collage/slideshow | Labs | Use for visual galleries only after live client QA. |
| `tg-thinking` / thinking block | Draft-only labs | Never final, never proof of work. |

## Rich Message Constraints

- `InputRichMessage` must use exactly one of `html` or `markdown`.
- Spark-generated rich cards default to HTML because escaping and allowlisting
  are easier to audit.
- Automatic entity detection stays on unless a specific card has a documented
  accidental-linking risk.
- Media blocks support only HTTP and HTTPS URLs. Do not render local file paths,
  credentialed links, private artifacts, or transient workspace files.
- Table cells can contain inline formatting only.
- Formula source is raw LaTeX. Treat model/provider formula text as untrusted
  until escaped and bounded.
- Rich messages have larger limits, but Spark should not dump reports into chat.
  The first visible screen must answer the user's question.
- Current runtime intentionally trims rich output near compatibility limits until
  long-rich chunking and live mobile/Desktop QA are proven.

## Streaming Rules

- Streaming is for perceived responsiveness, not execution telemetry.
- Drafts are private-chat scoped in Spark production policy.
- A draft must not claim `done`, `ready`, `fixed`, `saved`, `published`,
  `deleted`, `sent`, `charged`, `installed`, or `completed` before owner proof.
- A draft must not become durable memory, route evidence, owner proof, or a final
  report.
- If draft delivery fails, disable drafts for that turn and send a normal final
  reply.
- High-agency routes such as builds, publishes, installer actions, browser or
  computer-use control, access changes, repairs, memory writes, and payments are
  final-only unless a typed event protocol proves partial text cannot mislead.

## UX Composition Rules

- Use Telegram richness to improve scanning, not to decorate.
- Spacing is a product requirement. If Telegram Desktop renders semantic rich
  blocks too flat, the outgoing text or fallback must include visible separators.
- A compact Spark card should fit this order:
  status, proof boundary, what matters now, inspect link.
- Compact means compact. Rich blocks and visible dividers are for dense cards,
  not tiny lifecycle notices where they add more whitespace than meaning.
- Artifact/status readouts must carry useful owner-evidence signal, not just a
  title such as "has a current result." A valid readout should show what changed,
  proof/inspection links or owner evidence, blockers if any, and the next safe
  move.
- Long reports go to Workspace/Canvas/Board/logs with a rich summary in Telegram.
- Use inline buttons for clear actions, not for disguised confirmations.
- Use reply keyboards only when the user benefits from constrained choices.
- Use Web Apps only when a real custom interface is better than chat.
- Use polls/checklists only when native Telegram state is the right interaction,
  not as a workaround for Spark state.
- Always preserve a plain-text reading order that makes sense without formatting.

## Privacy And Safety Rules

- Do not show raw chat ids, user ids, tokens, hashes, local paths, provider
  internals, stack traces, memory bodies, transcript bodies, or private artifact
  URLs unless the user explicitly asks for raw diagnostic detail and policy
  permits it.
- Local operational links should be labeled by destination: `Open preview`,
  `Open canvas`, `Open board`, `Open report`.
- Labeled links must not be followed by the same raw URL. Collapse duplicated
  Markdown/link-preview echoes at the renderer boundary.
- Assume links may open in Telegram Browser or an external browser. The label
  must carry the safety context without relying on a preview.
- Buttons, link previews, rich cards, media, and drafts are not confirmation
  records. The ledger and owner verification remain authoritative.
- File ids are bot-scoped. Test bots cannot safely reuse production file-id
  assumptions.
- Business, payment, managed-bot, join-request, geolocation, and Web Login
  surfaces require separate privacy/security review before production.

## Spark Owner Map

| Spark concern | Telegram can render | Telegram must not own |
| --- | --- | --- |
| Spawner/Builder | Status, canvas, board, preview, blocker, owner proof boundary | Build execution truth or completion claims |
| Memory/wiki | Source class, confidence, caveat, inspect link | Durable memory write authority or memory body truth |
| Recursive/domain-chip | Current loop state, result summary, review need | Candidate acceptance without owner proof |
| Provider/model | Useful result, fallback, provider issue summary | Provider selection authority outside policy |
| Browser/computer-use | Approval request, visible result evidence | Hidden side effects or browser authority |
| Installer/Cockpit/Labs/Swarm | Readiness state, blocker, inspect link | Launch readiness without owner terminal proof |
| Access/identity | Prompt, denial, repair next step | Credential or permission mutation without owner path |
| Payments/commerce | Invoice and final payment proof | Unlock/shipping without successful-payment verification |

## Root-Cause Patch Rules

When Telegram behavior is wrong, do not patch by matching a phrase from the bad
reply. Classify the failure first:

1. Wrong surface: private/group/guest/inline/callback/business semantics were
   mixed.
2. Wrong owner: Telegram made a claim owned by Builder, Spawner, memory, access,
   installer, provider, browser/computer-use, or commerce.
3. Wrong authority: an affordance, keyword, draft, route hint, or old pending
   state acted like permission.
4. Wrong evidence: a final readout claimed completion/failure without owner
   proof or missed a newer failure.
5. Wrong composition: the answer was true but unreadable, cramped, duplicated,
   raw, title-only, repeated-heading, evidence-light, or missing the next useful
   move.
6. Wrong transport: the message should have been plain, rich, draft, Web App,
   callback, media, poll, checklist, or link-based.

Patch the earliest owning layer. Then add a positive case and a negative trap
for the same failure family.

## QA Coverage Matrix

Every Telegram-facing launch feature should have evidence across these buckets:

| Bucket | Must prove |
| --- | --- |
| Private natural chat | Conversational replies do not hijack into builds or actions. |
| Explicit action | Fresh explicit user intent triggers the right owner route. |
| No-action/meta-talk | Examples, bug reports, quotes, "talk me through it", and status questions stay answer/readout routes. |
| Rich formatting | Desktop screenshot shows readable spacing and correct link labels. |
| Draft streaming | Private-chat draft appears quickly and final message persists. |
| Owner proof | Completion/failure/readiness claims match owner ledgers and latest state. |
| Group/privacy | Shared chats do not leak private workspace or memory. |
| Guest/inline | One-shot/query contexts do not inherit private chat continuity. |
| Callback/buttons | Button taps acknowledge quickly and map to governed action ids. |
| Media/links | No private local paths or tokens are exposed. |
| Long reports | Telegram summary is readable and full evidence is linked elsewhere. |
| Error paths | Telegram says what proof or owner blocker is missing, not just "unknown error". |
| Runtime resilience | Failed rich/draft sends fall back without dropping the user reply. |
| Loop control | Bot-to-bot or automation surfaces cannot create unbounded loops. |

## Launch Gate

A Telegram feature is launch-ready only when:

- the official Telegram surface has been named
- the Spark owner has been named
- route authority and owner proof boundaries are explicit
- renderer/route/privacy tests cover one positive and one negative case
- `npm run build` passes when source behavior changed
- runtime sync is checked when deployed runtime files changed
- live Telegram Desktop CUA proves formatting or streaming when visual behavior
  changed
- the rollback path is an env flag, route policy, feature tier, or transport
  fallback
