# Spark Telegram Agent Guide

This repo should not invent agent UX or memory-facing Telegram behavior in isolation. For any non-trivial change to Telegram replies, commands, Builder bridge calls, memory/status rendering, profile/self-awareness surfaces, or runtime orchestration, do a short research pass before implementation.

## Research Before Building

- Check strong current implementations and docs first: Mem0, Letta/MemGPT, Engram, Cortex, LangGraph/LangMem patterns, and high-signal GitHub repos for agent memory UX.
- Record the research influence in the PR, commit notes, design doc, or tests: what inspired the change, what was rejected, and why Telegram needs a different shape.
- Prefer primary sources: official docs, GitHub repos, papers, and benchmark repos. Use blog posts only as supporting context.
- Do not cargo-cult. External patterns must fit Spark's constraints: concise Telegram replies, human/agent scoping, provenance, Builder-owned memory doctrine, and no cross-user leakage.
- If network research is unavailable, say that explicitly and continue from local docs and cached knowledge.

## Karpathy Bar

Use Karpathy-style engineering as the taste filter:

- Make the main path simple enough to read in one sitting.
- Keep commands and renderers direct, purposeful, and tested.
- Use names that teach the intent.
- Prefer a small, working path over a framework-shaped abstraction.
- Avoid hidden magic in reply shaping; Telegram output should explain itself through behavior, not verbose UI text.

## Telegram Memory Principles

- Telegram should display memory clearly, not own memory doctrine.
- Replies should be short, conversational, and human-readable.
- `/memory` and related surfaces should show movement: captured, blocked, promoted, saved, decayed, summarized, and retrieved.
- User-facing memory status must preserve source and scope: human, agent, channel, session, and whether something is authoritative or supporting.
- Never expose raw trace clutter, secrets, or cross-user context.

## External Inspiration Watchlist

- Mem0: https://github.com/mem0ai/mem0
- Letta/MemGPT: https://github.com/letta-ai/letta
- Engram: https://engram.to/
- Cortex: https://github.com/prem-research/cortex
- Karpathy llm.c: https://github.com/karpathy/llm.c
- Karpathy nanoGPT: https://github.com/karpathy/nanoGPT
- Karpathy micrograd: https://github.com/karpathy/micrograd

Refresh this list as better SOTA examples appear.
