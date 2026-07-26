import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.SPARK_BOT_TEST_MODE = '1';
process.env.BOT_TOKEN = process.env.BOT_TOKEN || '0:telegram-recursive-command-test';
process.env.ADMIN_TELEGRAM_IDS = '8319079055';
process.env.TELEGRAM_RELAY_SECRET = process.env.TELEGRAM_RELAY_SECRET || 'recursive-command-test-relay-secret-1234567890';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

function fakeCtx(text: string): any {
  const replies: string[] = [];
  return {
    replies,
    from: { id: 8319079055 },
    chat: { id: 8319079055 },
    message: { text },
    reply: async (message: string) => {
      replies.push(message);
    },
    sendChatAction: async () => {},
    telegram: {
      sendChatAction: async () => {},
      sendMessage: async (_chatId: number, message: string) => {
        replies.push(message);
      }
    }
  };
}

async function main(): Promise<void> {
  const {
    handleRecursiveCommand,
    parseNaturalRecursiveProposalIntent,
    renderTelegramStreamingEnvWithUpdates
  } = await import('../src/index');

  await test('natural recursive proposal intent keeps command language human', async () => {
    assert.deepEqual(
      parseNaturalRecursiveProposalIntent('prepare crypto trading for review in Spark Swarm'),
      { target: 'crypto-trading', submit: false }
    );
    assert.deepEqual(
      parseNaturalRecursiveProposalIntent('can we share Startup YC with the network review lane?'),
      { target: 'startup-yc', submit: true }
    );
    assert.deepEqual(
      parseNaturalRecursiveProposalIntent('propose an improvement to Spark Telegram memory source-lane handling so restart questions stay conversational'),
      { target: 'ad-hoc:spark-telegram-memory-source-lane-handling', submit: false }
    );
    assert.equal(parseNaturalRecursiveProposalIntent('what happened with crypto trading?'), null);
    assert.equal(parseNaturalRecursiveProposalIntent('should we propose an improvement to Spark Telegram memory later?'), null);
    assert.equal(parseNaturalRecursiveProposalIntent('the report says propose an improvement to Spark Telegram memory'), null);
  });

  await test('recursive command export renders help through command path', async () => {
    const ctx = fakeCtx('/recursive help');
    await handleRecursiveCommand(ctx);
    assert.match(ctx.replies.join('\n'), /\/recursive start <targetKey> rounds <n> - run an attached specialization path, with Builder chip fallback/);
  });

  await test('recursive command export validates start usage through command path', async () => {
    const ctx = fakeCtx('/recursive start');
    await handleRecursiveCommand(ctx);
    assert.equal(ctx.replies[0], 'Usage: /recursive start <targetKey> [rounds <n>]');
  });

  await test('global Telegram reply wrapper previews direct recursive replies', async () => {
    const source = readFileSync(path.join(process.cwd(), 'src', 'index.ts'), 'utf-8');
    const wrapperStart = source.indexOf('bot.use(async (ctx, next)');
    const wrapperEnd = source.indexOf('const userRequestTimestamps', wrapperStart);
    assert.notEqual(wrapperStart, -1);
    assert.notEqual(wrapperEnd, -1);
    const wrapperBlock = source.slice(wrapperStart, wrapperEnd);
    assert.match(wrapperBlock, /telegramDraftStreamAlreadyStarted\(ctx\)/);
    assert.match(wrapperBlock, /sanitizeAndSplitTelegramText\(text,\s*undefined,\s*\{\s*surface: telegramRenderSurfaceForTraceContext\(traceContext\)\s*\}\)/);
    assert.match(wrapperBlock, /replayTelegramDraftPreview\(ctx,\s*ctx\.telegram as any,\s*chunk,\s*process\.env,\s*\{\s*route: traceContext\?\.route\s*\}\)/);
    assert.match(wrapperBlock, /sendTelegramRichMessage\(ctx\.telegram as any,\s*ctx\.chat\?\.id,\s*chunk,\s*cleanExtra\)/);
  });

  await test('streamed chat replies do not replay a second draft preview at final send', async () => {
    const source = readFileSync(path.join(process.cwd(), 'src', 'index.ts'), 'utf-8');
    assert.match(source, /if \(await draftStreamer\.push\(partial\)\) \{\s*markTelegramDraftStreamStarted\(ctx\);/);

    const deliveryStart = source.indexOf('async function deliverBuilderReply');
    const deliveryEnd = source.indexOf('function isTelegramMessageTooLongError', deliveryStart);
    assert.notEqual(deliveryStart, -1);
    assert.notEqual(deliveryEnd, -1);
    const deliveryBlock = source.slice(deliveryStart, deliveryEnd);
    assert.doesNotMatch(deliveryBlock, /replayTelegramDraftPreview/);
    assert.match(deliveryBlock, /replyWithSanitizedTelegramText\(\s*ctx,\s*builderReply\.responseText,/);
    assert.match(deliveryBlock, /traceContext \? outboundTraceExtra\(traceContext\) : undefined/);
  });

  await test('streaming config persistence preserves profile env files', async () => {
    const next = renderTelegramStreamingEnvWithUpdates(
      [
        'SPARK_TELEGRAM_PROFILE=sparkqa-bot',
        'SPARK_TELEGRAM_CHAT_STREAMING=0',
        'TELEGRAM_RELAY_PORT=8791'
      ].join('\n'),
      [
        { key: 'SPARK_TELEGRAM_CHAT_STREAMING', value: '1' },
        { key: 'SPARK_TELEGRAM_RICH_MESSAGES', value: '1' },
        { key: 'SPARK_TELEGRAM_DRAFT_METHOD', value: 'rich' }
      ]
    );

    assert.match(next, /SPARK_TELEGRAM_PROFILE=sparkqa-bot/);
    assert.match(next, /SPARK_TELEGRAM_CHAT_STREAMING=1/);
    assert.match(next, /SPARK_TELEGRAM_RICH_MESSAGES=1/);
    assert.match(next, /SPARK_TELEGRAM_DRAFT_METHOD=rich/);
    assert.match(next, /TELEGRAM_RELAY_PORT=8791/);
    assert.doesNotMatch(next, /SPARK_TELEGRAM_CHAT_STREAMING=0/);
    assert.equal(next.endsWith('\n'), true);
  });

  await test('recursive async start paths record final Harness Core ledgers', async () => {
    const source = readFileSync(path.join(process.cwd(), 'src', 'index.ts'), 'utf-8');
    const loopCommandBlock = source.slice(
      source.indexOf('export async function handleLoopCommand'),
      source.indexOf("bot.command('loop'")
    );
    assert.match(loopCommandBlock, /status:\s*'partial'[\s\S]*Recursive chip loop .* started asynchronously/);
    assert.match(loopCommandBlock, /status:\s*'success'[\s\S]*completed \$\{result\.roundsCompleted\}\/\$\{result\.totalRounds\}/);
    assert.match(loopCommandBlock, /status:\s*'failure'[\s\S]*failed after asynchronous start/);
    assert.match(loopCommandBlock, /status:\s*'failure'[\s\S]*crashed after asynchronous start/);

    const recursiveHandlerStart = source.indexOf('export async function handleRecursiveCommand');
    assert.notEqual(recursiveHandlerStart, -1);
    const recursiveStartBranchStart = source.indexOf("if (parsed.action === 'start')", recursiveHandlerStart);
    const recursiveStartBranchEnd = source.indexOf('return ctx.reply(renderRecursiveHelp())', recursiveStartBranchStart);
    assert.notEqual(recursiveStartBranchStart, -1);
    assert.notEqual(recursiveStartBranchEnd, -1);
    const recursiveStartBlock = source.slice(recursiveStartBranchStart, recursiveStartBranchEnd);
    assert.match(recursiveStartBlock, /status:\s*'partial'[\s\S]*started asynchronously/);
    assert.match(recursiveStartBlock, /status:\s*'success'[\s\S]*completed successfully/);
    assert.match(recursiveStartBlock, /status:\s*'partial'[\s\S]*Workspace sync failed/);
    assert.match(recursiveStartBlock, /status:\s*'failure'[\s\S]*failed after asynchronous start/);
    assert.match(recursiveStartBlock, /status:\s*'failure'[\s\S]*crashed after asynchronous start/);
  });

  await test('recursive sessions report local Builder loops without Workspace credentials', async () => {
    const temp = mkdtempSync(path.join(tmpdir(), 'spark-recursive-local-'));
    const loopRoot = path.join(temp, 'loops');
    mkdirSync(loopRoot, { recursive: true });
    writeFileSync(path.join(loopRoot, 'domain-chip-creator.status.json'), JSON.stringify({
      chip_key: 'domain-chip-creator',
      rounds_completed: 1,
      total_rounds: 1,
      updated_at: '2099-05-08T13:53:36Z',
      history: [{
        round_index: 1,
        suggestions_count: 3,
        best_verdict: null,
        best_metric: 0
      }]
    }));
    writeFileSync(path.join(loopRoot, 'domain-chip-operations-watchdesk.status.json'), JSON.stringify({
      chip_key: 'domain-chip-operations-watchdesk',
      rounds_completed: 1,
      total_rounds: 1,
      updated_at: '2099-05-08T13:54:36Z',
      history: [{
        round_index: 1,
        suggestions_count: 3,
        best_verdict: 'defer',
        best_metric: 54
      }]
    }));

    const previousRoots = process.env.SPARK_RECURSIVE_LOCAL_STATUS_ROOTS;
    const previousWorkspaceId = process.env.SPARK_SWARM_WORKSPACE_ID;
    const previousAccessToken = process.env.SPARK_SWARM_ACCESS_TOKEN;
    const previousBuilderHome = process.env.SPARK_BUILDER_HOME;
    const previousBuilderRepo = process.env.SPARK_BUILDER_REPO;
    const previousDeployedWorkspaceId = process.env.SPARK_SWARM_DEPLOYED_WORKSPACE_ID;
    const previousDeployedAccessToken = process.env.SPARK_SWARM_DEPLOYED_ACCESS_TOKEN;
    const previousBearerToken = process.env.SPARK_SWARM_BEARER_TOKEN;
    process.env.SPARK_RECURSIVE_LOCAL_STATUS_ROOTS = loopRoot;
    process.env.SPARK_BUILDER_HOME = temp;
    process.env.SPARK_BUILDER_REPO = temp;
    delete process.env.SPARK_SWARM_WORKSPACE_ID;
    delete process.env.SPARK_SWARM_ACCESS_TOKEN;
    delete process.env.SPARK_SWARM_DEPLOYED_WORKSPACE_ID;
    delete process.env.SPARK_SWARM_DEPLOYED_ACCESS_TOKEN;
    delete process.env.SPARK_SWARM_BEARER_TOKEN;

    try {
      const sessionsCtx = fakeCtx('/recursive sessions');
      await handleRecursiveCommand(sessionsCtx);
      assert.match(sessionsCtx.replies.join('\n'), /Domain Chip Creator/);
      assert.match(sessionsCtx.replies.join('\n'), /Local\nstatus files on this machine/);
      assert.doesNotMatch(sessionsCtx.replies.join('\n'), /127\.0\.0\.1:4178/);

      const reportCtx = fakeCtx('/recursive report domain-chip-creator');
      await handleRecursiveCommand(reportCtx);
      assert.match(reportCtx.replies.join('\n'), /Domain Chip Creator finished 1\/1 round locally and held steady\./);
      assert.match(reportCtx.replies.join('\n'), /Spark drafted a possible improvement for this private workflow helper\. It has not been used, approved, or shared\./);
      assert.match(reportCtx.replies.join('\n'), /real self-improvement still needs a separate review on a multi-round trend/);
      assert.match(reportCtx.replies.join('\n'), /Saved locally\. Keep it private until the review gates pass\./);
      assert.doesNotMatch(reportCtx.replies.join('\n'), /^Score$/m);
      assert.doesNotMatch(reportCtx.replies.join('\n'), /^Workspace$/m);

      const latestReportCtx = fakeCtx('/recursive report latest');
      await handleRecursiveCommand(latestReportCtx);
      assert.match(latestReportCtx.replies.join('\n'), /I finished checking Domain Chip Operations Watchdesk locally\./);
      assert.match(latestReportCtx.replies.join('\n'), /Spark drafted a possible improvement for this private workflow helper\. It has not been used, approved, or shared\./);
      assert.match(latestReportCtx.replies.join('\n'), /I kept it private and made no changes\./);
      assert.doesNotMatch(latestReportCtx.replies.join('\n'), /improved/);

      const traceCtx = fakeCtx('/recursive trace domain-chip-creator');
      await handleRecursiveCommand(traceCtx);
      assert.match(traceCtx.replies.join('\n'), /Domain Chip Creator local trace/);
      assert.match(traceCtx.replies.join('\n'), /round 1: held steady, best score 0, 3 suggestions/);
    } finally {
      if (previousRoots === undefined) delete process.env.SPARK_RECURSIVE_LOCAL_STATUS_ROOTS;
      else process.env.SPARK_RECURSIVE_LOCAL_STATUS_ROOTS = previousRoots;
      if (previousWorkspaceId === undefined) delete process.env.SPARK_SWARM_WORKSPACE_ID;
      else process.env.SPARK_SWARM_WORKSPACE_ID = previousWorkspaceId;
      if (previousAccessToken === undefined) delete process.env.SPARK_SWARM_ACCESS_TOKEN;
      else process.env.SPARK_SWARM_ACCESS_TOKEN = previousAccessToken;
      if (previousBuilderHome === undefined) delete process.env.SPARK_BUILDER_HOME;
      else process.env.SPARK_BUILDER_HOME = previousBuilderHome;
      if (previousBuilderRepo === undefined) delete process.env.SPARK_BUILDER_REPO;
      else process.env.SPARK_BUILDER_REPO = previousBuilderRepo;
      if (previousDeployedWorkspaceId === undefined) delete process.env.SPARK_SWARM_DEPLOYED_WORKSPACE_ID;
      else process.env.SPARK_SWARM_DEPLOYED_WORKSPACE_ID = previousDeployedWorkspaceId;
      if (previousDeployedAccessToken === undefined) delete process.env.SPARK_SWARM_DEPLOYED_ACCESS_TOKEN;
      else process.env.SPARK_SWARM_DEPLOYED_ACCESS_TOKEN = previousDeployedAccessToken;
      if (previousBearerToken === undefined) delete process.env.SPARK_SWARM_BEARER_TOKEN;
      else process.env.SPARK_SWARM_BEARER_TOKEN = previousBearerToken;
      rmSync(temp, { recursive: true, force: true });
    }
  });

  await test('recursive command explains hosted workspace CLI-token read rejection', async () => {
    const server = createServer((req, res) => {
      if (req.url?.includes('/collective-snapshot')) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'authentication_required', message: 'authenticated session required' }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    const previousApiUrl = process.env.SPARK_SWARM_API_URL;
    const previousWorkspaceId = process.env.SPARK_SWARM_WORKSPACE_ID;
    const previousAccessToken = process.env.SPARK_SWARM_ACCESS_TOKEN;
    process.env.SPARK_SWARM_API_URL = `http://127.0.0.1:${address.port}`;
    process.env.SPARK_SWARM_WORKSPACE_ID = 'ws_test_recursive';
    process.env.SPARK_SWARM_ACCESS_TOKEN = 'sscli_v1_test';

    try {
      const ctx = fakeCtx('/recursive report path_builder_chip_startup_yc');
      await handleRecursiveCommand(ctx);
      assert.match(ctx.replies.join('\n'), /Workspace rejected this agent token/);
      assert.match(ctx.replies.join('\n'), /CLI-token collective-snapshot support/);
    } finally {
      if (previousApiUrl === undefined) delete process.env.SPARK_SWARM_API_URL;
      else process.env.SPARK_SWARM_API_URL = previousApiUrl;
      if (previousWorkspaceId === undefined) delete process.env.SPARK_SWARM_WORKSPACE_ID;
      else process.env.SPARK_SWARM_WORKSPACE_ID = previousWorkspaceId;
      if (previousAccessToken === undefined) delete process.env.SPARK_SWARM_ACCESS_TOKEN;
      else process.env.SPARK_SWARM_ACCESS_TOKEN = previousAccessToken;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  await test('recursive report accepts the numbered sessions picker', async () => {
    const server = createServer((req, res) => {
      if (req.url?.includes('/collective-snapshot')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          evolutionPaths: [
            {
              id: 'path-clear',
              scope: 'spark-intelligence-builder',
              specializationId: null,
              repoLabel: 'spark-intelligence-builder',
              summary: 'Clear builder loop',
              status: 'open',
              updatedAt: '2026-05-08T13:53:00Z'
            },
            {
              id: 'path-review',
              scope: 'startup-yc',
              specializationId: 'spec-yc',
              repoLabel: 'startup-yc',
              summary: 'Improve Startup YC on Startup Bench.',
              status: 'open',
              updatedAt: '2026-04-08T13:26:00Z'
            }
          ],
          specializations: [{ id: 'spec-yc', key: 'startup-yc', label: 'Startup YC' }],
          outcomes: [
            {
              id: 'out-review',
              targetType: 'evolution_path',
              targetId: 'path-review',
              verdict: 'flat',
              summary: 'Startup YC held steady.',
              metricName: 'scenario score',
              metricValue: 0.5,
              createdAt: '2026-05-08T13:46:00Z'
            }
          ],
          insights: [],
          masteries: [],
          artifactRefs: [],
          inbox: {
            items: [
              {
                id: 'decision-1',
                kind: 'rewrite_insight',
                title: 'Rewrite blocked insight',
                summary: 'Needs a rewrite.',
                targetType: 'evolution_path',
                targetId: 'path-review',
                specializationId: 'spec-yc',
                priority: 'high',
                recommendedAction: 'Rewrite in plain English.'
              }
            ]
          }
        }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    const previousApiUrl = process.env.SPARK_SWARM_API_URL;
    const previousWorkspaceId = process.env.SPARK_SWARM_WORKSPACE_ID;
    const previousAccessToken = process.env.SPARK_SWARM_ACCESS_TOKEN;
    process.env.SPARK_SWARM_API_URL = `http://127.0.0.1:${address.port}`;
    process.env.SPARK_SWARM_WORKSPACE_ID = 'ws_test_recursive';
    process.env.SPARK_SWARM_ACCESS_TOKEN = 'sscli_v1_test';

    try {
      const ctx = fakeCtx('/recursive report 1');
      await handleRecursiveCommand(ctx);
      const reply = ctx.replies.join('\n');
      assert.match(reply, /Startup YC/);
      assert.match(reply, /Review\n• 1 decision waiting/);
      assert.doesNotMatch(reply, /Clear builder loop/);
    } finally {
      if (previousApiUrl === undefined) delete process.env.SPARK_SWARM_API_URL;
      else process.env.SPARK_SWARM_API_URL = previousApiUrl;
      if (previousWorkspaceId === undefined) delete process.env.SPARK_SWARM_WORKSPACE_ID;
      else process.env.SPARK_SWARM_WORKSPACE_ID = previousWorkspaceId;
      if (previousAccessToken === undefined) delete process.env.SPARK_SWARM_ACCESS_TOKEN;
      else process.env.SPARK_SWARM_ACCESS_TOKEN = previousAccessToken;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  await test('recursive approve does not mutate unsupported Workspace decision targets', async () => {
    let mutationPosts = 0;
    const server = createServer((req, res) => {
      if (req.method === 'GET' && req.url?.includes('/collective-snapshot')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          evolutionPaths: [
            {
              id: 'path_domain_autoloop_crypto_trading',
              scope: 'workspace',
              specializationId: null,
              repoLabel: 'domain-autoloop',
              summary: 'Crypto trading autoloop state synced.',
              status: 'open',
              bestOutcomeId: null,
              updatedAt: '2026-05-08T02:50:00.000Z'
            }
          ],
          insights: [],
          masteries: [],
          outcomes: [],
          artifactRefs: [],
          specializations: [],
          inbox: {
            items: [
              {
                id: 'inbox_domain_autoloop_review',
                kind: 'review_outcome',
                title: 'Review domain autoloop lane evidence',
                summary: 'Needs Workspace review before any promotion.',
                targetType: 'evolution_path',
                targetId: 'path_domain_autoloop_crypto_trading',
                specializationId: null,
                repoId: null,
                priority: 'medium',
                recommendedAction: 'Open Workspace Decisions and inspect lane artifacts.'
              }
            ]
          }
        }));
        return;
      }
      if (req.method === 'POST') {
        mutationPosts += 1;
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'unexpected_mutation' }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    const previousApiUrl = process.env.SPARK_SWARM_API_URL;
    const previousWorkspaceId = process.env.SPARK_SWARM_WORKSPACE_ID;
    const previousAccessToken = process.env.SPARK_SWARM_ACCESS_TOKEN;
    const previousWebUrl = process.env.SPARK_SWARM_WEB_URL;
    process.env.SPARK_SWARM_API_URL = `http://127.0.0.1:${address.port}`;
    process.env.SPARK_SWARM_WORKSPACE_ID = 'ws_test_recursive';
    process.env.SPARK_SWARM_ACCESS_TOKEN = 'sscli_v1_test';
    process.env.SPARK_SWARM_WEB_URL = 'http://workspace.example.test';

    try {
      const ctx = fakeCtx('/recursive approve path_domain_autoloop_crypto_trading looks safe');
      await handleRecursiveCommand(ctx);
      const reply = ctx.replies.join('\n');
      assert.equal(mutationPosts, 0);
      assert.match(reply, /🟢 Recursive review approved\./);
      assert.match(reply, /Telegram recorded the decision route\./);
      assert.match(reply, /This item has to be handled in Workspace Decisions\./);
      assert.doesNotMatch(reply, /\/recursive report path_domain_autoloop_crypto_trading/);
      assert.match(reply, /http:\/\/workspace\.example\.test\/runs\?tab=decisions/);
      assert.doesNotMatch(reply, /Next:/);
      assert.doesNotMatch(reply, /workspace_route_only/);
    } finally {
      if (previousApiUrl === undefined) delete process.env.SPARK_SWARM_API_URL;
      else process.env.SPARK_SWARM_API_URL = previousApiUrl;
      if (previousWorkspaceId === undefined) delete process.env.SPARK_SWARM_WORKSPACE_ID;
      else process.env.SPARK_SWARM_WORKSPACE_ID = previousWorkspaceId;
      if (previousAccessToken === undefined) delete process.env.SPARK_SWARM_ACCESS_TOKEN;
      else process.env.SPARK_SWARM_ACCESS_TOKEN = previousAccessToken;
      if (previousWebUrl === undefined) delete process.env.SPARK_SWARM_WEB_URL;
      else process.env.SPARK_SWARM_WEB_URL = previousWebUrl;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
