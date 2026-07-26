import assert from 'node:assert/strict';
import { resolveLiveStatusFollowup } from '../src/liveStatusFollowup';

async function main(): Promise<void> {
  const recentTurns = [
    { role: 'assistant' as const, text: "Spark is healthy right now. I'm using fresh runtime state here, not memory; it shows Spawner is reachable, Telegram is polling, and Mission Control is ready." }
  ];

  const notice = await resolveLiveStatusFollowup('okay, what should I notice first?', recentTurns, async () => 'unused');
  assert.match(notice || '', /first thing to notice.*Spawner.*Telegram.*Mission Control/is);
  assert.doesNotMatch(notice || '', /^\s*•|Live loop|Status|Provider|Move/mi);

  const sequentialTurns = [
    ...recentTurns,
    { role: 'user' as const, text: 'okay, what should I notice first?' },
    { role: 'assistant' as const, text: notice || '' }
  ];
  let freshReads = 0;
  const working = await resolveLiveStatusFollowup('is it still working?', sequentialTurns, async () => {
    freshReads += 1;
    return 'Spark is healthy right now. Fresh runtime state confirms the live loop is still working.';
  });
  assert.equal(freshReads, 1);
  assert.match(working || '', /still working/i);

  const open = await resolveLiveStatusFollowup('where can I open it?', [...sequentialTurns, { role: 'assistant' as const, text: working || '' }], async () => 'unused');
  assert.match(open || '', /http:\/\/127\.0\.0\.1:3333/);
  assert.equal((open || '').match(/https?:\/\//g)?.length, 1);

  const unrelated = await resolveLiveStatusFollowup('where can I open it?', [{ role: 'assistant' as const, text: 'Your document is ready.' }], async () => 'unused');
  assert.equal(unrelated, null);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
