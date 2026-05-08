import assert from 'node:assert/strict';
import { createServer } from 'node:http';

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
  const { handleRecursiveCommand } = await import('../src/index');

  await test('recursive command export renders help through command path', async () => {
    const ctx = fakeCtx('/recursive help');
    await handleRecursiveCommand(ctx);
    assert.match(ctx.replies.join('\n'), /\/recursive start <targetKey> rounds <n> - run another loop/);
  });

  await test('recursive command export validates start usage through command path', async () => {
    const ctx = fakeCtx('/recursive start');
    await handleRecursiveCommand(ctx);
    assert.equal(ctx.replies[0], 'Usage: /recursive start <targetKey> [rounds <n>]');
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
      assert.match(reply, /Decision not applied in Telegram: approved\./);
      assert.match(reply, /Status: This item has to be handled in Workspace Decisions\./);
      assert.match(reply, /2\. \/recursive report path_domain_autoloop_crypto_trading/);
      assert.match(reply, /http:\/\/workspace\.example\.test\/runs\?tab=decisions/);
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
