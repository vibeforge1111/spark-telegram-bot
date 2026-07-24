import assert from 'node:assert/strict';
import { formatDiagnosticsScanEmptyStdoutError } from '../src/builderBridge';

process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';

async function run(): Promise<void> {
  const { formatDiagnosticsAttachmentFallback } = await import('../src/index');
  const attachment = formatDiagnosticsAttachmentFallback();
  assert.match(attachment, /wrote the Markdown diagnostics note locally/i);
  assert.doesNotMatch(attachment, /\/Users\/|[A-Z]:\\/);

  const empty = formatDiagnosticsScanEmptyStdoutError('');
  const privateStderr = formatDiagnosticsScanEmptyStdoutError('Traceback from /Users/operator/private with BOT_TOKEN=secret');
  assert.equal(empty, 'Diagnostics scan returned empty stdout.');
  assert.match(privateStderr, /captured but redacted/i);
  assert.doesNotMatch(privateStderr, /Traceback|\/Users|BOT_TOKEN|secret/);
  console.log('ok - diagnostics fallbacks hide attachment paths and stderr');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
