## Summary

Fix Telegram natural-language routing so concrete backend build requests are not misread as Spark health/status checks just because the requested project path or product name contains `health`.

## Gate Fields

- packet: included below as `spark-compete-hotfix-v1` JSON.
- team: Old Men Club.
- pr_author: NoRegretz.
- repo: vibeforge1111/spark-telegram-bot.
- actual_behavior: a build request for `C:\Dev\projects\telegram-health-bot` was answered with a Spark health report.
- expected_behavior: the same prompt should be routed to the build/Spawner path and should not attach live health diagnostics context.
- repro_steps: included in packet issue details below.
- before_after_proof: before and after screenshots are committed under `docs/compete-evidence`.
- tests_or_smoke: focused parser, route decision, runtime guard, E2E build-route tests, and TypeScript build passed locally.
- duplicate_notes: PR #315 is related routing work but this PR carries separate proof and coverage for the exact live `health` trigger in project path/product text, including runtime health guards and runtime truth-signal suppression.
- risk_notes: no token, provider, dependency, installer, or persistence changes; risk is limited to build-vs-health routing and covered by focused tests.
- review_claim: high impact, pr_review requested.

## Team

- name: Old Men Club
- members: NoRegretz, YenixPetnik, MileLarts
- llm_device_holder: MileLarts
- device_holder_github: https://github.com/physiofromhome
- github_accounts: physiofromhome, NoRegretz, YenixPetnik

## Safe Before/After Proof

No secrets, chat IDs, raw logs, private usernames, private repo maps, wallet material, or private scoring details are included.

Before evidence: ![Before health misroute](https://raw.githubusercontent.com/NoRegretz/spark-telegram-bot/codex/spark-compete-context-build-routing/docs/compete-evidence/telegram-health-build-before.png)

After evidence: ![After build route](https://raw.githubusercontent.com/NoRegretz/spark-telegram-bot/codex/spark-compete-context-build-routing/docs/compete-evidence/telegram-health-build-after.png)

Before: the prompt asks Spark to continue a mission and build the real Telegram backend at `C:\Dev\projects\telegram-health-bot`, but Spark answers with a live health report.

After: the same prompt is accepted as build work: `Got it. Spark is on it.` and Spark starts setting up the Telegram Group Scoring Bot planning canvas.

## Tests Or Smoke Output

- PASS `npm run build`
- PASS `npx ts-node tests\buildIntent.test.ts`
- PASS `npx ts-node tests\naturalRouteDecision.test.ts`
- PASS `npx ts-node tests\runtimeRouteGuards.test.ts`
- PASS `npx ts-node tests\buildE2E.test.ts`
- PASS installed-runtime smoke: `parseBuildIntent(...)` returned `advanced_prd`, `Telegram Health Bot`, and `C:\Dev\projects\telegram-health-bot`; runtime health guards returned false for the exact prompt.
- PASS live Telegram smoke after restart: screenshot shows the same redacted prompt/reply excerpt now routes to the build/canvas path instead of health diagnostics.

## Packet Validation

Run after the PR is created and replace `PENDING_PR_URL` with the real PR URL.

## Packet

```json
{
  "schema": "spark-compete-hotfix-v1",
  "event": "spark-compete-first-event",
  "submission_mode": "public_repo_pr",
  "submission_target_url": "PENDING_PR_URL",
  "team": {
    "name": "Old Men Club",
    "members": ["NoRegretz", "YenixPetnik", "MileLarts"],
    "llm_device_holder": "MileLarts",
    "device_holder_github": "https://github.com/physiofromhome",
    "github_accounts": ["physiofromhome", "NoRegretz", "YenixPetnik"]
  },
  "target_repo": {
    "id": "vibeforge1111/spark-telegram-bot",
    "source": "https://github.com/vibeforge1111/spark-telegram-bot",
    "owner_surface": "telegram-bot"
  },
  "issue": {
    "type": "bug",
    "severity": "high",
    "title": "Telegram build prompts containing health are misrouted to Spark health reports",
    "actual_behavior": "A Telegram prompt that asked Spark to build a real backend in C:\\Dev\\projects\\telegram-health-bot was answered with the live Spark health report instead of starting the build flow.",
    "expected_behavior": "Concrete backend/project build prompts should stay on the build route even when the project name, path, or domain contains the word health.",
    "repro_steps": [
      "Send a Telegram message: Continue mission-1780080376626, but do not make another dashboard-only prototype.",
      "Include: Build the real backend for the Telegram group scoring bot.",
      "Include a target folder: C:\\Dev\\projects\\telegram-health-bot.",
      "Observe the old behavior: Spark answers with a health report instead of accepting the build."
    ],
    "affected_workflow": "Telegram task intake for users building healthcare, health scoring, or similarly named backend projects."
  },
  "evidence": {
    "safe_links_only": true,
    "before_after_proof": "Before screenshot shows the backend build prompt containing telegram-health-bot being answered as a Spark health report. After screenshot shows the same prompt being accepted as build work and routed toward a planning canvas.",
    "links": [
      "PENDING_PR_URL",
      "https://raw.githubusercontent.com/NoRegretz/spark-telegram-bot/codex/spark-compete-context-build-routing/docs/compete-evidence/telegram-health-build-before.png",
      "https://raw.githubusercontent.com/NoRegretz/spark-telegram-bot/codex/spark-compete-context-build-routing/docs/compete-evidence/telegram-health-build-after.png"
    ],
    "forbidden": ["tokens", "browser cookies", "wallet material", "raw logs", "raw conversations", "raw memory", "private repo maps", "private scoring details", "chat IDs", "private usernames"]
  },
  "proposed_fix": {
    "approach": "Let explicit build intent win before runtime health/status handling, parse the explicit build tail after a negated prototype boundary, preserve the local target path, and suppress runtime truth/health diagnostics context for prompts that are concrete builds.",
    "files_expected": [
      "src/buildIntent.ts",
      "src/index.ts",
      "src/runtimeRouteGuards.ts",
      "tests/buildIntent.test.ts",
      "tests/naturalRouteDecision.test.ts",
      "tests/runtimeRouteGuards.test.ts",
      "tests/buildE2E.test.ts",
      "docs/compete-evidence/telegram-health-build-before.png",
      "docs/compete-evidence/telegram-health-build-after.png"
    ],
    "tests_or_smoke": "Passed npm run build, focused ts-node parser/route/guard/E2E tests, installed-runtime smoke, and live Telegram after screenshot."
  },
  "pr": {
    "branch": "codex/spark-compete-context-build-routing",
    "title_prefix": "[spark-compete]",
    "author_github": "NoRegretz",
    "body_must_include": ["packet", "team", "pr_author", "repo", "actual_behavior", "expected_behavior", "repro_steps", "before_after_proof", "tests_or_smoke", "duplicate_notes", "risk_notes", "review_claim"],
    "url": "PENDING_PR_URL"
  },
  "review_claim": {
    "impact_claim": "high",
    "evidence_types": ["before_screenshot", "after_screenshot", "redacted_conversation_excerpt", "failing_test", "passing_test", "smoke_test"],
    "duplicate_notes": "PR #315 is related but separate: this PR targets the exact live health-word false route, adds explicit runtime health guard regression coverage, suppresses runtime truth signals for concrete builds, and includes before/after proof from the telegram-health-bot prompt.",
    "risk_notes": "Low dependency and operational risk: no dependencies, secrets, provider setup, installer behavior, or persistence schema changes. Regression risk is bounded to routing precedence for concrete build prompts and is covered by focused tests.",
    "review_state_requested": "pr_review"
  }
}
```
