import assert from 'node:assert/strict';
import { renderSpawnerIdeationBoundaryReply } from '../src/spawnerIdeationBoundary';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('renders design-only product questions without build claims', () => {
  const reply = renderSpawnerIdeationBoundaryReply('Please help me design a project called Proof Garden. Do not build yet; ask me the first two product questions.');
  assert.match(reply, /I won't build Proof Garden yet/);
  assert.equal((reply.match(/\?/g) || []).length, 2);
  assert.match(reply, /Who is it for first/);
  assert.match(reply, /What should one "proof" contain in v1/);
  assert.doesNotMatch(reply, /Mission:|Provider:|Move:|I will build|starting/i);
});

test('does not steal ordinary design or build requests', () => {
  assert.equal(renderSpawnerIdeationBoundaryReply('Please help me design a project called Proof Garden.'), '');
  assert.equal(renderSpawnerIdeationBoundaryReply('Build a project called Proof Garden now.'), '');
});
