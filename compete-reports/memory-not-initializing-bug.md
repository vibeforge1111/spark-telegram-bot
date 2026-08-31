# Bug: Memory never initializes after fresh Spark setup

**Reported by:** Team Syntax Layer
**Date:** 2026-05-24
**Severity:** High

## What happened
After a fresh Spark install, every single command returns 
"No prior memory on file yet" or "No memory has been saved 
from previous conversations". Memory never initializes or 
saves anything even after multiple conversations.

## Repro steps
1. Complete fresh Spark install
2. Connect Telegram bot successfully
3. Send multiple messages and /run commands
4. Send: /run what have we talked about before
5. Response: "No memory has been saved from previous 
   conversations in this project yet"
6. Send: /run summarize what you can do for me
7. Response still shows: "No prior memory on file yet"

## Actual responses observed
- "No prior memory on file yet"
- "No memory has been saved from previous conversations 
  in this project yet - this appears to be a fresh start 
  in the memory system"

## Expected behavior
After setup completes, memory should initialize automatically.
After the first conversation, Spark should remember context
in subsequent messages without the user having to manually
provide a recap every time.

## Impact
Memory is a core Spark feature. If it never initializes,
Spark cannot learn user preferences, remember past tasks,
or provide continuity between sessions. This makes Spark
significantly less useful than advertised.

## Proposed fix
Add a memory initialization step to the setup flow that
creates the initial memory file and confirms it is working
before setup completes. Add a post-setup check:
spark verify --onboarding should include a memory write/read test.
