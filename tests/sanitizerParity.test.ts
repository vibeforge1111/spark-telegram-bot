import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sanitizeOutbound } from '../src/outboundSanitize';

type SanitizerParityCase = {
  id: string;
  input: string;
  output: string;
};

type SanitizerParityFixture = {
  schema: string;
  cases: SanitizerParityCase[];
};

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function loadFixture(): SanitizerParityFixture {
  const sparkCharacterRoot = process.env.SPARK_CHARACTER_ROOT || 'C:\\Users\\USER\\Desktop\\spark-character';
  const fixturePath = path.join(
    sparkCharacterRoot,
    'src',
    'spark_character',
    'artifacts',
    'sanitizer_fixtures',
    'parity.v1.json'
  );
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as SanitizerParityFixture;
}

test('shared sanitizer parity fixture matches spark-character outputs', () => {
  const fixture = loadFixture();
  assert.equal(fixture.schema, 'spark_character.sanitizer_parity.v1');
  for (const entry of fixture.cases) {
    assert.equal(sanitizeOutbound(entry.input), entry.output, entry.id);
  }
});
