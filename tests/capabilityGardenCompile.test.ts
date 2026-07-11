import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readCapabilityGardenSummaryEnsuringCompiled,
  renderCapabilityGardenSummary,
  runSparkOsCompile
} from '../src/capabilityGarden';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('auto-compiles when capability catalog is missing', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'spark-capability-compile-'));
    const catalogPath = path.join(root, 'capability-catalog.json');
    let compileCalls = 0;

    const { summary, compile } = await readCapabilityGardenSummaryEnsuringCompiled({
      catalogPath,
      compileRunner: async () => {
        compileCalls += 1;
        return { code: 0, stdout: 'compiled capability catalog', stderr: '' };
      }
    });

    assert.equal(compileCalls, 1);
    assert.equal(compile.attempted, true);
    assert.equal(compile.succeeded, true);
    assert.equal(summary.present, false);
  });

  await test('surfaces actionable compile failure in capabilities reply', () => {
    const reply = renderCapabilityGardenSummary({
      present: false,
      cardCount: 0,
      statusCounts: {},
      surfaceCounts: {},
      cards: []
    }, {
      attempted: true,
      succeeded: false,
      detail: 'spark: command not found'
    });

    assert.match(reply, /not compiled yet/i);
    assert.match(reply, /Auto-compile/i);
    assert.match(reply, /spark: command not found/);
    assert.match(reply, /Fix the compile error/i);
  });

  await test('runSparkOsCompile reports non-zero exit detail', async () => {
    const result = await runSparkOsCompile(async () => ({
      code: 2,
      stdout: '',
      stderr: 'missing spark os modules'
    }));

    assert.equal(result.attempted, true);
    assert.equal(result.succeeded, false);
    assert.match(result.detail, /missing spark os modules/);
  });
}

void main();
