import assert from 'node:assert/strict';
import {
  INTENT_PROPOSER_TAXONOMY,
  buildIntentProposerPrompt,
  parseIntentProposal,
  scoreProposalAgreement,
  runIntentProposerShadow
} from '../src/intentProposerShadow';

const registered: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>): void {
  registered.push([name, fn]);
}

test('taxonomy is well-formed: unique routes, non-empty descriptions, includes abstain', () => {
  const routes = INTENT_PROPOSER_TAXONOMY.map((r) => r.route);
  assert.equal(new Set(routes).size, routes.length, 'route ids must be unique');
  assert.ok(routes.includes('abstain'), 'abstain must be an option');
  assert.ok(routes.includes('plain_chat'), 'plain_chat must be an option');
  for (const r of INTENT_PROPOSER_TAXONOMY) {
    assert.ok(r.useWhen.trim().length > 0, `${r.route} useWhen`);
    assert.ok(r.doNotUseWhen.trim().length > 0, `${r.route} doNotUseWhen`);
  }
});

test('prompt includes the user text, the strict-JSON instruction, and the route menu', () => {
  const { system, user } = buildIntentProposerPrompt('build me a dashboard');
  assert.match(user, /build me a dashboard/);
  assert.match(system, /STRICT JSON/);
  assert.match(system, /Read ONLY the user/);
  assert.match(system, /spawner\.build/);
  assert.match(system, /abstain/);
});

test('parser accepts clean JSON, clamps confidence, sorts by confidence', () => {
  const p = parseIntentProposal('{"candidates":[{"route":"plain_chat","confidence":0.3,"rationale":"q"},{"route":"spawner.build","confidence":1.7,"rationale":"cmd"}],"abstain":false}');
  assert.ok(p);
  assert.equal(p!.candidates[0].route, 'spawner.build', 'sorted highest-confidence first');
  assert.equal(p!.candidates[0].confidence, 1, 'confidence clamped to 1');
  assert.equal(p!.abstain, false);
});

test('parser tolerates markdown fences and surrounding prose', () => {
  const raw = 'Here you go:\n```json\n{"candidates":[{"route":"access.change","confidence":0.9,"rationale":"x"}],"abstain":false}\n```\nthanks';
  const p = parseIntentProposal(raw);
  assert.ok(p);
  assert.equal(p!.candidates[0].route, 'access.change');
});

test('parser returns null on garbage / non-JSON', () => {
  assert.equal(parseIntentProposal('not json at all'), null);
  assert.equal(parseIntentProposal(''), null);
  assert.equal(parseIntentProposal('{"candidates": "oops"}'), null);
});

test('parser accepts an abstain-only proposal with no candidates', () => {
  const p = parseIntentProposal('{"candidates":[],"abstain":true}');
  assert.ok(p);
  assert.equal(p!.abstain, true);
  assert.equal(p!.candidates.length, 0);
});

test('agreement: top candidate matching the regex route agrees', () => {
  const a = scoreProposalAgreement('spawner.build', { candidates: [{ route: 'spawner.build', confidence: 0.9, rationale: '' }], abstain: false });
  assert.equal(a.agrees, true);
  assert.equal(a.proposerTop, 'spawner.build');
  assert.equal(a.proposerConfidence, 0.9);
});

test('agreement: disagreement is flagged (the measurement signal)', () => {
  // The regex routed to a build, but the model thinks it is chat - the disagreement we want to log.
  const a = scoreProposalAgreement('spawner.build', { candidates: [{ route: 'plain_chat', confidence: 0.8, rationale: 'question' }], abstain: false });
  assert.equal(a.agrees, false);
  assert.equal(a.proposerTop, 'plain_chat');
});

test('agreement: null proposal does not agree and does not throw', () => {
  const a = scoreProposalAgreement('plain_chat', null);
  assert.equal(a.agrees, false);
  assert.equal(a.proposerTop, null);
  assert.equal(a.proposerConfidence, null);
});

test('shadow runner returns proposal + agreement from an injected completer', async () => {
  const complete = async () => '{"candidates":[{"route":"schedule.delete","confidence":0.95,"rationale":"delete the 9am job"}],"abstain":false}';
  const { proposal, agreement } = await runIntentProposerShadow('delete the 9am schedule', 'schedule.delete', complete);
  assert.ok(proposal);
  assert.equal(agreement.agrees, true);
  assert.equal(agreement.proposerTop, 'schedule.delete');
});

test('shadow runner is fail-safe: a throwing completer yields null proposal, never an exception', async () => {
  const complete = async () => { throw new Error('provider down'); };
  const { proposal, agreement } = await runIntentProposerShadow('hello', 'plain_chat', complete);
  assert.equal(proposal, null);
  assert.equal(agreement.agrees, false);
  assert.equal(agreement.proposerTop, null);
});

void (async () => {
  let failed = 0;
  for (const [name, fn] of registered) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (err) {
      console.error(`not ok - ${name}`);
      console.error(err);
      failed++;
    }
  }
  if (failed) process.exitCode = 1;
})();
