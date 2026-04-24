import assert from 'node:assert/strict';
import {
  formatProviderCompletionForTelegram,
  normalizeTelegramRelayVerbosity
} from '../src/missionRelay';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('formats structured provider JSON as readable Telegram text', () => {
  const message = formatProviderCompletionForTelegram({
    providerLabel: 'zai',
    missionId: 'spark-123',
    requestId: 'tg-build-1',
    verbosity: 'normal',
    response: JSON.stringify({
      goal: 'Build a tiny board.',
      summary: 'Implemented the requested static board and verified the files.',
      status: 'completed',
      project_path: 'C:\\Users\\USER\\Desktop\\spark-board',
      changed_files: ['index.html', 'styles.css', 'app.js', 'README.md'],
      verification: [
        'Confirmed index.html loads styles.css and app.js.',
        'Confirmed localStorage usage.',
        'Confirmed README smoke test instructions.'
      ],
      exact_commands: ['Get-ChildItem', 'Get-Content README.md'],
      execution_contract: { done_when: ['Do the thing'] }
    })
  });

  assert.match(message, /Z\.AI GLM finished the build\./);
  assert.match(message, /Implemented the requested static board/);
  assert.match(message, /Project: C:\\Users\\USER\\Desktop\\spark-board/);
  assert.match(message, /Changed files: index\.html, styles\.css, app\.js, README\.md/);
  assert.match(message, /Checks:/);
  assert.doesNotMatch(message, /"goal"/);
  assert.doesNotMatch(message, /exact_commands/);
  assert.doesNotMatch(message, /execution_contract/);
});

test('supports human verbosity aliases', () => {
  assert.equal(normalizeTelegramRelayVerbosity('bare bones'), 'minimal');
  assert.equal(normalizeTelegramRelayVerbosity('default'), 'normal');
  assert.equal(normalizeTelegramRelayVerbosity('full'), 'verbose');
});
