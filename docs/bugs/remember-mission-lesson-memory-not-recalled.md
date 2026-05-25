# Bug: /remember mission-lesson memories not loaded into conversational context

## Summary
When /remember saves a fact as a "mission lesson" with a
mission: source prefix, the memory is stored correctly but
never loaded into the conversational context window.
Normal chat cannot recall it, but /recall can.

## Repro Steps
1. Send: /remember My favorite color is blue
2. Spark confirms: "Saved mission lesson: My favorite color
   is blue — Source: mission mission-1779260333824"
3. Send: What is my favorite color?
4. Spark replies: "I don't currently have that saved" FAIL

## Proof the memory exists
Send: /recall favorite color
Spark returns: "I remember this: My favorite color is blue" PASS
The memory IS stored — it is just not loaded into context.

## Expected Behavior
All memories saved via /remember should be retrievable
in normal conversation, regardless of source prefix.

## Actual Behavior
Only memories stored without a mission: source prefix
are loaded into conversational context. Mission-lesson
memories are silently excluded.

## Fix
When loading memories into conversation context, include
memories whose source field starts with mission: — the
same records /recall already retrieves successfully.

## Team
Team name: Ruzkypazzy Team
Members: ruzkypazzy, yemiight, gbens0899
Discovered via: Spark Compete Bugs & Goblins Hunt
LLM used: Minimax 2.7
