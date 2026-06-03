import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createRouteArbiterRecord,
  parseRouteArbiterResponse,
  routeArbiterMode,
  routeArbiterTextHash
} from '../src/routeArbiter';
import {
  evaluateDeterministicRoute,
  shouldUseRouteArbiter
} from '../src/routeFirewall';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('defaults to shadow mode outside test mode and off during bot tests', () => {
  assert.equal(routeArbiterMode({} as NodeJS.ProcessEnv), 'shadow');
  assert.equal(routeArbiterMode({ SPARK_BOT_TEST_MODE: '1' } as NodeJS.ProcessEnv), 'off');
  assert.equal(routeArbiterMode({ SPARK_ROUTE_ARBITER_MODE: 'off' } as NodeJS.ProcessEnv), 'off');
  assert.equal(routeArbiterMode({ SPARK_ROUTE_ARBITER_MODE: 'enforce' } as NodeJS.ProcessEnv), 'shadow');
});

test('only ambiguous interruptive candidates go to the LLM arbiter', () => {
  const designPrompt = 'how can we make sure access level 4 creates the right setup for access level to be really 4?';
  const designVerdict = evaluateDeterministicRoute('access.change', designPrompt);
  assert.equal(designVerdict.allow, false);
  assert.equal(shouldUseRouteArbiter('access.change', designPrompt, designVerdict), true);

  const buildPrompt = 'Build this at C:\\Users\\USER\\Desktop\\spark-timer: a tiny timer app';
  const buildVerdict = evaluateDeterministicRoute('spawner.build', buildPrompt);
  assert.equal(buildVerdict.reason, 'concrete_project_build');
  assert.equal(shouldUseRouteArbiter('spawner.build', buildPrompt, buildVerdict), false);

  const statusPrompt = 'what access level am I on?';
  const statusVerdict = evaluateDeterministicRoute('access.status', statusPrompt);
  assert.equal(shouldUseRouteArbiter('access.status', statusPrompt, statusVerdict), false);
});

test('parses compact JSON classifier replies', () => {
  const parsed = parseRouteArbiterResponse(
    '{"intent":"design","allow":false,"confidence":"high","rationale_tag":"system_design"}'
  );

  assert.deepEqual(parsed, {
    intent: 'design',
    allow: false,
    confidence: 'high',
    rationaleTag: 'system_design'
  });
});

test('malformed classifier JSON fails closed without crashing the route', () => {
  assert.deepEqual(parseRouteArbiterResponse('prefix {\"intent\":\"execute\" broken} suffix'), {
    intent: 'unclear',
    allow: false,
    confidence: 'low',
    rationaleTag: 'unspecified'
  });
});

test('route arbiter records keep raw prompt text out of the ledger', () => {
  const text = 'how can we make sure access level 4 creates the right setup for access level to be really 4?';
  const verdict = evaluateDeterministicRoute('access.change', text);
  const record = createRouteArbiterRecord({
    route: 'access.change',
    text,
    verdict,
    profile: 'spark agi',
    parsed: {
      intent: 'design',
      allow: false,
      confidence: 'high',
      rationaleTag: 'system_design'
    },
    now: new Date('2026-05-10T00:00:00.000Z')
  });
  const serialized = JSON.stringify(record);

  assert.equal(record.schema_version, 'spark.route_arbiter.shadow.v1');
  assert.equal(record.text_hash, routeArbiterTextHash(text));
  assert.equal(record.profile, 'spark_agi');
  assert.equal(record.arbiter_intent, 'design');
  assert.equal(record.arbiter_allow, false);
  assert.doesNotMatch(serialized, /access level 4 creates|really 4/i);
});

test('top-level Telegram handler consumes route evidence instead of local deterministic authority', () => {
  const indexSource = readFileSync(resolve(__dirname, '../src/index.ts'), 'utf8');

  assert.match(indexSource, /routeEvidenceAllowed/);
  assert.doesNotMatch(indexSource, /deterministicRouteAllowed/);
  assert.doesNotMatch(indexSource, /evaluateDeterministicRoute/);
});
