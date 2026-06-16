# Spark Telegram Composition Standard

This is the product standard for dense Spark Telegram replies: recursive loop reports, diagnostics, creator/build status, Workspace sync, review queues, and natural-language command replies.

The original working rules lived in the local Codex skill:

```text
C:\Users\USER\.codex\skills\spark-telegram-composition\SKILL.md
```

This repo copy is the mergeable source for Telegram gateway behavior.

Composition work must follow `docs/SPARK_SYSTEM_GOVERNANCE_RULESET.md`.
Formatting is allowed to fix readability, spacing, link clutter, and scan
quality. It must not be used to compensate for a wrong route, stale source,
missing owner proof, or unsafe Harness/Governor decision.

## Goal

Telegram should answer only four things:

1. What happened?
2. Is it good, neutral, blocked, or bad?
3. What matters now?
4. Where can I inspect the full evidence?

Everything else belongs in Workspace, Canvas, Kanban, logs, traces, dashboards, or linked reports.

## Core Rules

- Keep Spark deterministic underneath, not at the surface. The route, state, access
  check, and evidence source should be exact; the Telegram reply should still feel
  like a capable teammate talking with the user.
- Prefer one clear headline over a paragraph.
- Let the user's moment choose the shape: prose for reassurance, a compact card for status, and a picker when the user must choose a lane or item.
- Natural follow-ups should default to conversational prose. Do not turn questions
  like "what happened?", "which LLM took it?", "is it still working?", or "where
  can I open it?" into rigid report cards.
- Use compact cards for `/status`, `/diagnose`, raw detail requests, review queues,
  and dense multi-system summaries. Do not use card layout simply because the
  answer came from a deterministic state machine.
- Prefer one or two plain sentences plus one inspect link for ordinary follow-ups.
  Section headings are optional, not the default.
- Use Telegram HTML for polished operational cards when the sender owns the
  escaping and delivery options. Escape dynamic text, disable link previews, and
  render links as short labels such as `Open canvas` or `Open board`.
- Prefer one inspect link per operational update. Do not show the same URL as
  both link text and a raw parenthesized URL, and do not send Canvas, Board, and
  trace links together unless the user asked for raw evidence.
- Do not use standalone markdown divider lines such as `---` in Telegram
  replies. Collapse them into normal paragraph spacing so sentence blocks have
  a blank line between them without looking like a pasted report.
- Use one status icon at the start of major outcome rows.
- Do not combine icons with bullets, numbering, or extra markers on the same row.
- Use dotted bullets (`•`) for grouped facts under section headings such as Score, Review, Workspace, Sharing, Why, and Move.
- Prefer dotted bullets over hyphen bullets in polished Telegram replies.
- Keep each section to one job: score, review, workspace, movement, or next action.
- Avoid repeated facts. If the score appears once, do not restate it in another line.
- Deduplicate direct and indirect repeats before sending. If two rows mean the same thing to a human, merge them or keep only the clearer row.
- Collapse repeated run movement into one count-aware row, such as `2 previous rounds held steady`.
- Treat saved trace, score, baseline, manifest, and candidate artifact rows as evidence metadata when the outcome already explains the movement. Keep those rows in Workspace.
- Avoid raw IDs, hashes, opaque tokens, stack traces, timestamps, file paths, or provider details unless the user explicitly asked for raw details.
- Put raw evidence behind Workspace, Decisions, Canvas, Board, logs, or trace links.
- Local Workspace links should be real and clickable in Telegram. Prefer `127.0.0.1` over `localhost`.
- If Workspace is intentionally private or gated, say that plainly only when the user may hit the gate. Do not present it as a recursive-loop failure.
- Verify link text matches the actual served preview port before calling a Workspace link ready.
- Prefer one useful next move. Avoid command menus unless the user asked for options.
- When a row already starts with a symbol or icon, do not prefix it with `-`, `1.`, or any other decoration.
- Avoid database voice. Convert system nouns into human nouns unless the technical noun is the useful thing.
- Prefer `ready`, `needs review`, `blocked`, `running`, `held steady`, `improved`, and `regressed` over internal lifecycle names.
- Do not show normal internal state like `open`, `review clear`, `ready canvas`, or evidence counts unless they change what the user should think or do.
- Let the absence of a warning mean clear.
- Preserve Spark's voice through small, plain sentences. Do not make every reply a rigid report card.

## Voice Boundary

Spark should feel like a friend who wants to get work done with the user, not a
chatbot performing a template.

Use exact machinery for:

- route decisions
- source-of-truth selection
- access/capability checks
- mission ids, trace ids, timestamps, and provider evidence
- safety gates and confirmation boundaries

Translate that machinery into human speech for Telegram:

- "Codex is on the latest job right now."
- "That run did not make it through. The blocker I can prove is..."
- "I found the app-like run, but no preview link is attached yet."
- "The board has the full trace if you want to inspect it."

Avoid defaulting to:

```text
Mission
• ...
Provider
• ...
Move
• ...
```

That shape is allowed only when the user asked for status, raw details, or a
scan-friendly queue.

## Emoji Ergonomics

Use emoji as an affordance, not decoration.

- Use at most one leading emoji on natural work-state lines.
- Good defaults: 🛠️ for work starting or actively shaping, ✨ for completion,
  ⚠️ for attention, and 🟢/🟡/🔴/⚪ for dense status cards.
- Do not put emojis on every bullet.
- Do not combine an emoji, a bullet, and a numbered marker on the same row.
- If an emoji does not make the message easier to scan, leave it out.
- Keep sensitive, safety, access, and failure explanations mostly plain unless
  a warning icon helps the user notice the boundary.
- For simple work-start or still-working moments, prefer one emoji-led paragraph
  over three small blocks. Example: "🛠️ I am setting up Relay Workshop as a
  planning canvas. I will send the canvas when planning is ready."
- Do not repeat the same work emoji across consecutive updates. The first
  action can carry the icon; quiet follow-ups like "still shaping" should usually
  stay plain and shorter.
- A little lower-case texture is allowed in quiet progress lines, such as
  "still shaping..." or "small win". Use it sparingly for vibe, not for warnings,
  access, safety, `/status`, or anything the user needs to parse as authority.

## Composition Rubric

Use this rubric when reviewing Telegram replies. A reply does not need to be
fancy; it needs to be easy to read, easy to act on, and alive enough to feel like
Spark is with the user.

### Readability

3 - The reply can be understood in five seconds. Paragraphs breathe, the main
point is obvious, and raw evidence is hidden behind a link unless requested.

2 - Understandable, but slightly cramped, repetitive, or too long for the moment.

1 - Technically correct, but the user has to parse telemetry, repeated facts, or
too many sections.

0 - The answer reads like logs, JSON, stack output, or a pasted internal packet.

### Ergonomics

3 - The reply gives the user one useful next move or one clear inspect surface.
Emoji, bullets, and links make scanning easier without adding clutter.

2 - The reply is usable, but shows an unnecessary id, extra link, repeated mission
number, or too many small blocks.

1 - The user can recover the answer, but must hunt through headings, raw fields,
or command noise.

0 - The reply pushes the user toward the wrong action, hides the useful action,
or sounds like the system is asking the user to debug Spark for it.

### Vibe

3 - The reply feels like a capable teammate: warm, direct, specific, and grounded
in current state.

2 - Polite and clear, but a bit template-like.

1 - Generic support-chat voice, rigid report card, or over-deterministic answer.

0 - Robotic, defensive, falsely certain, or disconnected from the user's moment.

Ship natural Telegram copy only when each dimension is at least 2. For common
high-traffic replies such as mission start, canvas ready, provider status,
latest failure, `/status`, and access status, aim for 3 in at least two
dimensions.

## Default Layouts

### Natural Follow-Up

```text
<plain answer in one or two sentences>

<optional inspect link when it helps>
```

Example:

```text
Codex is on the latest Spawner job right now.
```

Example with evidence:

```text
That run did not make it through. The blocker I can prove is that the spawned workspace was read-only.

Board: http://127.0.0.1:3333/kanban
```

### Outcome Report

```text
<status icon> Latest <thing> <result>.

Score
• <current metric>
• <comparison if useful>

Review
• <only if review is needed>

Workspace
• <link>
```

Example:

```text
⚪ Latest Spark QA Operator run held steady.

Score
• current run 0.8655
• unchanged from previous run

Workspace
• http://127.0.0.1:4178/runs?tab=recursions
```

### Recent Movement

```text
<Title>

🟢 latest run improved
⚪ previous run held steady
🟢 2 runs back improved

Workspace
http://127.0.0.1:4178/runs?tab=recursions
```

### Review Queue

```text
<Thing> review

Review
• <count> decisions waiting
• blocker: <main blocker>

Why
• <human reason>

Move
• <one useful move>

Workspace
• <link>
```

### Picker

```text
<Title>

🟡 <Human name>
<count> need review

⚪ <Human name>
clear

Use <one next command>.

Workspace
<link>
```

## Keep In Telegram

- Verdict.
- Metric that changed.
- Review count or blocker count.
- One next action when useful.
- One Workspace or surface link.

## Move Out Of Telegram

- Artifact inventories.
- Raw trace IDs.
- Exact timestamps unless timing is the point.
- Long local paths.
- Replay commands.
- Provider/router internals.
- Repeated summaries.
- Anything that reads like machine telemetry.

Only bring moved-out details back when the user asks for raw details, exact debug output, or the command that failed.

## Review Checklist

Before shipping a Telegram message:

- Can a non-technical user understand it in five seconds?
- Is there exactly one main thing to notice?
- Is each line carrying new information?
- Did we avoid double markers like `- <icon>` or `<icon> 1.`?
- Did we avoid standalone divider lines and use normal paragraph spacing
  between sentence blocks?
- Did we collapse repeated movement and artifact rows?
- Is raw evidence still accessible somewhere else?
- Is the next action obvious without being noisy?
- Does it sound like Spark helping a person, or like a service dumping JSON in nicer clothes?
