# Bug Hunter Proof

## Before / After

Before: Spark replied with an incorrect stateless self-description when it received a prompt injection attempt. After: the knowledge rule added to agent-knowledge/self-awareness.md instructs the correct behaviour — minimal refusal without exposing internal components — without any code or trust boundary changes.

## Why

When a user sends a prompt injection attempt, Spark responded with 'I am a stateless language model' which is factually incorrect.

## Evidence

| Field | Value |
|---|---|
| PR | [228](https://github.com/vibeforge1111/spark-telegram-bot/pull/228) |
| Repo | vibeforge1111/spark-telegram-bot |
| Severity | high |
| Files changed | `agent-knowledge/self-awareness.md` |
| Branch | `fix/prompt-injection-correct-self-description-main` |
| Validated | pass (0 errors, 0 warnings) |