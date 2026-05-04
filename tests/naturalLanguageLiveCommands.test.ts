import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

type CommandCase = {
  id: string;
  suite: string;
  risk: string;
  prompt: string;
  expectedRoute: string;
  expectedOutcome: string;
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

function loadCases(): CommandCase[] {
  const file = path.join(__dirname, '..', 'ops', 'natural-language-live-commands.json');
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as CommandCase[];
}

test('memory architecture live deck covers source and promotion boundary probes', () => {
  const cases = loadCases().filter((entry) => entry.suite === 'memory_architecture');
  const byId = new Map(cases.map((entry) => [entry.id, entry]));

  assert.equal(cases.length >= 10, true);

  const requiredCases = [
    'memory-architecture-001',
    'memory-architecture-001b',
    'memory-architecture-002',
    'memory-architecture-003',
    'memory-architecture-004',
    'memory-architecture-005',
    'memory-architecture-006',
    'memory-architecture-007',
    'memory-architecture-008',
    'memory-architecture-009'
  ];
  for (const id of requiredCases) {
    assert.ok(byId.has(id), `${id} should be present in memory_architecture live deck`);
  }

  assert.match(byId.get('memory-architecture-006')?.expectedOutcome || '', /newest explicit user message wins/i);
  assert.match(byId.get('memory-architecture-001b')?.expectedOutcome || '', /current truth separated from supporting episodic recall/i);
  assert.match(byId.get('memory-architecture-007')?.expectedOutcome || '', /supporting_not_authoritative/i);
  assert.match(byId.get('memory-architecture-008')?.expectedOutcome || '', /selected route|bridge mode/i);
  assert.match(byId.get('memory-architecture-009')?.expectedOutcome || '', /rejects verified durable promotion/i);
});
