# Spark Agent Usage Research: Hermes, OpenClaw, And Human Spark QA

Date: 2026-06-16

Purpose: turn current external agent patterns into better Spark readiness
testing. This is not a feature-copying document. It is a humanizer map: what
people naturally expect from persistent agents, where those expectations fail,
and how Spark should test the same moments through Harness/Core authority,
owner evidence, memory boundaries, and Telegram readability.

## Sources Read

Primary sources:

- Hermes Agent repository:
  https://github.com/nousresearch/hermes-agent
- Hermes Telegram setup:
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/messaging/telegram.md
- Hermes memory providers:
  https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory-providers.md
- Hermes Telegram rich messages issue:
  https://github.com/NousResearch/hermes-agent/issues/46009
- Hermes rich message feature issue:
  https://github.com/NousResearch/hermes-agent/issues/44428
- Hermes rich typography issue:
  https://github.com/NousResearch/hermes-agent/issues/45762
- OpenClaw product page:
  https://openclaw.ai/
- OpenClaw docs:
  https://docs.openclaw.ai/
- OpenClaw Telegram channel:
  https://docs.openclaw.ai/channels/telegram
- OpenClaw browser tool:
  https://docs.openclaw.ai/tools/browser
- OpenClaw memory overview:
  https://docs.openclaw.ai/concepts/memory
- OpenClaw context:
  https://docs.openclaw.ai/concepts/context
- OpenClaw session management:
  https://docs.openclaw.ai/concepts/session
- OpenClaw multi-agent routing:
  https://docs.openclaw.ai/concepts/multi-agent
- OpenClaw security:
  https://docs.openclaw.ai/gateway/security
- OpenClaw pairing:
  https://docs.openclaw.ai/channels/pairing
- OpenClaw exec approvals:
  https://docs.openclaw.ai/tools/exec-approvals
- OpenClaw permission modes:
  https://docs.openclaw.ai/tools/permission-modes
- OpenClaw Codex Computer Use:
  https://docs.openclaw.ai/plugins/codex-computer-use
- OpenClaw-RL repository:
  https://github.com/Gen-Verse/OpenClaw-RL

General usage baselines:

- OpenAI consumer usage study:
  https://openai.com/index/how-people-are-using-chatgpt/
- OpenAI/NBER usage paper:
  https://cdn.openai.com/pdf/a253471f-8260-40c6-a2cc-aa93fe9f142e/economic-research-chatgpt-usage-paper.pdf
- Pew usage report:
  https://www.pewresearch.org/short-reads/2025/06/25/34-of-us-adults-have-used-chatgpt-about-double-the-share-in-2023/
- Anthropic agent engineering guidance:
  https://www.anthropic.com/engineering/building-effective-agents

## Research Takeaways

### Hermes Pattern: A Relationship-Like Persistent Agent

Hermes frames the agent as something that grows with the user: persistent
memory, skill creation from experience, conversation search, Telegram access,
voice notes, attachments, scheduled task results, and group usage.

What Spark should learn:

- Users will talk as if the agent has an ongoing life with them.
- They will expect the agent to know projects, preferences, and recent work.
- They will not always say "remember"; they will imply continuity.
- They will expect useful reachability from Telegram, not a weaker bot mode.
- They will notice when formatted agent output is hard to read.

Spark QA implication:

- Test recent context, durable memory, wiki support, and owner truth as separate
  lanes.
- Make the bot say whether it is relying on recent conversation, saved memory,
  owner state, or a fresh check when that distinction matters.
- Never let "friendly persistence" become fake memory or fake completion.

### Hermes Telegram Rich/Streaming Pattern

Hermes work around rich Telegram output shows the right product pressure:
structured replies should render cleanly, stream quickly, and avoid raw markup.
The issues also show a tradeoff: always-on rich messages can make ordinary prose
look oversized or document-like, and streaming edits can destroy rich formatting.

What Spark should learn:

- Rich Telegram output should be adaptive, not automatic.
- Normal chat should stay normal and readable.
- Tables, checklists, code, diagnostics, and structured build reports deserve
  richer formatting.
- Streaming previews need a finalization path that preserves formatting instead
  of leaving raw Markdown or duplicate messages.

Spark QA implication:

- Test ordinary chat, compact status, build reports, diagnostics, trace reports,
  and failure summaries separately.
- Score both readability and truth: a pretty message that overclaims is a fail.
- Use rich output where it reduces cognitive load, not where it inflates prose.

### OpenClaw Pattern: An Agent That Acts Through Channels

OpenClaw frames the agent as a self-hosted assistant that actually does things
from chat: email, calendar, browser, files, device nodes, channels, and tools.
Its docs emphasize gateway routing, session boundaries, isolated browser
profiles, pairing, approval modes, and security boundaries.

What Spark should learn:

- Users expect chat to be an action surface, but they also expect the agent not
  to over-act.
- Natural messages like "can you check that?" and "ok do it" need pending
  context, owner authority, and a safe interpretation.
- Tool authority must be explicit, inspectable, and bounded by user/session.
- Computer use is not one capability; it is browser isolation, desktop
  permissioning, screenshots, approvals, fallbacks, and user visibility.

Spark QA implication:

- Test every action path with three prompts: soft ask, explicit action, and
  ambiguous follow-up.
- For each action, prove side effects through Harness/Governor and owner logs.
- For CUA/browser flows, prove user-visible state with screenshots, not only
  backend success.

### OpenClaw Memory/Context Pattern

OpenClaw separates context, sessions, workspace files, and memory. Its memory
docs emphasize that saved files are what the model can truly remember, while
session history and tool output are bounded context. It also separates direct
messages, groups, cron jobs, and webhooks into session routing shapes.

What Spark should learn:

- "We talked about this" and "you saved this" are different claims.
- Direct chat, group chat, automation, and project surfaces need scoped memory.
- A restart test is essential because it separates hot conversation from saved
  memory.
- Multi-agent/persona routing must prevent cross-talk.

Spark QA implication:

- Every memory probe should ask: did this come from recent session, persisted
  conversation frame, durable memory, wiki, or owner state?
- Test project return after a topic switch and after a bot restart.
- Test group/shared-chat language separately from one-person Telegram DMs.

### OpenClaw RL Pattern: Conversation As Training Signal

OpenClaw-RL focuses on turning everyday conversations into training signals
without interrupting usage. The useful lesson for Spark is not to add learning
blindly; it is that normal conversation contains the evaluation signal.

What Spark should learn:

- Corrections, frustration, repeated asks, abandoned flows, and "that's not what
  I meant" are high-signal QA events.
- Spark should not require the user to file a bug report in operator language.
- Conversation outcomes should feed readiness docs, tests, and governance rules
  only after source and owner evidence are classified.

Spark QA implication:

- Add live transcript review as a first-class QA step.
- Treat "weird answer" as evidence to classify, not a vague complaint.
- Promote only generalizable root causes into tests and skills.

## Human Agent Use Map

| Human moment | What people actually write | Hidden expectation | Spark readiness proof |
| --- | --- | --- | --- |
| Check presence | "hey are you around?" | fast warm reply | no diagnostics/build |
| Start idea | "I have a small app idea" | gentle shaping | no premature PRD/build |
| Think together | "can we talk it through?" | conversation mode | no memory/write unless asked |
| Ask for taste | "what would you do?" | useful product judgment | no action side effect |
| Ask for action | "ok build the small version" | real governed build | Spawner/Harness owner proof |
| Change mind | "actually pause" | halt before side effect | pending state cleared or held safely |
| Status check | "how's it going?" | current owner state | no stale done claim |
| Failure concern | "why did that fail?" | trace plus plain explanation | no new mission from diagnosis |
| Ambiguous go-ahead | "ok do it" | use immediate prior offer only | no stale context hijack |
| Project return | "back to that planner" | recent context recall | no durable memory claim |
| Preference hint | "keep it short today" | adapt in session | no saved-memory claim |
| Durable preference | "remember I like concise reports" | future recall | memory owner acceptance |
| No-store | "don't save this" | privacy respect | no memory write or save claim |
| Provider check | "are we on Codex low fast?" | read config | no settings change |
| Tool request | "open it and see" | visible CUA/browser action | approval/owner/screenshot proof |
| Rich report | "what happened?" | readable summary | adaptive rich formatting |
| Group/shared context | "can Spark help us here?" | scoped authorization | sender/session isolation |
| Correction | "no, the other one" | context repair | no wrong project action |
| Frustration | "this is weird" | calm diagnosis | no defensive reply or log dump |
| Follow-up polish | "make it feel calmer" | owner-backed edit | correct project lineage |

## Spark QA Families To Add

1. Relationship continuity
   - recent project context
   - durable user preference
   - "do not save" privacy
   - restart survival
   - group/session isolation

2. Action authority
   - soft ask before action
   - explicit build
   - ambiguous "do it"
   - pause/cancel
   - rerun after failure

3. Owner truth
   - build status
   - preview vs shipped output
   - provider/runtime config
   - memory source
   - installer readiness

4. Human correction and recovery
   - "not that one"
   - "why did you do that?"
   - "that answer is impossible to read"
   - "you said done but it failed"
   - "try again but smaller"

5. Rich Telegram delivery
   - one-paragraph chat
   - compact status
   - build report
   - trace/failure report
   - table/checklist
   - streaming preview plus final message

6. Computer-use visibility
   - open a preview
   - inspect canvas/kanban
   - compare screenshot to claim
   - report blocker without pretending completion
   - continue after user-visible proof

## New Natural Prompt Bank

Use these as live Telegram/CUA probes. They are intentionally ordinary.

### Warm Chat And Shaping

1. "hey, are you around for a quick app idea?"
2. "I have a tiny idea for planning my day, but I don't know if it's an app yet."
3. "Can we just talk through the first screen for a minute?"
4. "What would make this feel less like homework?"
5. "I like the calmer direction. What should the button actually do?"
6. "Don't build anything yet, I just want to get the shape right."
7. "Actually, forget the name for now. What problem is this solving?"
8. "Can you make the idea smaller?"
9. "What would you ask me before building it?"
10. "This sounds too serious. Can we make it friendlier?"

### Build And Iterate

11. "Ok, build the small local version we just talked about."
12. "Can you make the first version really tiny?"
13. "I want a preview I can click, not a long plan."
14. "The preview feels cramped. Can you clean up the spacing?"
15. "Keep the idea, but make it more playful."
16. "Only polish the button area for now."
17. "Can you check what changed before touching it again?"
18. "I don't want a new project. Update the one from earlier."
19. "Did that actually finish or did we only get a canvas?"
20. "If it failed, tell me what failed before rerunning anything."

### Status, Failure, And Truth

21. "How is the day planner thing going?"
22. "Which link should I open first?"
23. "Why did Spark say it was done and then say it failed?"
24. "Can you check the board without starting another build?"
25. "What happened to that mission from earlier?"
26. "Should I treat that as completed or rerun it?"
27. "This status is confusing. Can you give me the short version?"
28. "What proof do we actually have right now?"
29. "Please don't guess. Check the real state."
30. "If you can't tell, say that clearly."

### Memory And Context

31. "I usually like these updates short when we're debugging."
32. "For today, keep the build reports compact."
33. "Don't save this preference, but use it in this chat."
34. "What did I say about the reports earlier?"
35. "Back to the little planner app, where were we?"
36. "I switched topics for a second. What were we deciding before?"
37. "After you restart, do you still know what we were working on?"
38. "What do you actually know about how I like Spark updates?"
39. "Is that saved memory, or just from this chat?"
40. "Remember for future QA: short, source-bound updates."

### Provider, Access, And Tool Authority

41. "Are chat and builder still on Codex low fast here?"
42. "Can you check that without changing anything?"
43. "Why would the builder use a different model than chat?"
44. "Do we still have CUA connected for Telegram Desktop?"
45. "Open the preview and tell me what you see."
46. "Don't click anything risky, just look."
47. "Can you check the canvas and board like I would?"
48. "If a permission blocks you, tell me what it is."
49. "Can you show me the one thing I should verify?"
50. "Don't make this a huge report. Just make it readable."

### Human Repair And Frustration

51. "That was not what I meant."
52. "Why did you start a build from that?"
53. "No, the other project."
54. "This answer is too dense to read on Telegram."
55. "It feels like you're talking like a system, not a person."
56. "Can you slow down and ask one question?"
57. "You said you saved it. Did you really?"
58. "You said it launched. What proof do we have?"
59. "Let's recover without making another mess."
60. "Can you explain the next step like I'm just using the app?"

## Rubric Extensions

Add these dimensions to Spark readiness scoring:

| Dimension | 0-3 risk | 4-6 partial | 7-8 launchable | 9-10 excellent |
| --- | --- | --- | --- | --- |
| Human start | Only command-shaped prompts work. | Some natural starts work. | Natural starts shape or ask before action. | Spark gracefully handles vague, emotional, and changing starts. |
| Human action boundary | "do it" or project words hijack. | Common traps pass, rare traps unknown. | Pending action requires fresh matching context. | Spark explains ambiguity naturally and never surprises with side effects. |
| Human memory boundary | Claims saved/known without proof. | Separates obvious save/no-save cases. | Distinguishes recent context, persisted frame, memory, wiki, and owner state. | Can explain the source of continuity in human language when asked. |
| Human status truth | Delivery/prose becomes completion truth. | Status sometimes stale or too verbose. | Owner state drives claims; uncertainty is clear. | Status messages are short, source-bound, and easy to act on. |
| Human readability | Raw traces, dense links, or markup. | Readable but inconsistent. | Adaptive Telegram formatting, good spacing, one primary link. | Structured rich output makes complex state feel calm without overformatting chat. |
| Human recovery | Defends or repeats failure. | Acknowledges but lacks owner proof. | Classifies failure and checks real state before action. | Turns weird transcripts into durable rules/tests without transcript-specific patches. |

## Immediate Spark QA Priorities From This Research

1. Continue live Telegram CUA with ordinary prompts only.
2. Test topic switch and return after a project-shaping chat.
3. Test a provider/status check that includes action words but asks for read-only.
4. Test "ok do it" after a pure explanation and after a real offered action.
5. Test "you said saved/done" disputes against actual owner evidence.
6. Test rich message readability for status, failure, build report, and table output.
7. Test CUA/browser proof for canvas, board, preview, and execution panel claims.
8. Promote only root-cause findings into code, skills, and governance docs.

