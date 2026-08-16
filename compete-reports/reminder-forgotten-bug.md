# Bug: Reminder confirmed as set but immediately forgotten

**Reported by:** Team Syntax Layer
**Date:** 2026-05-25
**Severity:** High

## What happened
Spark confirmed setting a reminder, then when asked to show
reminders just 1 minute later, reported no reminders exist.

## Repro steps
1. Send: /run set a reminder for tomorrow at 9am
2. Spark confirms: "Reminder set for Tuesday May 26 at 9:00 AM"
3. Send: /run show me my reminders
4. Spark responds: "No memories or reminders have been saved 
   yet for this project"

## Actual responses
Step 2 response: "Reminder set for tomorrow, Tuesday May 26 
at 9:00 AM. It will notify you in this Claude session"
Step 4 response: "No memories or reminders have been saved 
yet for this project. If you'd like me to remember something 
going forward, just tell me and I'll save it."

## Expected behavior
After confirming a reminder is set, Spark should be able to
list that reminder when asked. Confirming an action that
immediately has no effect is misleading and confusing.

## Impact
Users cannot trust Spark's confirmations. If Spark says
something is done but it isn't saved, all task confirmations
become unreliable.

## Proposed fix
Either persist reminders to the memory system so they survive
between /run calls, or clearly state upfront that reminders
are session-only and will not be retrievable after the current
/run context ends.
