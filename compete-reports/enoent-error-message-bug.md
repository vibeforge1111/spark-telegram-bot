# Bug: spawn claude ENOENT gives no actionable fix instructions

**Reported by:** Team Syntax Layer
**Date:** 2026-05-24

## What happened
When Claude Code is installed via nvm but not in Spark's PATH,
the Telegram bot shows a generic ENOENT error with no instructions
on how to fix it. The user has no idea what to do next.

## Repro steps
1. Install Claude Code via npm using nvm
   (installs to ~/.nvm/versions/node/vX/bin/claude)
2. Configure Spark to use Anthropic claude_oauth provider
3. Start Spark and send any message to the Telegram bot
4. Observe error: "spawn claude ENOENT" with no fix instructions

## Actual error message shown
"Spark is missing a dependency or command it needs.
Reason: spawn claude ENOENT
Check now: Run /diagnose so Spark can check the active chat provider."

## Expected behavior
The error should detect that claude is installed but outside PATH
and show the exact fix command. Example:
"Claude found at ~/.nvm/versions/node/v18.20.8/bin/claude
but is not in Spark PATH. Fix: run
echo 'export PATH=~/.nvm/versions/node/v18.20.8/bin:$PATH' 
>> ~/.spark/env then restart Spark."

## Fix applied by user
echo 'export PATH="/Users/cyprian/.nvm/versions/node/v18.20.8/bin:$PATH"' 
>> ~/.spark/env
~/.spark/bin/spark stop
~/.spark/bin/spark start

## After fix
Spark connected successfully and Claude responded in Telegram.

## Impact
Every user who installs Claude Code via nvm will hit this error
with no way to fix it without external help.
