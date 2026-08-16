# Bug: /run check setup errors scans wrong scope instead of Spark health

**Reported by:** Team Syntax Layer
**Date:** 2026-05-25
**Severity:** High

## What happened
Running "/run check if there are any errors in my setup" caused
Spark to scan SvelteKit code transcripts and bash command patterns
instead of checking the Spark installation health. It also
revealed that .claude/settings.json does not exist after setup.

## Repro steps
1. Complete fresh Spark install
2. Send: /run check if there are any errors in my setup
3. Spark scans SvelteKit transcripts and bash patterns
4. Returns: "The .claude/settings.json doesn't exist yet"
5. Never actually checks Spark's own health or configuration

## Actual response
"The .claude/settings.json doesn't exist yet, and creating
the .claude directory requires your approval. Transcript scan
complete. Only one command appeared frequently enough to
allowlist: Bash(npm run check) | 4 | SvelteKit svelte-check"

## Expected behavior
The command should check Spark's own installation health:
- Are all Spark services running?
- Is the LLM provider connected?
- Is Telegram bot responding?
- Is memory initialized?
- Are there any missing config files in ~/.spark/?

## Impact
Users who suspect something is wrong with their Spark setup
have no reliable way to diagnose it. The setup check command
runs in completely the wrong context and gives misleading output.

## Proposed fix
The setup check /run command should call spark verify internally
and return a human-readable health summary of Spark services,
not scan the working directory codebase.
