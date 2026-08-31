# Bug: /run who am I exposes user email address in plain text

**Reported by:** Team Syntax Layer
**Date:** 2026-05-24
**Severity:** High — Privacy/Security

## What happened
Running `/run who am I` caused Spark to display the user's private 
email address (from Claude Code sign-in) in plain text in the 
Telegram chat without any warning or consent.

## Repro steps
1. Configure Spark with Anthropic Claude sign-in (claude_oauth)
2. Open Telegram bot
3. Send: /run who am I
4. Observe full email address displayed in response

## Actual response (redacted)
"No prior memories on file yet. Based on what I can see 
from the environment:
- Username: [username]
- Email: [REDACTED - email exposed here]
- Skill tier: PRO
- Working directory: local file"

## Expected behavior
Spark should never display the user's email address or any 
personal identity information in chat responses without 
explicit user consent. At minimum, the email should be 
masked or omitted entirely from Telegram responses.

## Impact
Any user who runs this command will have their private email
address exposed in their Telegram chat history, which may be
visible to others who have access to their device.

## Proposed fix
Remove email from the environment context passed to the LLM
for Telegram responses, or mask it (e.g. c*****@gmail.com)
before displaying in chat.
