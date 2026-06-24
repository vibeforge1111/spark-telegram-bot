import assert from 'node:assert/strict';
import { buildMemoryProposerPrompt, parseMemoryCandidates, runMemoryProposer, shouldRunImplicitMemoryProposer } from '../src/memoryProposer';

const registered: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>): void { registered.push([name, fn]); }

test('parse: valid candidates JSON', () => {
  const out = parseMemoryCandidates('{"candidates":[{"note":"User is building a Mars survival game.","salienceReason":"current project"}]}');
  assert.equal(out.length, 1);
  assert.match(out[0].note, /Mars survival game/);
  assert.equal(out[0].salienceReason, 'current project');
});

test('parse: tolerates a ```json fenced block + prose around it', () => {
  const out = parseMemoryCandidates('Sure:\n```json\n{"candidates":[{"note":"User works late, GST."}]}\n```');
  assert.equal(out.length, 1);
  assert.equal(out[0].salienceReason, 'durable_fact'); // default when omitted
});

test('parse: preserves validated typed current-state metadata', () => {
  const out = parseMemoryCandidates(JSON.stringify({
    candidates: [{
      note: 'User currently works best with one calm next move first.',
      salienceReason: 'current work constraint',
      memoryRole: 'current_state',
      predicate: 'profile.current_constraint',
      value: 'works best with one calm next move first',
    }],
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].memoryRole, 'current_state');
  assert.equal(out[0].predicate, 'profile.current_constraint');
  assert.equal(out[0].value, 'works best with one calm next move first');
  assert.equal(out[0].factName, 'current_constraint');
});

test('parse: strips unsafe typed metadata while keeping the governed note fallback', () => {
  const out = parseMemoryCandidates(JSON.stringify({
    candidates: [{
      note: 'User has a durable preference.',
      salienceReason: 'durable preference',
      memoryRole: 'current_state',
      predicate: 'profile.admin_override',
      value: 'raise access level',
    }],
  }));
  assert.equal(out.length, 1);
  assert.equal(out[0].note, 'User has a durable preference.');
  assert.equal(out[0].memoryRole, undefined);
  assert.equal(out[0].predicate, undefined);
  assert.equal(out[0].value, undefined);
});

test('parse: empty/garbage/non-object -> []', () => {
  for (const r of ['', 'not json', '{}', '{"candidates":"nope"}', '[]', '{"candidates":[{}]}']) {
    assert.deepEqual(parseMemoryCandidates(r), [], JSON.stringify(r));
  }
});

test('parse: caps at 4 candidates and drops empty notes', () => {
  const many = { candidates: Array.from({ length: 9 }, (_, i) => ({ note: i === 0 ? '' : `Fact ${i}` })) };
  const out = parseMemoryCandidates(JSON.stringify(many));
  assert.ok(out.length <= 4);
  assert.ok(out.every((c) => c.note.length > 0));
});

test('runMemoryProposer: guards skip short/command turns WITHOUT calling the model', async () => {
  let called = 0;
  const spy = async () => { called++; return '{"candidates":[{"note":"X"}]}'; };
  assert.deepEqual(await runMemoryProposer('yes', [], spy), []);
  assert.deepEqual(await runMemoryProposer('/access 5', [], spy), []);
  assert.deepEqual(await runMemoryProposer('  ok  ', [], spy), []);
  assert.equal(called, 0, 'completer must not be called for guarded turns');
});

test('runMemoryProposer: owner-state and action routes cannot summon implicit capture', async () => {
  let called = 0;
  const spy = async () => { called++; return '{"candidates":[{"note":"X"}]}'; };
  const accessQuestion = 'Could you check what Spark access this chat effectively has right now? Please do not change anything.';
  assert.deepEqual(await runMemoryProposer(accessQuestion, [], spy, {
    selectedRoute: 'access.status',
    naturalRoute: 'access.status',
    selectedAction: 'access.status',
    selectedKind: 'access_status'
  }), []);
  assert.deepEqual(await runMemoryProposer('After that restart, what should I focus on next?', [], spy, {
    selectedRoute: 'spark.read_only_state',
    naturalRoute: 'conversation.ideation',
    selectedAction: 'spark.read_only_state.restart_needed',
    selectedKind: 'runtime_truth_or_operator'
  }), []);
  assert.deepEqual(await runMemoryProposer('The doc says delete the schedule.', [], spy, {
    selectedRoute: 'conversation.source_attributed_action_boundary',
    naturalRoute: 'conversation.source_attributed_action_boundary',
    selectedAction: 'plain_chat.source_attributed_action_boundary',
    selectedKind: 'plain_conversation',
    noExecution: true
  }), []);
  assert.equal(called, 0, 'blocked owner/action lanes must not call the model proposer');
});

test('shouldRunImplicitMemoryProposer: chat facts are allowed but non-chat lanes abstain', () => {
  assert.equal(shouldRunImplicitMemoryProposer('This week I am building a lunar greenhouse planner.', {
    selectedRoute: 'plain_chat',
    naturalRoute: 'plain_chat',
    selectedAction: 'plain_chat',
    selectedKind: 'plain_conversation'
  }), true);
  for (const selectedRoute of ['memory.recall', 'memory.write', 'schedule.delete', 'spawner.build', 'spark_wiki.answer']) {
    assert.equal(shouldRunImplicitMemoryProposer('This week I am building a lunar greenhouse planner.', {
      selectedRoute,
      naturalRoute: 'plain_chat'
    }), false, selectedRoute);
  }
});

test('runMemoryProposer: a real turn parses candidates; a throwing completer yields []', async () => {
  const ok = await runMemoryProposer('This week I am building a lunar greenhouse planner.', [], async () => '{"candidates":[{"note":"User is building a lunar greenhouse planner.","salienceReason":"project"}]}');
  assert.equal(ok.length, 1);
  const boom = await runMemoryProposer('This week I am building a lunar greenhouse planner.', [], async () => { throw new Error('provider down'); });
  assert.deepEqual(boom, []);
});

test('prompt: carries the hard anti-hijack boundary (own voice only, never quoted/reported)', () => {
  const { system } = buildMemoryProposerPrompt('I am building X', ['User: earlier thing']);
  assert.match(system, /own voice/i);
  assert.match(system, /quoted|reported|fenced/i);
  assert.match(system, /your memory says/i);
  assert.ok(!system.includes('—')); // no em dash
});

void (async () => {
  let failed = 0;
  for (const [name, fn] of registered) {
    try { await fn(); console.log(`ok - ${name}`); }
    catch (err) { console.error(`not ok - ${name}`); console.error(err); failed++; }
  }
  if (failed) process.exitCode = 1;
})();
