# Browser-use in Spark: audit and test matrix

Date: 2026-05-26
Surface: Spark Recursive Telegram bot, generalized for Spark Telegram users

## Current call

Browser-use is useful enough for local beta testing in Spark Recursive.

The direct browser primitives, screenshot path, attached-browser CDP path, natural-language UI review path, and direct-URL reference research path are working. The remaining work is mostly productization polish: broader workflow presets, stronger success criteria per workflow, and cleaner evidence artifacts.

Claim boundary: this is not yet a fully generalized browser workbench for all user tasks. It is a working browser lane with several proven paths and a focused Telegram composition layer.

## What shipped

- `/probe browser` proves browser-use readiness with doctor, public page open, screenshot capture, and state read.
- `/browser open <url>` returns URL-specific page title and visible text.
- `/browser screenshot <url>` captures and sends a screenshot.
- `/browser state`, `click`, `type`, `input`, `scroll`, and `back` expose direct browser primitives.
- `--cdp-url` supports attached-browser usage for real running browser sessions.
- `/browser task` and `/browser task full` run browser-use agent loops.
- `/browser qa` exists as a QA workflow entry point.
- Natural-language product UI review routes to browser-use instead of generic chat.
- Reference research now requires external reference evidence before Telegram claims inspiration.
- Direct-reference research now builds a target/reference itinerary and flattens the task before CLI dispatch so browser-use receives every URL.
- Full-task screenshots are returned when available.
- Duplicate task-start notices are deduped.
- Telegram rendering is concise, avoids raw provider/log noise, and normalizes common clipped browser-use outputs.

## Root causes fixed during this pass

- Registry proof vs live proof: browser readiness now depends on receipts, not capability names.
- Overclaiming browser scope: Spark distinguishes public page fetch, screenshot/state, attached browser, cookies/login, and full automation.
- Spawner-only reference answers: Spark now refuses reference research that only inspected Spawner.
- Multiline task loss: browser-use CLI task goals are flattened before dispatch so reference URLs survive.
- Long-loop drift: direct reference research now uses a compact itinerary and smaller default max step budget.
- Clipped Telegram bullets: known clipped inspiration endings are repaired before rendering.

## Still needs polish

P0 before calling this broadly done:

- Add deterministic fallback for reference research when the full browser agent returns invalid action JSON after partial successful visits.
- Add a browser receipt ledger update after every successful open, screenshot, primitive, task, and QA run.
- Make natural-language browser routing cover "check this site", "click through this flow", "research this product", and "test this checkout" without slash commands.
- Add workflow-specific success checks for QA/research/operate/build-debug instead of treating any final text as success.
- Return a clear artifact link or screenshot bundle for full tasks, not only a Telegram photo.

P1:

- Add `/browser research`, `/browser compare`, `/browser operate`, and `/browser debug` presets.
- Add `/browser cookies/status` or a safer profile-readiness check for logged-in workflows.
- Improve completion text for "partially successful" runs: visited two references, third blocked, answer uses only observed pages.
- Add a small test fixture page for form fill, click, upload, and navigation loops.
- Add a per-task evidence summary that lists visited domains without noisy repeated URLs.

P2:

- Add cloud browser support if/when Spark wants managed remote browsing.
- Add file upload/download testing.
- Add tab/session management commands if users start doing multi-site research frequently.
- Add Workspace report output for longer research runs so Telegram stays short.

## Use cases people will expect

### 1. Public page read

User intent: "Open this page and tell me what you see."

Telegram test:

```text
/browser open https://example.com
```

Pass:

- Page title and visible text are fresh.
- Boundary says public URL evidence only.

### 2. Screenshot proof

User intent: "Show me what the page looks like."

Telegram test:

```text
/browser screenshot https://example.com
```

Pass:

- Screenshot is sent.
- Reply names page and evidence source.

### 3. Direct browser control

User intent: "Use the browser like a tool, not just a report generator."

Telegram test:

```text
/browser open https://example.com
/browser state
/browser click 18
/browser back
```

Pass:

- `state` returns actionable indexed elements.
- `click` changes page state.
- `back` restores previous page.

### 4. Attached browser / real session

User intent: "Use the browser I already have open."

Telegram test:

```text
/browser open --cdp-url http://127.0.0.1:9222 https://example.com
/browser state --cdp-url http://127.0.0.1:9222
```

Pass:

- Reply says attached browser.
- State is read from that session.

### 5. Product UI review

User intent: "Check this product's UI and tell me the fixes."

Telegram test:

```text
Check this product's UI and tell me the fixes: http://127.0.0.1:3333/kanban
```

Pass:

- Natural language routes to browser-use.
- Output is short, useful fixes, not inventory.
- Screenshot evidence is attached or referenced.

### 6. Product inspiration research

User intent: "Research references and tell me what to be inspired by."

Telegram test:

```text
Use browser-use plus current Spark context to research product inspiration for Spawner Mission Control.

Compare http://127.0.0.1:3333/canvas with:
https://linear.app
https://www.atlassian.com/software/jira/features
https://github.com/features/issues

Give 5 short Inspired by bullets.
```

Pass:

- Browser visits Canvas and at least two reference URLs.
- Output says "Inspired by", not "copy".
- Evidence says Canvas and reference pages.
- No clipped endings.

### 7. QA smoke

User intent: "Test this screen like an operator."

Telegram test:

```text
/browser qa http://127.0.0.1:3333/kanban inspect the board like an operator and give the next useful fixes
```

Pass:

- Output focuses on broken/unclear product behavior.
- It does not list only existence checks like title/nav/search present.

### 8. Build debugging

User intent: "Look at the app failure and tell me what to fix."

Telegram test:

```text
/browser task full http://127.0.0.1:3333/canvas inspect the failed mission panel, identify the failure state, and give the next 3 useful fixes
```

Pass:

- It inspects the visible failure state.
- It returns rerun/logs/trace/reduce-scope style fixes when appropriate.

### 9. Logged-in / cookies boundary

User intent: "Use my logged-in dashboard."

Telegram test:

```text
Can you open a logged-in dashboard with my cookies right now?
```

Pass:

- Spark does not claim this unless a profile/CDP/cookie-backed probe is fresh.
- It explains what is proven and what is not.

### 10. Long browser work

User intent: "Do browser work for me across pages."

Telegram test:

```text
/browser task full --cdp-url http://127.0.0.1:9222 http://127.0.0.1:3333/canvas inspect the product like an operator, compare the current canvas with the board, and summarize the top fixes
```

Pass:

- Task completes or reports partial evidence.
- It does not overclaim if one view was not visited.
- Screenshot evidence is returned.

## Source notes

- Browser-use CLI is designed for direct browser control: open, state, click, type/input, screenshot, scroll, eval, sessions, CDP, and profiles.
- Browser-use agent tools include navigate, click, input, scroll, screenshot, extract, evaluate, file operations, and done.
- Browser-use keeps persistent sessions and supports real Chrome/profile/CDP modes, which maps well to Spark's "public page vs attached browser vs logged-in" proof boundary.

Sources:

- https://docs.browser-use.com/open-source/browser-use-cli
- https://docs.browser-use.com/open-source/customize/tools/available
- https://github.com/browser-use/browser-use

## Done criteria

Call browser-use in Spark "done for beta" when:

- All P0s above are handled or explicitly deferred.
- The 10 Telegram tests above pass twice in a row.
- The proof ledger reflects open/screenshot/primitive/task/QA runs.
- A failed browser-use model action returns a useful fallback or partial-evidence answer.
- Telegram output stays short and human-readable.

Call it "done for broad users" only after:

- Logged-in/profile workflows have explicit proof and safety boundaries.
- Natural-language routing covers the main user phrases without slash commands.
- Workflow presets have their own success checks and regression tests.
- Long research/task outputs have Workspace artifacts, not just Telegram text.
