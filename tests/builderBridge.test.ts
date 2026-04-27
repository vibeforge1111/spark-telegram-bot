import assert from 'node:assert/strict';
import { formatDiagnosticsScanReply } from '../src/builderBridge';

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
