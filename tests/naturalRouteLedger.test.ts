import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decideNaturalRoute } from '../src/naturalRouteDecision';
import {
  appendNaturalRouteExecutionRecord,
  appendNaturalRouteExecutionRecordSync,
  createNaturalRouteExecutionRecord,
  formatNaturalRouteLedgerSummary,
  naturalRouteLedgerPath,
  parseNaturalRouteExecutionLedger,
  shouldWriteNaturalRouteLedger,
  shouldWriteNaturalRouteLedgerSynchronously,
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
    assert.match(record.user_id, /^user_[a-f0-9]{16}$/);
    assert.match(record.chat_id, /^chat_[a-f0-9]{16}$/);
    assert.doesNotMatch(serialized, /tiny timer app|spark-timer|Desktop/i);
    assert.doesNotMatch(serialized, /8319079055/);
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

  await test('writes and parses JSONL unless explicitly disabled', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'spark-natural-route-ledger-'));
    const filePath = path.join(dir, 'route-ledger.jsonl');
    try {
      assert.equal(shouldWriteNaturalRouteLedger({} as NodeJS.ProcessEnv), true);
      assert.equal(shouldWriteNaturalRouteLedger({ SPARK_NATURAL_ROUTE_LEDGER: '1' } as NodeJS.ProcessEnv), true);
      assert.equal(shouldWriteNaturalRouteLedger({ SPARK_NATURAL_ROUTE_LEDGER: '0' } as NodeJS.ProcessEnv), false);
      assert.equal(shouldWriteNaturalRouteLedger({ SPARK_BOT_TEST_MODE: '1' } as NodeJS.ProcessEnv), false);
      assert.equal(shouldWriteNaturalRouteLedger({
        SPARK_BOT_TEST_MODE: '1',
        SPARK_NATURAL_ROUTE_LEDGER_PATH: filePath
      } as NodeJS.ProcessEnv), true);
      assert.equal(shouldWriteNaturalRouteLedgerSynchronously({} as NodeJS.ProcessEnv), false);
      assert.equal(shouldWriteNaturalRouteLedgerSynchronously({ SPARK_NATURAL_ROUTE_LEDGER_STRICT: '1' } as NodeJS.ProcessEnv), true);
      assert.equal(shouldWriteNaturalRouteLedgerSynchronously({
        SPARK_BOT_TEST_MODE: '1',
        SPARK_NATURAL_ROUTE_LEDGER_PATH: filePath
      } as NodeJS.ProcessEnv), true);
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

      appendNaturalRouteExecutionRecordSync(record, filePath);
      const parsedAfterSync = parseNaturalRouteExecutionLedger(await readFile(filePath, 'utf-8'));
      assert.equal(parsedAfterSync.length, 2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  await test('skips malformed JSONL lines without crashing', () => {
    const validRecord = createNaturalRouteExecutionRecord({
      decision: decideNaturalRoute('search your wiki for Telegram route mistakes'),
      executedRoute: 'spark_wiki.query',
      executedOwner: 'spark-intelligence-builder',
      executedAction: 'spark_wiki.query'
    });
    const validLine = JSON.stringify(validRecord);
    const jsonl = [
      validLine,
      'not valid json {{{',
      '',
      validLine,
      'also broken json }}}',
      validLine
    ].join('\n');

    const parsed = parseNaturalRouteExecutionLedger(jsonl);
    assert.equal(parsed.length, 3);
    assert.equal(parsed[0].shadow_route, validRecord.shadow_route);
  });
}

void run();
