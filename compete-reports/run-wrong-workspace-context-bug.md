# Bug: /run commands answer from Spawner UI developer context instead of user context

**Reported by:** Team Syntax Layer
**Date:** 2026-05-25
**Severity:** High

## What happened
Every /run command answers from the Spawner UI developer 
codebase context instead of the user's Spark agent context.
Two separate commands confirmed this pattern.

## Repro steps — Instance 1
1. Send: /run explain how memory works in spark
2. Spark responds: "Here's how memory works in Spark, 
   based on the codebase" describing internal Spawner UI
   architecture, not Spark's user-facing memory system

## Repro steps — Instance 2
1. Send: /run list all commands I can use
2. Spark responds with developer commands from CLAUDE.md:
   npm install, npm run dev, npm run check, npm run test:run,
   npm run build, npm run smoke:routes
3. These are Spawner UI developer commands, not Spark
   user commands like /run, /start, /diagnose, /access

## Expected behavior
/run commands should answer from the user's Spark agent 
context. "List all commands" should return Spark Telegram
commands like /run, /start, /diagnose, /access, /status.
"Explain memory" should describe the user-facing memory
system, not internal codebase architecture.

## Root cause hypothesis
The /run handler is injecting the Spawner UI workspace
as the working context for every mission, causing Claude
to answer as a developer assistant for that codebase
instead of as the user's personal Spark agent.

## Impact
Every /run command gives the wrong answer. Users asking
about their Spark setup receive developer documentation
for an internal codebase they have no access to or 
interest in. This makes /run effectively broken for
normal user queries.

## Proposed fix
Scope /run missions to the user's Spark agent context
by default, not the Spawner UI workspace. Only inject
workspace context when the user is explicitly working
on a project in that workspace.
