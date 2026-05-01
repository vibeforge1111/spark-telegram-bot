import assert from 'node:assert/strict';
import {
  compactColdMemoryQuery,
  formatConversationColdMemoryContext,
  formatDiagnosticsScanReply,
  formatSelfAwarenessReply
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
    natural_language_routes: [
      "Ask: 'Spark, test the browser route now' to turn browser availability into last-success evidence."
    ]
  });

  assert.match(reply, /Spark self-awareness/);
  assert.match(reply, /Where I lack/);
  assert.match(reply, /How I can improve/);
  assert.match(reply, /LLM wiki/);
  assert.match(reply, /Project knowledge first: yes/);
  assert.match(reply, /test the browser route now/);
  assert.match(reply, /confident to attempt work through the right route/);
});
