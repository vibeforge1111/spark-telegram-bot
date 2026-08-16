# Bug: /run command asks clarifying questions instead of executing

**Reported by:** Team Syntax Layer
**Date:** 2026-05-25
**Severity:** Medium

## What happened
The /run command is designed to execute tasks directly.
When sent "/run create a simple hello world python script",
Spark started a conversation asking clarifying questions
instead of just creating the script.

## Repro steps
1. Send: /run create a simple hello world python script
2. Spark responds: "I can turn this into Simple Hello World 
   Python Script. Say go to start, or steer one thing first: 
   Should the greeting be personalized to a name or always 
   the same?"

## Expected behavior
The /run command needs to execute tasks 
Immediately and return the output without
Without stopping. For completely unambiguous requests
like a "hello word" scripts, the bot should just
generate print("Hello, World!) and finish the
job. Forcing the user through a back and forth 
Q&A completely breaks the fluid workflow of 
the /run prefix

## Impact
Users who use /run expect immediate execution. If /run behaves
like a chat command and asks follow-up questions, it defeats
the purpose of the /run prefix entirely.

## Proposed fix
For unambiguous /run tasks, execute immediately with sensible
defaults. Only ask clarifying questions for genuinely ambiguous
requests. Add a --no-clarify flag option for users who always
want immediate execution.
