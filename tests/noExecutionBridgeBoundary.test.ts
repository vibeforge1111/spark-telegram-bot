import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type AsyncTest = () => Promise<void> | void;
const tests: Array<{ name: string; fn: AsyncTest }> = [];

function test(name: string, fn: AsyncTest): void {
  tests.push({ name, fn });
}

process.nextTick(() => {
  void (async () => {
    for (const { name, fn } of tests) {
      try {
        await fn();
        console.log(`ok - ${name}`);
      } catch (error) {
        console.error(`not ok - ${name}`);
        throw error;
      }
    }
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
});

function fakeCtx(
  text: string,
  replies: string[],
  mediaReplies: { voice: unknown[]; audio: unknown[] } = { voice: [], audio: [] }
) {
  const message = { message_id: 9101, text };
  return {
    chat: { id: 8319079055, type: 'private' },
    from: { id: 8319079055, username: 'qa' },
    message,
    update: { update_id: 9101, message },
    sendChatAction: async (_action: string) => {},
    reply: async (reply: string) => {
      replies.push(reply);
    },
    replyWithVoice: async (inputFile: unknown, options?: unknown) => {
      mediaReplies.voice.push({ inputFile, options });
    },
    replyWithAudio: async (inputFile: unknown, options?: unknown) => {
      mediaReplies.audio.push({ inputFile, options });
    }
  };
}

function readJsonl(filePath: string): any[] {
  return readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function waitForJsonlRecord(filePath: string, predicate: (record: any) => boolean): Promise<any[]> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const records = (() => {
      try {
        return readJsonl(filePath);
      } catch {
        return [];
      }
    })();
    if (records.some(predicate)) return records;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  try {
    return readJsonl(filePath);
  } catch {
    return [];
  }
}

test('no-execution meta action words bypass Builder bridge detours', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';

  const indexModule: any = await import('../src/index');
  const llmModule = await import('../src/llm');
  const originalChat = llmModule.llm.chat;
  let bridgeCalls = 0;

  indexModule.__setBuilderBridgeRunnerForTest(async () => {
    bridgeCalls += 1;
    return {
      used: true,
      responseText: "I can't search the web right now.\nMy live browser session dropped.",
      decision: 'blocked',
      bridgeMode: 'blocked',
      routingDecision: 'browser_unavailable'
    };
  });
  llmModule.llm.chat = async () => (
    "Those are example words, not commands. I will keep this in chat and won't launch, save, schedule, or run anything."
  );

  try {
    const text = 'TurnIntent live QA: The words build, memory, schedule, provider, run, and Codex are examples only. Do not start, save, schedule, or run anything; answer conversationally in one short reply.';
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx(text, replies));

    assert.equal(bridgeCalls, 0);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /examples or context|example words, not commands|action words as language evidence/i);
    assert.doesNotMatch(replies[0], /search the web|browser session/i);
  } finally {
    llmModule.llm.chat = originalChat;
    indexModule.__setBuilderBridgeRunnerForTest(null);
  }
});

test('quoted drafted high-agency examples compose answers without Builder bridge detours', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';

  const indexModule: any = await import('../src/index');
  const llmModule = await import('../src/llm');
  const originalChat = llmModule.llm.chat;
  let bridgeCalls = 0;
  let capturedPrompt = '';

  indexModule.__setBuilderBridgeRunnerForTest(async () => {
    bridgeCalls += 1;
    return {
      used: true,
      responseText: 'I will create the chip now.',
      decision: 'domain_chip.create',
      bridgeMode: 'test',
      routingDecision: 'domain_chip.create'
    };
  });
  llmModule.llm.chat = async (prompt: string) => {
    capturedPrompt = prompt;
    return 'That belongs in the documentation example. I would discuss the wording in chat and would not create a chip or write memory from this turn.';
  };

  try {
    const text = 'In documentation, should we include "create a memory chip" as an example?';
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx(text, replies));

    assert.equal(bridgeCalls, 0);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /documentation example|wording in chat/i);
    assert.match(replies[0], /not create a chip|would not create/i);
    assert.doesNotMatch(replies[0], /I will create the chip now/i);
    assert.match(capturedPrompt, /conversation\.quoted_drafted_example_boundary/);
    assert.match(capturedPrompt, /Allowed tool: answer\.compose only/);
    assert.match(capturedPrompt, /domain_chip\.create/);
    assert.match(capturedPrompt, /User message: In documentation/);
  } finally {
    llmModule.llm.chat = originalChat;
    indexModule.__setBuilderBridgeRunnerForTest(null);
  }
});

test('quoted publish wording preserves governed quoted-boundary route execution', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';
  process.env.SPARK_NATURAL_ROUTE_LEDGER = '1';

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-quoted-boundary-route-'));
  const naturalRouteLedgerPath = path.join(tempRoot, 'natural-route-ledger.jsonl');
  process.env.SPARK_NATURAL_ROUTE_LEDGER_PATH = naturalRouteLedgerPath;

  const indexModule: any = await import('../src/index');
  const llmModule = await import('../src/llm');
  const originalChat = llmModule.llm.chat;
  let bridgeCalls = 0;

  indexModule.__setBuilderBridgeRunnerForTest(async () => {
    bridgeCalls += 1;
    return {
      used: true,
      responseText: 'I will publish the PR now.',
      decision: 'publish',
      bridgeMode: 'test',
      routingDecision: 'publish'
    };
  });
  llmModule.llm.chat = async () => (
    'Treat those action words as language evidence, not as the action itself. Execution still needs fresh intent and Governor authorization.'
  );

  try {
    const text = 'If a user says "publish the PR" inside a quote, what should Spark do?';
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx(text, replies));

    assert.equal(bridgeCalls, 0);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /language evidence|fresh intent/i);
    assert.doesNotMatch(replies[0], /publish the PR now/i);

    const quotedBoundaryExecution = (record: any) => (
      record.shadow_route === 'conversation.quoted_drafted_example_boundary' &&
      record.executed_route === 'conversation.quoted_drafted_example_boundary'
    );
    const routeRecords = await waitForJsonlRecord(naturalRouteLedgerPath, quotedBoundaryExecution);
    const quotedRecord = routeRecords.find(quotedBoundaryExecution);
    assert.ok(
      quotedRecord,
      `quoted PR wording must bind selected and executed route to the governed quoted-boundary route; records=${JSON.stringify(routeRecords)}`
    );
    assert.equal(quotedRecord.executed_owner, 'spark-telegram-bot');
    assert.equal(quotedRecord.executed_action, 'plain_chat.quoted_example_boundary');
    assert.equal(quotedRecord.outcome, 'matched');
  } finally {
    llmModule.llm.chat = originalChat;
    indexModule.__setBuilderBridgeRunnerForTest(null);
    delete process.env.SPARK_NATURAL_ROUTE_LEDGER_PATH;
    delete process.env.SPARK_NATURAL_ROUTE_LEDGER;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('quoted browser computer-use notes preserve governed quoted-boundary route execution', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';
  process.env.SPARK_NATURAL_ROUTE_LEDGER = '1';

  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-browser-note-boundary-route-'));
  const naturalRouteLedgerPath = path.join(tempRoot, 'natural-route-ledger.jsonl');
  process.env.SPARK_NATURAL_ROUTE_LEDGER_PATH = naturalRouteLedgerPath;

  const indexModule: any = await import('../src/index');
  const llmModule = await import('../src/llm');
  const originalChat = llmModule.llm.chat;
  let bridgeCalls = 0;
  let capturedPrompt = '';

  indexModule.__setBuilderBridgeRunnerForTest(async () => {
    bridgeCalls += 1;
    return {
      used: true,
      responseText: 'I will open the browser and inspect localhost now.',
      decision: 'browser.open',
      bridgeMode: 'test',
      routingDecision: 'browser.open'
    };
  });
  llmModule.llm.chat = async (prompt: string) => {
    capturedPrompt = prompt;
    return 'That phrase is note text, not fresh browser authority. I would answer the risk and not open browser or inspect localhost from this turn.';
  };

  try {
    const text = 'The phrase "open browser and inspect localhost" appears in my notes. What risk does that create?';
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx(text, replies));

    assert.equal(bridgeCalls, 0);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /note text|not fresh browser authority|answer the risk/i);
    assert.match(replies[0], /not open browser|not .*inspect localhost/i);
    assert.doesNotMatch(replies[0], /inspect localhost now/i);
    assert.match(capturedPrompt, /conversation\.quoted_drafted_example_boundary/);
    assert.match(capturedPrompt, /Allowed tool: answer\.compose only/);

    const quotedBoundaryExecution = (record: any) => (
      record.shadow_route === 'conversation.quoted_drafted_example_boundary' &&
      record.executed_route === 'conversation.quoted_drafted_example_boundary'
    );
    const routeRecords = await waitForJsonlRecord(naturalRouteLedgerPath, quotedBoundaryExecution);
    const quotedRecord = routeRecords.find(quotedBoundaryExecution);
    assert.ok(
      quotedRecord,
      `quoted browser note must bind selected and executed route to the governed quoted-boundary route; records=${JSON.stringify(routeRecords)}`
    );
    assert.equal(quotedRecord.executed_owner, 'spark-telegram-bot');
    assert.equal(quotedRecord.executed_action, 'plain_chat.quoted_example_boundary');
    assert.equal(quotedRecord.outcome, 'matched');
  } finally {
    llmModule.llm.chat = originalChat;
    indexModule.__setBuilderBridgeRunnerForTest(null);
    delete process.env.SPARK_NATURAL_ROUTE_LEDGER_PATH;
    delete process.env.SPARK_NATURAL_ROUTE_LEDGER;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('publication approval-list boundary bypasses Builder bridge detours', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';

  const indexModule: any = await import('../src/index');
  let bridgeCalls = 0;

  indexModule.__setBuilderBridgeRunnerForTest(async () => {
    bridgeCalls += 1;
    return {
      used: true,
      responseText: 'I can help publish it now.',
      decision: 'plain_chat',
      bridgeMode: 'test',
      routingDecision: 'plain_chat'
    };
  });

  try {
    const text = 'I might ask you to publish later, but right now just list what would need approval.';
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx(text, replies));

    assert.equal(bridgeCalls, 0);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /approval-list question only/i);
    assert.match(replies[0], /No publish, deploy, PR, merge, registry, or production action/i);
    assert.doesNotMatch(replies[0], /publish it now/i);
  } finally {
    indexModule.__setBuilderBridgeRunnerForTest(null);
  }
});

test('browser/computer-use authorization boundary bypasses Builder bridge detours', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';

  const indexModule: any = await import('../src/index');
  let bridgeCalls = 0;

  indexModule.__setBuilderBridgeRunnerForTest(async () => {
    bridgeCalls += 1;
    return {
      used: true,
      responseText: 'I will use computer-use now.',
      decision: 'plain_chat',
      bridgeMode: 'test',
      routingDecision: 'plain_chat'
    };
  });

  try {
    const text = 'Do not use computer use. Tell me when computer use would be allowed.';
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx(text, replies));

    assert.equal(bridgeCalls, 0);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /Browser and computer-use should be authorized as tools/i);
    assert.match(replies[0], /stays chat-only/i);
    assert.match(replies[0], /No browser or computer-use tool is invoked/i);
    assert.doesNotMatch(replies[0], /use computer-use now/i);
  } finally {
    indexModule.__setBuilderBridgeRunnerForTest(null);
  }
});

test('old mission route bug boundary bypasses Builder bridge detours', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';

  const indexModule: any = await import('../src/index');
  let bridgeCalls = 0;

  indexModule.__setBuilderBridgeRunnerForTest(async () => {
    bridgeCalls += 1;
    return {
      used: true,
      responseText: 'I will launch a mission now.',
      decision: 'plain_chat',
      bridgeMode: 'test',
      routingDecision: 'plain_chat'
    };
  });

  try {
    const text = 'I am describing the old bug: Spark saw "mission" and launched. Do not reproduce it.';
    const replies: string[] = [];
    await indexModule.handleTextMessage(fakeCtx(text, replies));

    assert.equal(bridgeCalls, 0);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /route hijack/i);
    assert.match(replies[0], /Governor decision/i);
    assert.doesNotMatch(replies[0], /launch a mission now/i);
  } finally {
    indexModule.__setBuilderBridgeRunnerForTest(null);
  }
});

test('plain Builder replies drop voice media without delivery authorization', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';

  const indexModule: any = await import('../src/index');

  try {
    const replies: string[] = [];
    const mediaReplies = { voice: [] as unknown[], audio: [] as unknown[] };
    await indexModule.deliverBuilderReply(
      fakeCtx('Give me one short thought.', replies, mediaReplies),
      {
        used: true,
        responseText: 'Here is the text answer.',
        decision: 'plain_chat',
        bridgeMode: 'test',
        routingDecision: 'plain_chat',
        voiceMedia: {
          audioBase64: Buffer.from('synthetic-audio').toString('base64'),
          mimeType: 'audio/ogg',
          filename: 'reply.ogg',
          voiceCompatible: true,
          spokenText: 'Here is the text answer.'
        }
      }
    );

    assert.deepEqual(mediaReplies.voice, []);
    assert.deepEqual(mediaReplies.audio, []);
    assert.equal(replies.length, 1);
    assert.equal(replies[0], 'Here is the text answer.');
  } finally {
    indexModule.__setBuilderBridgeRunnerForTest(null);
  }
});

test('direct Builder delivery suppresses unproved completion claims and voice media', async () => {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'spark-direct-builder-claim-'));
  const auditPath = path.join(tempRoot, 'final-answer-gate-audit.jsonl');
  process.env.SPARK_FINAL_ANSWER_GATE_AUDIT_PATH = auditPath;

  const indexModule: any = await import('../src/index');

  try {
    const replies: string[] = [];
    const mediaReplies = { voice: [] as unknown[], audio: [] as unknown[] };
    await indexModule.deliverBuilderReply(
      fakeCtx('Recall the latest Day Triage app.', replies, mediaReplies),
      {
        used: true,
        responseText: [
          'I got this one finished for you.',
          'The Day Triage Button build is done.',
          'Open it here: http://127.0.0.1:3333/preview/day-triage-button/index.html'
        ].join('\n'),
        decision: 'plain_chat',
        bridgeMode: 'test',
        routingDecision: 'plain_chat',
        requestId: 'req-direct-builder-claim',
        traceRef: 'trace:req-direct-builder-claim',
        voiceMedia: {
          audioBase64: Buffer.from('synthetic-audio').toString('base64'),
          mimeType: 'audio/ogg',
          filename: 'reply.ogg',
          voiceCompatible: true,
          spokenText: 'The Day Triage Button build is done.'
        }
      },
      { allowVoiceMedia: true }
    );

    assert.deepEqual(mediaReplies.voice, []);
    assert.deepEqual(mediaReplies.audio, []);
    assert.equal(replies.length, 1);
    assert.match(replies[0], /I should not claim that work happened/i);
    assert.match(replies[0], /No files were changed, no mission was started, and no completion proof was found/i);
    assert.doesNotMatch(replies[0], /got this one finished/i);

    const records = await waitForJsonlRecord(
      auditPath,
      (record) => record.suppression_reason === 'unsupported_action_claim'
    );
    assert.ok(
      records.some((record) => (
        record.suppression_reason === 'unsupported_action_claim' &&
        record.builder_routing_decision === 'plain_chat' &&
        record.request_id === 'req-direct-builder-claim' &&
        record.trace_ref === 'trace:req-direct-builder-claim'
      )),
      'direct Builder delivery suppression must be audited with trace ids'
    );
  } finally {
    indexModule.__setBuilderBridgeRunnerForTest(null);
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
