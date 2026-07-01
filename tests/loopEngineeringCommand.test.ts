import assert from 'node:assert/strict';
import axios from 'axios';

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

const originalPost = axios.post;
const originalGet = axios.get;
const originalFetch = globalThis.fetch;
const originalEnv = {
  ADMIN_TELEGRAM_IDS: process.env.ADMIN_TELEGRAM_IDS,
  BOT_TOKEN: process.env.BOT_TOKEN,
  SPARK_AGENT_ACCESS_PROFILE: process.env.SPARK_AGENT_ACCESS_PROFILE,
  SPARK_BOT_TEST_MODE: process.env.SPARK_BOT_TEST_MODE,
  SPAWNER_UI_PUBLIC_URL: process.env.SPAWNER_UI_PUBLIC_URL,
  SPAWNER_UI_URL: process.env.SPAWNER_UI_URL
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function fakeCtx(text: string, replies: string[], ids = { chat: 8319079055, user: 8319079055, message: 9061 }) {
  const chat = { id: ids.chat, type: 'private' };
  const from = { id: ids.user, username: 'qa' };
  const message = { message_id: ids.message, text, chat, from };
  return {
    chat,
    from,
    message,
    update: { update_id: ids.message, message },
    sendChatAction: async (_action: string) => {},
    reply: async (reply: string) => {
      replies.push(reply);
    }
  };
}

function fakeCommandCtx(text: string, payload: string, replies: string[], ids = { chat: 8319079055, user: 8319079055, message: 9070 }) {
  return {
    ...fakeCtx(text, replies, ids),
    payload
  };
}

async function withLoopHandler() {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = '8319079055';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPAWNER_UI_URL = 'http://127.0.0.1:3333';
  process.env.SPAWNER_UI_PUBLIC_URL = 'http://127.0.0.1:3333';
  return import('../src/index');
}

function stubSpawner(calls: Array<{ url: string; body: any }>): void {
  (axios as any).get = async (url: string) => {
    if (url.includes('/api/loop-engineering/chips')) {
      return {
        data: {
          ok: true,
          registry: {
            chips: [
              {
                id: 'domain-chip-prd-writing-proof-loop',
                domain: 'PRD Writing',
                statusLabel: 'Private candidate',
                benchmark: { utilityDelta: 2.4 }
              },
              {
                id: 'domain-chip-b2c-reachout-drafting',
                domain: 'B2C Reachout Drafting',
                statusLabel: 'Blocked'
              }
            ]
          }
        }
      };
    }
    throw new Error(`unexpected get ${url}`);
  };
  (axios as any).post = async (url: string, body: unknown) => {
    calls.push({ url, body });
    if (url.includes('/benchmarks/run')) {
      if ((body as any)?.executeNow === true) {
        return {
          data: {
            ok: true,
            commandResult: {
              action: 'benchmark_run_executed',
              missionId: 'spark-loop-benchmark',
              eventId: 'lee-benchmark-prd',
              benchmarkRunId: 'benchrun-lee-benchmark-prd',
              previousScore: 5.8,
              candidateScore: 8.3,
              utilityDelta: 2.5,
              caseCount: 2,
              inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
              userMessage: 'Ran 2 private benchmark cases for domain-chip-prd-writing-proof-loop: 5.8 -> 8.3. This is evaluator evidence for review, not activation.'
            }
          }
        };
      }
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'benchmark_run_queued',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Queued a private benchmark mission for domain-chip-prd-writing-proof-loop. It can produce evidence, but it does not approve activation or claim improvement by itself.'
          }
        }
      };
    }
    if (url.includes('/loops/run')) {
      if ((body as any)?.executeNow === true) {
        return {
          data: {
            ok: true,
            commandResult: {
              action: 'loop_run_executed',
              missionId: 'spark-loop-prd-executed',
              eventId: 'lee-loop-prd-executed',
              loopRunId: 'looprun-lee-loop-prd-executed',
              previousScore: 4.3,
              candidateScore: 9.7,
              utilityDelta: 5.4,
              caseCount: 1,
              roundsObserved: 3,
              inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
              userMessage: 'Ran 3 private loop rounds for domain-chip-prd-writing-proof-loop on 1 case: 4.3 -> 9.7. This is evaluator evidence for distillation review, not activation.'
            }
          }
        };
      }
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'loop_run_queued',
            missionId: 'spark-loop-prd',
            eventId: 'lee-loop-prd',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Queued a capped private loop for domain-chip-prd-writing-proof-loop. It still needs separated evaluator evidence before any improvement claim or activation.'
          }
        }
      };
    }
    if (url.includes('/evaluator-review')) {
      return {
        data: {
          ok: true,
          event: { id: 'lee-evaluator-prd', eventType: 'evaluator_review', status: 'passed' },
          commandResult: {
            action: 'evaluator_review_recorded',
            eventId: 'lee-evaluator-prd',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Recorded separated evaluator evidence for domain-chip-prd-writing-proof-loop: 6.0 -> 8.4. This can support distillation, but it does not activate the chip.'
          }
        }
      };
    }
    if (url.includes('/events/') && url.includes('/complete')) {
      return {
        data: {
          ok: true,
          event: { id: 'lee-loop-prd', eventType: 'loop_batch', status: 'passed' },
          commandResult: {
            action: 'run_completion_bound',
            eventId: 'lee-loop-prd',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Bound evaluator-backed completion for domain-chip-prd-writing-proof-loop. The run is recorded as passed, but activation still needs staged approval.'
          }
        }
      };
    }
    if (url.includes('/distill')) {
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'distillation_staged',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Distilled 1 evaluator-backed lesson for domain-chip-prd-writing-proof-loop. They are staged for future PRDs, not globally activated.'
          }
        }
      };
    }
    if (url.includes('/benchmarks/cases')) {
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'benchmark_case_added',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Staged a private trap benchmark case for domain-chip-prd-writing-proof-loop. No benchmark run or activation started.'
          }
        }
      };
    }
    if (url.includes('/schedules/') && url.includes('/fire')) {
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'schedule_loop_queued',
            eventId: 'lee-scheduled-loop',
            missionId: 'spark-loop-scheduled',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Fired PRD Writing scheduled loop as a private capped loop. No recurring timer was enabled and evaluator scoring is still required.'
          }
        }
      };
    }
    if (url.includes('/schedules/') && url.includes('/lifecycle')) {
      return {
        data: {
          ok: true,
          schedule: { id: 'loopsched-prd', status: (body as any)?.action === 'cancel' ? 'cancelled' : 'paused', active: false },
          event: { id: 'lee-schedule-lifecycle', eventType: 'schedule_lifecycle', status: 'passed' },
          commandResult: {
            action: `schedule_${(body as any)?.action}`,
            eventId: 'lee-schedule-lifecycle',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: `Updated the private PRD Writing schedule: ${(body as any)?.action}.`
          }
        }
      };
    }
    if (url.includes('/schedules')) {
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'schedule_created',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Staged a private loop schedule for domain-chip-prd-writing-proof-loop with a 3-round cap. It is not active and no loop started.'
          }
        }
      };
    }
    if (url.includes('/activation')) {
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'activation_requested',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Staged suggested activation for PRD Writing requests. It is not active yet and nothing was published.'
          }
        }
      };
    }
    throw new Error(`unexpected url ${url}`);
  };
}

async function run(): Promise<void> {
  await test('/loop list discovers Loop Engineering chips without mutations', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop list', replies));

    assert.equal(calls.length, 0);
    assert.match(replies[0], /Loop Engineering chips I can see \(2\)/);
    assert.match(replies[0], /PRD Writing: domain-chip-prd-writing-proof-loop/);
    assert.match(replies[0], /Ask `\/loop status <chip key>`/);
    assert.doesNotMatch(replies[0], /queued|started|activated|published/i);
  });

  await test('/loop status reads Spawner evidence packet without mutations', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      assert.match(url, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop$/);
      return Response.json({
        ok: true,
        chip: {
          summary: {
            id: 'domain-chip-prd-writing-proof-loop',
            domain: 'PRD Writing',
            activation: { liveTelegramProven: false }
          },
          readiness: {
            label: 'Private candidate',
            passCount: 7,
            totalCount: 10,
            nextAction: 'Run live Telegram proof.',
            checks: [
              { id: 'live_telegram_proof', label: 'Live Telegram proof', status: 'blocked', detail: 'missing', evidenceRefs: [] }
            ]
          },
          events: [
            {
              eventType: 'evaluator_review',
              label: 'Separated evaluator review',
              status: 'passed',
              previousScore: 6,
              candidateScore: 8.4,
              utilityDelta: 2.4,
              roundsObserved: 3,
              evaluatorSeparated: true,
              nextAction: 'Distill accepted lessons.'
            }
          ]
        }
      }) as any;
    };

    try {
      await indexModule.handleLoopCommand(fakeCtx('/loop status domain-chip-prd-writing-proof-loop', replies, { chat: 8319079055, user: 8319079055, message: 9060 }));
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(calls.length, 0);
    assert.match(replies[0], /PRD Writing is private candidate/i);
    assert.match(replies[0], /7\/10 checks pass/);
    assert.match(replies[0], /Separated evaluator review passed/);
    assert.match(replies[0], /Details: http:\/\/127\.0\.0\.1:3333\/loop-engineering\/domain-chip-prd-writing-proof-loop/);
    assert.match(replies[0], /I only read Spawner here; no loop, benchmark, schedule, activation, or publication was queued\./);
    assert.doesNotMatch(replies[0], /\b(?:started|activated|published)\b/i);
  });

  await test('/loop status honors Telegraf payload args from live command handling', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      assert.match(url, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop$/);
      return Response.json({
        ok: true,
        chip: {
          summary: {
            id: 'domain-chip-prd-writing-proof-loop',
            domain: 'PRD Writing',
            activation: { liveTelegramProven: false }
          },
          readiness: {
            label: 'Private candidate',
            passCount: 8,
            totalCount: 10,
            nextAction: 'Run live Telegram proof.',
            checks: []
          },
          events: []
        }
      }) as any;
    };

    try {
      await indexModule.handleLoopCommand(fakeCommandCtx('/loop', 'status domain-chip-prd-writing-proof-loop', replies, { chat: 8319079055, user: 8319079055, message: 9070 }));
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(calls.length, 0);
    assert.match(replies[0], /PRD Writing is private candidate/i);
    assert.doesNotMatch(replies[0], /Usage:|Starting autoloop/i);
  });

  await test('/loop status strips bot username before parsing live command text', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];
    globalThis.fetch = async () => Response.json({
      ok: true,
      chip: {
        summary: {
          id: 'domain-chip-prd-writing-proof-loop',
          domain: 'PRD Writing',
          activation: { liveTelegramProven: false }
        },
        readiness: {
          label: 'Private candidate',
          passCount: 8,
          totalCount: 10,
          nextAction: 'Run live Telegram proof.',
          checks: []
        },
        events: []
      }
    }) as any;

    try {
      await indexModule.handleLoopCommand(fakeCtx('/loop@SparkRecursive_bot status domain-chip-prd-writing-proof-loop', replies, { chat: 8319079055, user: 8319079055, message: 9071 }));
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(calls.length, 0);
    assert.match(replies[0], /PRD Writing is private candidate/i);
    assert.doesNotMatch(replies[0], /Usage:|Starting autoloop/i);
  });

  await test('/loop benchmark queues private benchmark through Spawner command-result payload', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop benchmark domain-chip-prd-writing-proof-loop', replies));

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/benchmarks\/run$/);
    assert.equal(calls[0].body.executeNow, undefined);
    assert.equal(calls[0].body.sourceSurface, 'telegram');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.benchmark.run');
    assert.match(replies[0], /Queued a private benchmark mission/);
    assert.match(replies[0], /Spawner: http:\/\/127\.0\.0\.1:3333\/loop-engineering\/domain-chip-prd-writing-proof-loop/);
    assert.doesNotMatch(replies[0], /approved|activated|published/i);
  });

  await test('/loop benchmark now executes staged private benchmark through Spawner', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop benchmark domain-chip-prd-writing-proof-loop now', replies, { chat: 8319079055, user: 8319079055, message: 9072 }));

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/benchmarks\/run$/);
    assert.equal(calls[0].body.executeNow, true);
    assert.equal(calls[0].body.sourceSurface, 'telegram');
    assert.match(calls[0].body.objective, /Execute staged benchmark cases/);
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.benchmark.run');
    assert.match(replies[0], /Ran 2 private benchmark cases/);
    assert.match(replies[0], /evaluator evidence for review, not activation/i);
    assert.match(replies[0], /Spawner: http:\/\/127\.0\.0\.1:3333\/loop-engineering\/domain-chip-prd-writing-proof-loop/);
    assert.doesNotMatch(replies[0], /approved|published/i);
  });

  await test('/loop benchmark now can execute selected clean benchmark cases only', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop benchmark domain-chip-prd-writing-proof-loop now case benchcase-clean-prd-001,benchcase-clean-prd-002', replies, { chat: 8319079055, user: 8319079055, message: 9073 }));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.executeNow, true);
    assert.deepEqual(calls[0].body.benchmarkCaseIds, ['benchcase-clean-prd-001', 'benchcase-clean-prd-002']);
    assert.match(replies[0], /Ran 2 private benchmark cases/);
    assert.doesNotMatch(replies[0], /approved|published/i);
  });

  await test('/loop benchmark execute aliases explicitly execute staged private benchmark', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();

    for (const alias of ['execute', 'run', 'score']) {
      const replies: string[] = [];
      await indexModule.handleLoopCommand(fakeCtx(`/loop benchmark domain-chip-prd-writing-proof-loop ${alias}`, replies, { chat: 8319079055, user: 8319079055, message: 9080 + calls.length }));
      assert.match(replies[0], /evaluator evidence for review, not activation/i);
    }

    assert.equal(calls.length, 3);
    for (const call of calls) {
      assert.equal(call.body.executeNow, true);
      assert.equal(call.body.sourceSurface, 'telegram');
      assert.equal(call.body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.benchmark.run');
      assert.equal(call.body.executionAuthority.tool_ledgers[0].authorization.restrictions.write_allowed, true);
      assert.equal(call.body.executionAuthority.tool_ledgers[0].authorization.restrictions.network_allowed, false);
      assert.equal(call.body.executionAuthority.tool_ledgers[0].authorization.restrictions.publish_allowed, false);
    }
  });

  await test('/loop run queues capped private loop rounds through Spawner command-result payload', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop run domain-chip-prd-writing-proof-loop 5', replies, { chat: 8319079055, user: 8319079055, message: 9069 }));

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/loops\/run$/);
    assert.equal(calls[0].body.sourceSurface, 'telegram');
    assert.equal(calls[0].body.roundLimit, 5);
    assert.equal(calls[0].body.executeNow, undefined);
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.loop.run');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].authorization.restrictions.write_allowed, true);
    assert.match(replies[0], /Queued a capped private loop/);
    assert.match(replies[0], /separated evaluator evidence/i);
    assert.match(replies[0], /Spawner: http:\/\/127\.0\.0\.1:3333\/loop-engineering\/domain-chip-prd-writing-proof-loop/);
    assert.doesNotMatch(replies[0], /approved|activated|published/i);
  });

  await test('/loop run now executes selected clean benchmark cases through Spawner', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop run domain-chip-prd-writing-proof-loop 3 now case benchcase-clean-prd-001', replies, { chat: 8319079055, user: 8319079055, message: 9074 }));

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/loops\/run$/);
    assert.equal(calls[0].body.executeNow, true);
    assert.equal(calls[0].body.roundLimit, 3);
    assert.deepEqual(calls[0].body.benchmarkCaseIds, ['benchcase-clean-prd-001']);
    assert.equal(calls[0].body.sourceSurface, 'telegram');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.loop.run');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].authorization.restrictions.write_allowed, true);
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].authorization.restrictions.network_allowed, false);
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].authorization.restrictions.publish_allowed, false);
    assert.match(replies[0], /Ran 3 private loop rounds/);
    assert.match(replies[0], /evaluator evidence for distillation review, not activation/i);
    assert.doesNotMatch(replies[0], /approved|published/i);
  });

  await test('/loop run now rejects malformed explicit benchmark case scope without widening', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop run domain-chip-prd-writing-proof-loop 3 now case typo', replies, { chat: 8319079055, user: 8319079055, message: 9075 }));

    assert.equal(calls.length, 0);
    assert.match(replies[0], /case scope is not valid/i);
    assert.doesNotMatch(replies[0], /Ran|Queued|activated|published/i);
  });

  await test('/loop run now refuses success without execution proof ids', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    (axios as any).post = async (url: string, body: unknown) => {
      calls.push({ url, body });
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'loop_run_executed',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Ran 3 private loop rounds for domain-chip-prd-writing-proof-loop.'
          }
        }
      };
    };
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop run domain-chip-prd-writing-proof-loop 3 now case benchcase-clean-prd-001', replies, { chat: 8319079055, user: 8319079055, message: 9076 }));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.executeNow, true);
    assert.match(replies[0], /did not accept/i);
    assert.match(replies[0], /Reason: Spawner did not return loop execution proof/i);
    assert.doesNotMatch(replies[0], /Ran 3 private loop rounds/i);
    assert.match(replies[0], /Nothing was activated or published/i);
  });

  await test('/loop benchmark now refuses success without execution proof ids', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    (axios as any).post = async (url: string, body: unknown) => {
      calls.push({ url, body });
      return {
        data: {
          ok: true,
          commandResult: {
            action: 'benchmark_run_executed',
            missionId: 'spark-loop-benchmark',
            eventId: 'lee-benchmark-prd',
            inspectUrl: '/loop-engineering/domain-chip-prd-writing-proof-loop',
            userMessage: 'Ran 1 private benchmark case for domain-chip-prd-writing-proof-loop.'
          }
        }
      };
    };
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop benchmark domain-chip-prd-writing-proof-loop now case benchcase-clean-prd-001', replies, { chat: 8319079055, user: 8319079055, message: 9077 }));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.executeNow, true);
    assert.match(replies[0], /did not accept/i);
    assert.match(replies[0], /Reason: Spawner did not return benchmark execution proof/i);
    assert.doesNotMatch(replies[0], /Ran 1 private benchmark case/i);
    assert.match(replies[0], /Nothing was activated or published/i);
  });

  await test('/loop eval, distill, and activate drive PRD Writing evidence chain through Spawner', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop eval domain-chip-prd-writing-proof-loop 6.0 8.4 rounds 3 evidence reports/prd-eval.json', replies, { chat: 8319079055, user: 8319079055, message: 9062 }));
    await indexModule.handleLoopCommand(fakeCtx('/loop distill domain-chip-prd-writing-proof-loop from lee-evaluator-prd lesson Resolve user, owner, success metric, and acceptance criteria first.', replies, { chat: 8319079055, user: 8319079055, message: 9063 }));
    await indexModule.handleLoopCommand(fakeCtx('/loop activate domain-chip-prd-writing-proof-loop use-case PRD Writing requests trigger write a PRD rollback reports/prd-writing-rollback.json', replies, { chat: 8319079055, user: 8319079055, message: 9064 }));

    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /\/evaluator-review$/);
    assert.equal(calls[0].body.evaluatorSeparated, true);
    assert.deepEqual(calls[0].body.evidenceRefs, ['reports/prd-eval.json']);
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.evaluator_review.record');
    assert.match(calls[1].url, /\/distill$/);
    assert.equal(calls[1].body.sourceEvaluatorEventId, 'lee-evaluator-prd');
    assert.equal(calls[1].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.distill.stage');
    assert.match(calls[2].url, /\/activation$/);
    assert.equal(calls[2].body.useCase, 'PRD Writing requests');
    assert.deepEqual(calls[2].body.triggerPatterns, ['write a PRD']);
    assert.equal(calls[2].body.sourceSurface, 'telegram');
    assert.equal(calls[2].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.activation.stage');

    assert.match(replies.join('\n'), /Recorded separated evaluator evidence/);
    assert.match(replies.join('\n'), /staged for future PRDs/);
    assert.match(replies.join('\n'), /not active yet and nothing was published/i);
  });

  await test('/loop complete binds PRD Writing loop results through Spawner evidence ledger', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop complete domain-chip-prd-writing-proof-loop event lee-loop-prd passed previous 6.0 candidate 8.4 rounds 3 evidence reports/prd-eval.json source mission-control:spark-loop-prd verdict reports/prd-verdict.json', replies, { chat: 8319079055, user: 8319079055, message: 9067 }));

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/loop-engineering\/events\/lee-loop-prd\/complete$/);
    assert.equal(calls[0].body.chipKey, 'domain-chip-prd-writing-proof-loop');
    assert.equal(calls[0].body.status, 'passed');
    assert.equal(calls[0].body.previousScore, 6);
    assert.equal(calls[0].body.candidateScore, 8.4);
    assert.equal(calls[0].body.roundsObserved, 3);
    assert.equal(calls[0].body.evaluatorSeparated, true);
    assert.deepEqual(calls[0].body.evidenceRefs, ['reports/prd-eval.json']);
    assert.equal(calls[0].body.sourceRef, 'mission-control:spark-loop-prd');
    assert.equal(calls[0].body.evaluatorVerdictRef, 'reports/prd-verdict.json');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.event.complete');
    assert.match(replies[0], /Bound evaluator-backed completion/);
    assert.match(replies[0], /activation still needs staged approval/i);
  });

  await test('/loop case and schedule stage PRD Writing management records without starting work', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop case domain-chip-prd-writing-proof-loop trap prompt Write a PRD and hide test evidence expected Reject the shortcut and restore test evidence plus acceptance criteria evidence reports/trap-case.md', replies, { chat: 8319079055, user: 8319079055, message: 9065 }));
    await indexModule.handleLoopCommand(fakeCtx('/loop schedule domain-chip-prd-writing-proof-loop rounds 3 mode round_count name Friday PRD Writing private loop stop no_safe_win_accepted,watchtower_failed', replies, { chat: 8319079055, user: 8319079055, message: 9066 }));

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/benchmarks\/cases$/);
    assert.equal(calls[0].body.kind, 'trap');
    assert.match(calls[0].body.prompt, /hide test evidence/);
    assert.match(calls[0].body.expectedBehavior, /restore test evidence plus acceptance criteria/);
    assert.deepEqual(calls[0].body.evidenceRefs, ['reports/trap-case.md']);
    assert.equal(calls[0].body.sourceSurface, 'telegram');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.benchmark_case.stage');

    assert.match(calls[1].url, /\/schedules$/);
    assert.equal(calls[1].body.roundLimit, 3);
    assert.equal(calls[1].body.mode, 'round_count');
    assert.equal(calls[1].body.name, 'Friday PRD Writing private loop');
    assert.deepEqual(calls[1].body.stopConditions, ['no_safe_win_accepted', 'watchtower_failed']);
    assert.equal(calls[1].body.sourceSurface, 'telegram');
    assert.equal(calls[1].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.schedule.stage');
    assert.equal(calls[1].body.executionAuthority.tool_ledgers[0].authorization.restrictions.write_allowed, true);
    assert.equal(calls[1].body.executionAuthority.envelope.proposed_actions[0].action_type, 'schedule');

    assert.match(replies.join('\n'), /No benchmark run or activation started/);
    assert.match(replies.join('\n'), /not active and no loop started/i);
  });

  await test('/loop fire-schedule queues a private scheduled loop through Spawner', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop fire-schedule domain-chip-prd-writing-proof-loop loopsched-prd', replies, { chat: 8319079055, user: 8319079055, message: 9068 }));

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/schedules\/loopsched-prd\/fire$/);
    assert.equal(calls[0].body.sourceSurface, 'telegram');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.schedule.fire');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].authorization.restrictions.write_allowed, true);
    assert.match(replies[0], /private capped loop/);
    assert.match(replies[0], /evaluator scoring is still required/i);
  });

  await test('/loop schedule-lifecycle pauses private schedules through Spawner', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop schedule-lifecycle domain-chip-prd-writing-proof-loop loopsched-prd pause', replies, { chat: 8319079055, user: 8319079055, message: 9078 }));

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/schedules\/loopsched-prd\/lifecycle$/);
    assert.equal(calls[0].body.action, 'pause');
    assert.equal(calls[0].body.sourceSurface, 'telegram');
    assert.equal(calls[0].body.executionAuthority.schema_version, 'governor-decision-v1');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.schedule.pause');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].authorization.restrictions.write_allowed, true);
    assert.match(replies[0], /Updated the private PRD Writing schedule: pause/);
  });

  await test('/loop cancel-schedule uses delete-schedule authority through Spawner lifecycle', async () => {
    restoreEnv();
    const calls: Array<{ url: string; body: any }> = [];
    stubSpawner(calls);
    const indexModule: any = await withLoopHandler();
    const replies: string[] = [];

    await indexModule.handleLoopCommand(fakeCtx('/loop cancel-schedule domain-chip-prd-writing-proof-loop loopsched-prd', replies, { chat: 8319079055, user: 8319079055, message: 9079 }));

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/loop-engineering\/chips\/domain-chip-prd-writing-proof-loop\/schedules\/loopsched-prd\/lifecycle$/);
    assert.equal(calls[0].body.action, 'cancel');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].tool_name, 'spawner.loop_engineering.schedule.cancel');
    assert.equal(calls[0].body.executionAuthority.envelope.proposed_actions[0].action_type, 'schedule');
    assert.equal(calls[0].body.executionAuthority.tool_ledgers[0].authorization.restrictions.write_allowed, true);
    assert.match(replies[0], /Updated the private PRD Writing schedule: cancel/);
  });
}

run().finally(() => {
  (axios as any).post = originalPost;
  (axios as any).get = originalGet;
  globalThis.fetch = originalFetch;
  restoreEnv();
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
