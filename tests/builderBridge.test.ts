import assert from 'node:assert/strict';
import {
  compactColdMemoryQuery,
  formatConversationColdMemoryContext,
  formatDiagnosticsScanReply,
  formatSelfImprovementPlanReply,
  formatSelfAwarenessReply,
  formatWikiAnswerReply,
  formatWikiInventoryReply,
  formatWikiPromotionReply,
  formatWikiQueryReply,
  formatWikiStatusReply
} from '../src/builderBridge';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('formats diagnostics scan replies without emojis while preserving sections', () => {
  const reply = formatDiagnosticsScanReply({
    scanned_line_count: 1062,
    failure_line_count: 0,
    findings: [],
    sources: Array.from({ length: 49 }, (_, index) => `source-${index}`),
    service_checks: Array.from({ length: 11 }, () => ({ status: 'ok' })),
    counts_by_subsystem: {},
    counts_by_failure_class: {},
    markdown_path: 'C:\\Users\\USER\\.spark\\state\\spark-intelligence\\diagnostics\\spark-diagnostic.md'
  });

  assert.equal(
    reply,
    [
      'Diagnostics scan complete',
      '',
      'Log scan',
      '- Scanned: 1062 lines from 49 sources',
      '- Failures: 0',
      '- Findings: 0',
      '',
      'Connector health',
      '- ok: 11',
      '',
      'Subsystems',
      '- none',
      '',
      'Failure classes',
      '- none',
      '',
      'Markdown note attached below.'
    ].join('\n')
  );
  assert.doesNotMatch(reply, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

test('compacts large cold memory queries before invoking Builder memory', () => {
  const query = compactColdMemoryQuery(`Build this project.\n\n${'feature '.repeat(500)}`, 120);

  assert.ok(query.length <= 120);
  assert.match(query, /\[truncated\]$/);
  assert.doesNotMatch(query, /\n/);
});

test('formats authoritative cold memory context for prompt injection', () => {
  const result = formatConversationColdMemoryContext({
    context_packet: {
      sections: [
        {
          section: 'recent_conversation',
          items: [
            {
              lane: 'recent_conversation',
              source_class: 'recent_conversation',
              predicate: 'conversation.focus',
              text: 'The user was choosing between access level 3 and level 4.'
            }
          ]
        }
      ]
    }
  });

  assert.equal(result.sourceCount, 1);
  assert.match(result.contextText, /\[Spark Cold Memory Context\]/);
  assert.match(result.contextText, /recent_conversation\/conversation\.focus/);
  assert.match(result.contextText, /access level 3 and level 4/);
});

test('filters wiki diagnostic packets from conversational cold memory', () => {
  const formatted = formatConversationColdMemoryContext({
    context_packet: {
      sections: [
        {
          section: 'compiled_project_knowledge',
          items: [
            {
              lane: 'evidence',
              source_class: 'evidence',
              predicate: 'raw_turn',
              text: 'User prefers compact Telegram progress updates.'
            },
            {
              lane: 'wiki_packets',
              source_class: 'obsidian_llm_wiki_packets',
              predicate: 'knowledge.packet',
              text: 'Spark Diagnostic Report 2026-04-27'
            }
          ]
        }
      ]
    }
  });

  assert.equal(formatted.sourceCount, 1);
  assert.match(formatted.contextText, /compact Telegram progress updates/);
  assert.doesNotMatch(formatted.contextText, /wiki_packets|Diagnostic Report/);
});

test('filters stale operational failures from conversational cold memory', () => {
  const formatted = formatConversationColdMemoryContext({
    context_packet: {
      sections: [
        {
          section: 'recent_conversation',
          items: [
            {
              lane: 'recent_conversation',
              source_class: 'recent_conversation',
              predicate: 'raw_turn',
              text: 'Spark could not reach the Builder memory path right now. Reason: Command failed: C:\\Python313\\python.exe -c import runpy, sys; runpy.run_module("spark_intelligence.cli", run_name="main")'
            },
            {
              lane: 'evidence',
              source_class: 'evidence',
              predicate: 'memory.work',
              text: 'We were improving source-aware episodic recall and testing current versus supporting context.'
            }
          ]
        }
      ]
    }
  });

  assert.equal(formatted.sourceCount, 1);
  assert.match(formatted.contextText, /source-aware episodic recall/);
  assert.doesNotMatch(formatted.contextText, /Builder memory path|Command failed|runpy/);
});

test('keeps cold memory prompt context bounded and source counted', () => {
  const result = formatConversationColdMemoryContext({
    context_packet: {
      sections: [
        {
          section: 'recent_conversation',
          items: Array.from({ length: 8 }, (_, index) => ({
            lane: 'recent_conversation',
            source_class: 'recent_conversation',
            predicate: `fact.${index}`,
            text: `Important remembered context ${index}. ${'detail '.repeat(120)}`
          }))
        }
      ]
    }
  }, 1200);

  assert.equal(result.sourceCount > 0, true);
  assert.equal(result.contextText.length <= 1300, true);
  assert.match(result.contextText, /\[Spark Cold Memory Context\]/);
});

test('formats self-awareness payload as actionable Telegram report', () => {
  const reply = formatSelfAwarenessReply({
    workspace_id: 'default',
    generated_at: '2026-05-01T10:00:00Z',
    observed_now: [
      { claim: 'Spark Intelligence Builder is visible in the Builder registry with status=ready.' }
    ],
    recently_verified: [
      { claim: 'Recent tool_result_received: researcher_advisory via startup-yc status=succeeded.' }
    ],
    capability_evidence: [
      {
        capability_key: 'startup-yc',
        last_success_at: '2026-05-01T10:00:01Z',
        route_latency_ms: 432,
        eval_coverage_status: 'observed',
        evidence_count: 2
      },
      {
        capability_key: 'browser_search',
        last_failure_at: '2026-05-01T10:00:02Z',
        last_failure_reason: 'timeout',
        evidence_count: 1
      }
    ],
    lacks: [
      { claim: 'Registry visibility does not prove a chip, browser route, provider, or workflow succeeded this turn.' },
      { claim: 'Natural-language invocability is only real when a user phrase maps to a route that exists.' }
    ],
    improvement_options: [
      { claim: 'Add per-capability last_success_at, last_failure_reason, and eval coverage fields.' }
    ],
    wiki_refresh: {
      generated_file_count: 4,
      authority: 'supporting_not_authoritative'
    },
    wiki_context: {
      wiki_status: 'supported',
      wiki_record_count: 3,
      project_knowledge_first: true
    },
    style_lens: {
      persona_summary: 'warm, curious, and direct without turning into a status page',
      style_sentence: 'direct, warm, and fast-moving, while staying evidence-first',
      behavioral_rules: ['keep evidence visible', 'sound conversational'],
      user_deltas_applied: true
    },
    source_ledger: [
      {
        source: 'context_capsule',
        source_counts: {
          current_state: 2,
          task_recovery: 3,
          pending_tasks: 1,
          recent_conversation: 2
        }
      }
    ],
    natural_language_routes: [
      "Ask: 'Spark, test the browser route now' to turn browser availability into last-success evidence."
    ]
  });

  assert.match(reply, /Spark self-awareness/);
  assert.match(reply, /Short version/);
  assert.match(reply, /How I am tuned for you/);
  assert.match(reply, /warm, curious, and direct/);
  assert.match(reply, /Tone: direct, warm, and fast-moving/);
  assert.match(reply, /keeping the evidence visible/);
  assert.match(reply, /Memory continuity/);
  assert.match(reply, /current state 2, task recovery 3, pending tasks 1, recent turns 2/);
  assert.match(reply, /Current-state facts win/);
  assert.match(reply, /Where I still lack/);
  assert.match(reply, /Capability evidence/);
  assert.match(reply, /startup-yc: last success 2026-05-01T10:00:01Z \(432ms; eval=observed\)/);
  assert.match(reply, /browser_search: last failure 2026-05-01T10:00:02Z \(timeout\)/);
  assert.match(reply, /What I should improve next/);
  assert.match(reply, /Knowledge notes/);
  assert.doesNotMatch(reply, /Project knowledge first: yes/);
  assert.match(reply, /test the browser route now/);
  assert.match(reply, /name missing evidence/);
  assert.equal(reply.length < 1800, true);
});

test('formats memory-lack self-awareness as memory-specific conversation', () => {
  const reply = formatSelfAwarenessReply({
    current_message: 'Where does your memory still lack right now, and how would we improve it?',
    source_ledger: [
      {
        source: 'context_capsule',
        source_counts: {
          current_state: 5,
          task_recovery: 2,
          episodic_recall: 4,
          recent_conversation: 1
        }
      },
      {
        source: 'memory_dashboard_movement',
        movement_counts: {
          captured: 3,
          blocked: 1,
          promoted: 2,
          saved: 3,
          decayed: 1,
          summarized: 2,
          retrieved: 4
        }
      }
    ],
    recently_verified: [
      { claim: 'Capability memory_open_recall_query last succeeded at 2026-05-02 10:02:52.' }
    ],
    lacks: [
      { claim: "Spark Browser is not fully healthy or available: status=missing. Main limit: Chip 'spark-browser' is not attached in this workspace." }
    ]
  });

  assert.match(reply, /Memory self-awareness/);
  assert.match(reply, /choosing the right memory layer/);
  assert.match(reply, /Current-state memory is present \(5 signals\)/);
  assert.match(reply, /memory_open_recall_query/);
  assert.match(reply, /supporting context \(episodic 4, task recovery 2, recent turns 1\)/);
  assert.match(reply, /movement trace evidence: captured=3, blocked=1, promoted=2/);
  assert.doesNotMatch(reply, /Spark Browser/);
  assert.equal(reply.length < 1300, true);
});

test('formats self-awareness memory movement as observability evidence', () => {
  const reply = formatSelfAwarenessReply({
    current_message: 'What do you know about yourself?',
    memory_movement: {
      status: 'supported',
      authority: 'observability_non_authoritative',
      movement_counts: {
        captured: 2,
        saved: 2,
        summarized: 1,
        retrieved: 3,
        selected: 1
      }
    }
  });

  assert.match(reply, /Memory movement/);
  assert.match(reply, /Trace: captured=2, saved=2, summarized=1, retrieved=3, selected=1/);
  assert.match(reply, /observability evidence, not instructions/);
});

test('formats self-awareness improvement questions conversationally instead of as a plan dump', () => {
  const reply = formatSelfAwarenessReply({
    current_message: 'Can you improve where you lack in self-awareness?',
    source_ledger: [
      {
        source: 'context_capsule',
        source_counts: {
          current_state: 4
        }
      }
    ],
    lacks: [
      { claim: 'Natural-language invocability is only real when a user phrase maps to a route that exists, is authorized, and emits traceable evidence.' }
    ],
    improvement_options: [
      { claim: "Add eval cases for 'improve this weak spot', stale status traps, and capability overclaim traps." }
    ]
  });

  assert.match(reply, /Yes - but I should not jump straight into changing myself/);
  assert.match(reply, /What I can improve first/);
  assert.match(reply, /Run a probe for the exact self-awareness route/);
  assert.match(reply, /current-state/);
  assert.doesNotMatch(reply, /Memory self-awareness/);
  assert.doesNotMatch(reply, /Priority actions/);
  assert.doesNotMatch(reply, /Mode: plan_only_probe_first/);
  assert.equal(reply.length < 1000, true);
});

test('formats self-improvement plan as probe-first actions', () => {
  const reply = formatSelfImprovementPlanReply({
    summary: 'I found 3 improvement actions from the live self-awareness capsule with supporting wiki context.',
    mode: 'plan_only_probe_first',
    evidence_level: 'live_self_snapshot_with_wiki_support',
    priority_actions: [
      {
        title: 'Track last-success evidence per capability',
        weak_spot: 'Registry visibility does not prove a chip, browser route, provider, or workflow succeeded this turn.',
        next_probe: 'Run the target route and persist last-success evidence.',
        evidence_to_collect: 'Per-capability last_success_at, last_failure_reason, latency, and exact invocation result.'
      }
    ],
    natural_language_invocations: [
      'Spark, run the safest probe for the top weak spot before changing anything.'
    ],
    wiki_sources: [
      {
        title: 'Self-Awareness Gaps',
        source_path: 'diagnostics/self-awareness-gaps.md'
      }
    ],
    guardrail: 'This is not autonomous self-modification.'
  });

  assert.match(reply, /Spark self-improvement plan/);
  assert.match(reply, /plan_only_probe_first/);
  assert.match(reply, /Priority actions/);
  assert.match(reply, /Registry visibility is not proof a route worked this turn/);
  assert.match(reply, /Say this next/);
  assert.match(reply, /diagnostics\/self-awareness-gaps\.md/);
  assert.match(reply, /not autonomous self-modification/);
});

test('formats healthy wiki status as compact operational report', () => {
  const reply = formatWikiStatusReply({
    healthy: true,
    output_dir: 'C:\\Users\\USER\\.spark-intelligence\\wiki',
    markdown_page_count: 13,
    wiki_retrieval_status: 'supported',
    wiki_record_count: 3,
    project_knowledge_first: true,
    missing_bootstrap_files: [],
    missing_system_compile_files: [],
    refreshed: true,
    refreshed_file_count: 4
  });

  assert.match(reply, /Spark LLM wiki/);
  assert.match(reply, /Health: ready/);
  assert.match(reply, /Retrieval: supported \(3 hits\)/);
  assert.match(reply, /Knowledge priority: project\/system first/);
  assert.match(reply, /Missing: none/);
  assert.match(reply, /supporting project knowledge/);
});

test('formats degraded wiki status with missing counts and warnings', () => {
  const reply = formatWikiStatusReply({
    healthy: false,
    output_dir: 'C:\\missing\\wiki',
    markdown_page_count: 0,
    wiki_retrieval_status: 'error',
    wiki_record_count: 0,
    project_knowledge_first: false,
    missing_bootstrap_files: ['index.md'],
    missing_system_compile_files: ['system/current-system-status.md'],
    warnings: ['wiki_root_missing', 'wiki_packet_retrieval_not_supported']
  });

  assert.match(reply, /Health: needs attention/);
  assert.match(reply, /Missing: 1 bootstrap, 1 generated/);
  assert.match(reply, /wiki_root_missing/);
  assert.match(reply, /wiki_packet_retrieval_not_supported/);
});

test('formats wiki inventory with page metadata and source boundary', () => {
  const reply = formatWikiInventoryReply({
    output_dir: 'C:\\Users\\USER\\.spark-intelligence\\wiki',
    page_count: 13,
    returned_page_count: 2,
    section_counts: { diagnostics: 1, system: 5, tools: 2 },
    missing_expected_files: [],
    refreshed: true,
    refreshed_file_count: 4,
    pages: [
      {
        path: 'index.md',
        title: 'Spark LLM Wiki',
        summary: 'Bootstrap navigation for Spark local LLM-readable knowledge layer.'
      },
      {
        path: 'system/current-system-status.md',
        title: 'Current System Status',
        summary: 'Generated Spark system snapshot for LLM wiki retrieval.'
      }
    ]
  });

  assert.match(reply, /Spark LLM wiki inventory/);
  assert.match(reply, /Pages: 13 total, 2 shown/);
  assert.match(reply, /Sections: diagnostics: 1, system: 5, tools: 2/);
  assert.match(reply, /index\.md: Spark LLM Wiki/);
  assert.match(reply, /live traces decide what to use/);
});

test('formats wiki query hits with source paths and authority boundary', () => {
  const reply = formatWikiQueryReply({
    query: 'recursive self-improvement loops',
    wiki_retrieval_status: 'supported',
    hit_count: 1,
    project_knowledge_first: true,
    refreshed: true,
    refreshed_file_count: 4,
    hits: [
      {
        title: 'Recursive Self-Improvement Loops',
        source_path: 'system/recursive-self-improvement-loops.md',
        text: 'Recursive improvement should preserve source-backed quality gates and avoid prompt drift.'
      }
    ]
  });

  assert.match(reply, /Spark LLM wiki query/);
  assert.match(reply, /Retrieval: supported \(1 hits\)/);
  assert.match(reply, /system\/recursive-self-improvement-loops\.md/);
  assert.match(reply, /supporting packets, not live truth/);
});

test('formats wiki answer with sources and live verification boundary', () => {
  const reply = formatWikiAnswerReply({
    question: 'How should Spark use route tracing?',
    answer: 'From the LLM wiki, use route traces as operating context and verify current runtime state before claiming health.',
    evidence_level: 'wiki_backed_supporting_context',
    hit_count: 2,
    project_knowledge_first: true,
    sources: [
      {
        title: 'Tracing and Observability Map',
        source_path: 'system/tracing-and-observability-map.md'
      }
    ],
    live_context_status: 'included',
    live_self_awareness: {
      observed_now: [
        { claim: 'Spark Intelligence Builder is visible in the Builder registry with status=ready.' }
      ],
      lacks: [
        { claim: 'Registry visibility does not prove a chip, browser route, provider, or workflow succeeded this turn.' }
      ],
      improvement_options: [
        { claim: 'Add per-capability last_success_at, last_failure_reason, and eval coverage fields.' }
      ]
    },
    missing_live_verification: [
      'Run `spark-intelligence self status --refresh-wiki --json` for current truth.'
    ]
  });

  assert.match(reply, /Spark LLM wiki answer/);
  assert.match(reply, /wiki_backed_supporting_context \(2 wiki hits\)/);
  assert.match(reply, /Live self snapshot/);
  assert.match(reply, /Builder: ready/);
  assert.match(reply, /Registry visibility is not proof a route worked this turn/);
  assert.match(reply, /system\/tracing-and-observability-map\.md/);
  assert.match(reply, /Still needs live verification/);
});

test('formats wiki improvement promotions with evidence boundary', () => {
  const reply = formatWikiPromotionReply({
    title: 'Track route confidence',
    summary: 'Spark should separate route registration from recent successful invocation.',
    promotion_status: 'candidate',
    relative_path: 'improvements/2026-05-01-track-route-confidence.md',
    authority: 'supporting_not_authoritative',
    evidence_refs: ['telegram:123:456'],
    source_refs: ['telegram:user:99'],
    next_probe: 'Run the route and persist last_success_at.',
    warnings: ['candidate_status_requires_probe_before_runtime_truth']
  });

  assert.match(reply, /Spark LLM wiki improvement note/);
  assert.match(reply, /Status: candidate/);
  assert.match(reply, /improvements\/2026-05-01-track-route-confidence\.md/);
  assert.match(reply, /telegram:123:456/);
  assert.match(reply, /supporting_not_authoritative/);
  assert.match(reply, /not live runtime truth/);
});
