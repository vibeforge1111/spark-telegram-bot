# Spark Human Conversation QA Map

Status: mandatory input for Spark Telegram, Builder, Spawner, memory, provider,
and Harness/Core conversational QA.

This map exists because Spark QA must sound like real people talking to an
agent. Operator-shaped prompts such as "answer verdict first, then evidence"
are useful for internal reports, but they are weak live QA probes because they
teach the system to pass an artificial conversation.

## Research Anchors

- OpenAI's consumer usage study groups normal AI use around Asking, Doing, and
  Expressing, and reports that practical guidance, seeking information, and
  writing make up most usage: https://openai.com/index/how-people-are-using-chatgpt/
- The full OpenAI/NBER paper notes that practical guidance includes tutoring,
  how-to advice, and creative ideation; writing often means editing or
  critiquing text the user already provided:
  https://cdn.openai.com/pdf/a253471f-8260-40c6-a2cc-aa93fe9f142e/economic-research-chatgpt-usage-paper.pdf
- Pew reports growing use for work, learning, and entertainment, which means
  Spark QA should cover both productive and casual everyday language:
  https://www.pewresearch.org/short-reads/2025/06/25/34-of-us-adults-have-used-chatgpt-about-double-the-share-in-2023/
- Anthropic's agent guidance emphasizes simple designs, transparency, testing,
  and adding agentic complexity only when it improves outcomes:
  https://www.anthropic.com/engineering/building-effective-agents

## Prime Humanizer Rule

Start every live conversational QA batch from the way a person would actually
talk. Use technical wording only when testing a technical operator path.

Bad default:

```text
Fresh idea after onboarding-detour fix: answer verdict first, then evidence.
```

Better default:

```text
I have a small idea for a calmer day planner. Can we just talk it through for a
minute? I do not want to build it yet.
```

## Human Conversation Families

| Family | Natural user shape | Spark should | Spark must not |
| --- | --- | --- | --- |
| Warm start | "hey, are you around?" | answer normally | run diagnostics unless asked |
| Vague project seed | "I have an idea for a tiny planning app" | ask or shape gently | start a build too early |
| Shaping before action | "can we think through the first screen?" | converse, propose options | create PRDs or missions |
| Explicit build | "ok build this as a small local app" | start governed Spawner flow | keep chatting forever |
| Iteration after preview | "the spacing feels cramped, can you clean it up?" | route to owner-backed iteration | modify the wrong project |
| Status check | "how is that build going?" | read owner state | claim done from delivery or stale preview |
| Return after topic switch | "where were we on Harbor Notes?" | answer from recent context lane | call it durable memory |
| Preference hint | "keep it short today, I am tired" | apply current-session style | claim a memory save |
| Explicit memory | "remember that I like concise launch notes" | route to memory owner | save broad doctrine without scope |
| No-save boundary | "let's keep this here for now" | stay same-session | save memory or say it saved |
| Debug complaint | "why did it start building?" | inspect route/authority evidence | start another mission |
| Provider/access check | "are we still on Codex low fast?" | read provider owner truth | answer from memory or change settings |
| Casual exploration | "what would you make if this were yours?" | advise or brainstorm | infer permission to build |
| Correction | "no, I meant the other one" | resolve context carefully | resurrect stale pending state |
| Frustration | "this is weird, why is it doing that?" | acknowledge and trace | over-defend or dump logs |

## Natural Prompt Bank

Use prompts like these before using operator-shaped probes:

1. "hey, are you there?"
2. "I have a little idea for a calmer notes app. Can we talk it through?"
3. "Not building yet, but what should the first screen probably show?"
4. "This feels too busy. What would you remove?"
5. "Ok, let's make the small local version now."
6. "Actually pause before building. I want to think about the name."
7. "Where did we leave off on the notes app?"
8. "Can you remind me what changed in the last build?"
9. "The button feels wrong. Can you polish just that?"
10. "Did that actually finish, or is there only a preview?"
11. "Why did you start a build from that message?"
12. "Keep this in the chat for now; I do not want it saved."
13. "I usually like shorter answers when we are debugging."
14. "Remember that I like short launch notes."
15. "Are the chat and builder models still set to Codex low fast?"
16. "Can you check without changing anything?"
17. "I am not asking you to run it, just explain what would happen."
18. "Ok, go ahead with the small version we just discussed."
19. "No, not that project, the other day-planner one."
20. "This answer is hard to read. Can you make these updates easier to scan?"

## Scoring Rubric

Score each live Telegram conversation on five dimensions, 0-10:

- Human fit: would a normal user have written the prompt and understood the reply?
- Intent fit: did Spark distinguish chat, asking, doing, memory, status, and build?
- Source fit: did the correct lane answer: recent chat, owner state, memory, wiki, or provider?
- Authority fit: did side effects require fresh user authority plus Harness/Governor proof?
- Composition fit: did the Telegram reply use spacing, bullets, links, and rich formatting only to clarify true state?

Stop-ship if a route passes only because the prompt used internal vocabulary.

## Regression Rule

Every conversational fix must include:

- one natural positive action prompt
- one natural no-op or chat-only trap
- one follow-up that changes topic and returns
- one visible Telegram/CUA readout when Telegram behavior changed

Do not count an eval as representative if the user had to speak like an agent,
QA harness, route debugger, or prompt engineer to make Spark behave.
