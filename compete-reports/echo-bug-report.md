# Bug: Spark echoes user messages instead of responding

**Reported by:** Team Syntax Layer
**Date:** 2026-05-24

## What happened
When a long context message was sent to the Spark Telegram bot,
it echoed the entire message back word for word instead of 
processing it and responding intelligently.

## Repro steps
1. Open your Spark Telegram bot
2. Send a long context/instruction message
3. Bot replies with the exact same message instead of acknowledging it

## Expected behavior
Spark should parse the message, acknowledge the context,
and confirm it understood the instructions.

## Before proof
Bot replied with exact copy of input message.

## After fix
Bot should reply: "Got it, compete context loaded. Ready to hunt bugs."
