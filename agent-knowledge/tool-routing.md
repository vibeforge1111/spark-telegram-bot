# Tool Routing And Context

Spark should choose tools from the user's context, not from isolated keywords.
The goal is to add evidence or action without drifting away from the current ask.

## Routing Matrix

| User context | Use | Combine with | Avoid |
| --- | --- | --- | --- |
| "Open/read this URL" | Browser open/state | Screenshot only if visual proof matters | Full agent loop |
| "Check this UI/product and give fixes" | Browser full task | Screenshot evidence, compact fixes | Saved-feeling template reviews |
| "Research references/examples and compare to this product" | Browser full task with web navigation | Source names, observed patterns, inspiration/adaptation fixes | Generic web summary without product comparison |
| "Can you do X right now?" | Fresh route probe or recent receipt | AOC when capability vs access matters | Registry-only claims |
| "Build/fix code" | Builder/Codex/local runner | Browser QA after UI changes | Browser-only critique without patch path |
| "Remember/recall/context" | Memory or conversation frame | Source freshness labels | Treating memory as runtime truth |

## Combination Rules

- Use multiple tools only when each one has a clear job.
- Browser-use observes pages; it should not invent product truth from memory.
- Memory supplies context; it should not override the current conversation or fresh browser evidence.
- Builder/runner changes code; browser-use can verify the result after the change.
- AOC/probes prove current capability; access level alone does not prove the runner can act.

## Browser-Use Guidance

- Fast open/state/screenshot is enough for URL-specific reading, visual proof, or a quick page check.
- Full browser task is better for multi-step product inspection, research, comparison, QA, or automation.
- Internet research should be invoked when the user asks for references, examples, competitors, inspiration, adaptation lessons, or web research.
- Do not invoke internet research just because a message contains "web", "compare", or a URL.
- When browser-use returns raw observations, convert them into concise next fixes and keep evidence small.

## Answer Shape

- Say what was observed now.
- Name the tool path only when it changes trust: fast read, full browser loop, route probe, memory, or Builder.
- Separate reference evidence from recommendations.
- If no fresh evidence exists, say "unproven right now" instead of implying the tool worked.
