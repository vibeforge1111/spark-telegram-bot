import assert from 'node:assert/strict';
import { formatDiagnosticsAttachmentFallback } from '../src/index';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('diagnostics attachment fallback does not expose local paths', () => {
  const localPath = '/Users/example/.spark/diagnostics/sk-live-placeholder-diagnostics.md';

  const reply = formatDiagnosticsAttachmentFallback(localPath);

  assert.match(reply, /Markdown diagnostics note locally/);
  assert.doesNotMatch(reply, /\/Users\/|\.spark|diagnostics\.md|sk-live-placeholder/);
  assert.equal(reply.includes(localPath), false);
});
