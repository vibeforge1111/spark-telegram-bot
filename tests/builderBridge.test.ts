import assert from 'node:assert/strict';
import {
  compactColdMemoryQuery,
  formatConversationColdMemoryContext,
  formatDiagnosticsScanReply,
  formatMemoryDashboardReply,
  formatSelfAwarenessReply,
  formatWikiAnswerReply,
  formatWikiInventoryReply,
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
  assert.match(reply, /Where I still lack/);
  assert.match(reply, /What I should improve next/);
  assert.match(reply, /Knowledge notes/);
  assert.doesNotMatch(reply, /Project knowledge first: yes/);
  assert.match(reply, /test the browser route now/);
  assert.match(reply, /name missing evidence/);
  assert.equal(reply.length < 1800, true);
});

test('formats memory dashboard movement as concise Telegram report', () => {
  const reply = formatMemoryDashboardReply({
    scope: {
      human_id: 'human:telegram:111',
      agent_id: 'agent:human:telegram:111'
    },
    counts: {
      captured: 3,
      blocked: 1,
      promoted: 2,
      saved: 2,
      decayed: 1,
      summarized: 1,
      retrieved: 4
    },
    human_view: [
      {
        movement: 'captured',
        line: 'Captured profile.current_focus from Telegram: persistent conversational memory.'
      },
      {
        movement: 'promoted',
        line: 'Promoted profile.current_focus into current state.'
      }
    ],
    recent_blockers: [
      {
        predicate: 'profile.secret',
        reason: 'salience_secret_like_material'
      }
    ]
  });

  assert.match(reply, /Spark memory movement/);
  assert.match(reply, /Scope: this Telegram user/);
  assert.match(reply, /captured: 3/);
  assert.match(reply, /retrieved: 4/);
  assert.match(reply, /Recent trace/);
  assert.match(reply, /Blocked writes/);
  assert.match(reply, /profile\.secret: salience_secret_like_material/);
  assert.match(reply, /not a promise/);
  assert.equal(reply.length < 1200, true);
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
    missing_live_verification: [
      'Run `spark-intelligence self status --refresh-wiki --json` for current truth.'
    ]
  });

  assert.match(reply, /Spark LLM wiki answer/);
  assert.match(reply, /wiki_backed_supporting_context \(2 wiki hits\)/);
  assert.match(reply, /system\/tracing-and-observability-map\.md/);
  assert.match(reply, /Still needs live verification/);
});
