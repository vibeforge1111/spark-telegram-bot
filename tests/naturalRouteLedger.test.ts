import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decideNaturalRoute } from '../src/naturalRouteDecision';
import {
  appendNaturalRouteExecutionRecord,
  createNaturalRouteExecutionRecord,
  formatNaturalRouteLedgerSummary,
  naturalRouteLedgerPath,
  parseNaturalRouteExecutionLedger,
  shouldWriteNaturalRouteLedger,
  summarizeNaturalRouteExecutionRecords
} from '../src/naturalRouteLedger';

type AsyncTest = () => Promise<void> | void;

async function test(name: string, fn: AsyncTest): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function run(): Promise<void> {
  await test('creates a route execution record without raw text or payload fields', () => {
    const decision = decideNaturalRoute('Build this at C:\\Users\\USER\\Desktop\\spark-timer: a tiny timer app');
    const record = createNaturalRouteExecutionRecord({
      decision,
      profile: 'spark agi',
      userId: 8319079055,
      chatId: 8319079055,
      chatType: 'private',
      admin: true,
      executedRoute: 'spawner.build',
      executedOwner: 'spawner-ui',
      executedAction: 'spawner.build',
      now: new Date('2026-05-09T00:00:00.000Z')
    });
    const serialized = JSON.stringify(record);

    assert.equal(record.schema_version, 'spark.nlp.route_execution.v1');
    assert.equal(record.outcome, 'matched');
    assert.equal(record.shadow_route, 'spawner.build');
    assert.equal(record.executed_route, 'spawner.build');
    assert.equal(record.profile, 'spark_agi');
    assert.doesNotMatch(serialized, /tiny timer app|spark-timer|Desktop/i);
    assert.equal(Object.prototype.hasOwnProperty.call(record, 'payload'), false);
  });

  await test('detects shadow and execution mismatches in ledger summaries', () => {
    const memoryDecision = decideNaturalRoute('remember that I prefer concise Telegram replies');
    const matched = createNaturalRouteExecutionRecord({
      decision: memoryDecision,
      executedRoute: 'memory.write',
      executedOwner: 'spark-intelligence-builder',
      executedAction: 'memory.write'
    });
    const mismatch = createNaturalRouteExecutionRecord({
      decision: memoryDecision,
      executedRoute: 'spawner.build',
      executedOwner: 'spawner-ui',
      executedAction: 'spawner.build'
    });
    const summary = summarizeNaturalRouteExecutionRecords([matched, mismatch]);

    assert.equal(summary.total, 2);
    assert.equal(summary.matched, 1);
    assert.equal(summary.mismatch, 1);
    assert.equal(summary.byExecutedRoute['spawner.build'], 1);
    assert.equal(summary.mismatchesByPair['memory.write->spawner.build'], 1);
    assert.match(formatNaturalRouteLedgerSummary(summary), /memory\.write->spawner\.build: 1/);
  });

  await test('writes and parses JSONL only when explicitly configured', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'spark-natural-route-ledger-'));
    const filePath = path.join(dir, 'route-ledger.jsonl');
    try {
      assert.equal(shouldWriteNaturalRouteLedger({} as NodeJS.ProcessEnv), false);
      assert.equal(shouldWriteNaturalRouteLedger({ SPARK_NATURAL_ROUTE_LEDGER: '1' } as NodeJS.ProcessEnv), true);
      assert.equal(naturalRouteLedgerPath({ SPARK_NATURAL_ROUTE_LEDGER_PATH: filePath } as NodeJS.ProcessEnv), filePath);

      const decision = decideNaturalRoute('search your wiki for Telegram route mistakes');
      const record = createNaturalRouteExecutionRecord({
        decision,
        executedRoute: 'spark_wiki.query',
        executedOwner: 'spark-intelligence-builder',
        executedAction: 'spark_wiki.query'
      });
      await appendNaturalRouteExecutionRecord(record, filePath);
      const parsed = parseNaturalRouteExecutionLedger(await readFile(filePath, 'utf-8'));

      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].shadow_route, 'spark_wiki.query');
      assert.equal(parsed[0].shadow_signals.includes('spark_wiki_query'), true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

void run();
