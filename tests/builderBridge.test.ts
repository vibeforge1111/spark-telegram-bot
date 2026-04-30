import assert from 'node:assert/strict';
import { formatConversationColdMemoryContext, formatDiagnosticsScanReply } from '../src/builderBridge';

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

test('does not inject wiki diagnostic packets as conversational cold memory', () => {
  const result = formatConversationColdMemoryContext({
    context_packet: {
      sections: [
        {
          section: 'compiled_project_knowledge',
          items: [
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

  assert.equal(result.sourceCount, 0);
  assert.equal(result.contextText, '');
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
