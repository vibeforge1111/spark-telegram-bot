export interface LegacyPromptSurfaceRef {
  id: string;
  label: string;
  patterns: string[];
}

export const LEGACY_PROMPT_SURFACE_BLOCKED_REFS: LegacyPromptSurfaceRef[] = [
  {
    id: 'legacy_nl_catalog',
    label: 'legacy natural-language live catalog',
    patterns: ['ops/natural-language-live-commands.json', 'natural-language-live-commands.json', 'natural language live catalog']
  },
  {
    id: 'genesis_telegram_100',
    label: 'Genesis live Telegram 100 benchmark',
    patterns: ['ops/genesis-live-telegram-100.json', 'genesis-live-telegram-100.json', 'Genesis live Telegram 100 benchmark']
  },
  {
    id: 'legacy_nl_plan',
    label: 'legacy natural-language live test plan',
    patterns: ['ops/NATURAL_LANGUAGE_LIVE_TEST_PLAN.md', 'NATURAL_LANGUAGE_LIVE_TEST_PLAN.md', 'natural-language live test plan']
  },
  {
    id: 'route_boundary_harness',
    label: 'legacy route-boundary harness',
    patterns: ['ops/routeBoundaryHandlerHarness.ts', 'routeBoundaryHandlerHarness.ts']
  },
  {
    id: 'live_nl_command_suite',
    label: 'legacy live NL command suite',
    patterns: ['ops/liveNlCommandSuite.ts', 'liveNlCommandSuite.ts']
  },
  {
    id: 'live_nl_verdict_report',
    label: 'legacy live NL verdict report',
    patterns: ['ops/liveNlVerdictReport.ts', 'liveNlVerdictReport.ts']
  },
  {
    id: 'natural_route_replay',
    label: 'legacy natural route replay helper',
    patterns: ['ops/naturalRouteReplay.ts', 'naturalRouteReplay.ts']
  },
  {
    id: 'context_window_plan',
    label: 'legacy context-window live test plan',
    patterns: ['ops/CONTEXT_WINDOW_LIVE_TEST_PLAN.md', 'CONTEXT_WINDOW_LIVE_TEST_PLAN.md', 'context-window live test plan']
  },
  {
    id: 'realtime_conversation_smoke',
    label: 'legacy realtime conversation smoke source',
    patterns: ['ops/realtime-conversation-smoke.json', 'realtime-conversation-smoke.json']
  },
  {
    id: 'turnintent_agents_adoption',
    label: 'superseded TurnIntent adoption history',
    patterns: ['docs/TURNINTENT_AGENTS_ADOPTION.md', 'TURNINTENT_AGENTS_ADOPTION.md', 'TurnIntent adoption history']
  },
  {
    id: 'launch_conversation_qa',
    label: 'launch conversation QA history',
    patterns: ['docs/LAUNCH_CONVERSATION_QA_2026-05-08.md', 'LAUNCH_CONVERSATION_QA_2026-05-08.md', 'launch conversation QA history']
  },
  {
    id: 'startup_bench_showcase',
    label: 'startup bench showcase runbook',
    patterns: ['docs/SPARK_QA_STARTUP_BENCH_SHOWCASE_RUNBOOK_2026-05-26.md', 'SPARK_QA_STARTUP_BENCH_SHOWCASE_RUNBOOK_2026-05-26.md', 'startup bench showcase runbook']
  },
  {
    id: 'codex_handoffs',
    label: 'historical Codex handoff folder',
    patterns: ['docs/codex-handoffs/', 'codex-handoffs/']
  }
];
