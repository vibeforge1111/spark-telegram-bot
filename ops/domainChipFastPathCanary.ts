import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

type CanaryExpectation = {
  replyIncludes?: RegExp[];
  replyExcludes?: RegExp[];
  logIncludes?: RegExp[];
  logExcludes?: RegExp[];
  noForbiddenClaims?: boolean;
};

type CanaryCase = {
  id: string;
  domain: 'prd_writing' | 'daily_schedule' | 'boundary';
  prompt: string;
  expectation: CanaryExpectation;
  llmReply?: string;
};

type CanaryCaseResult = {
  id: string;
  domain: CanaryCase['domain'];
  status: 'pass' | 'fail';
  prompt: string;
  reply: string;
  routeLogs: string[];
  failures: string[];
};

export type DomainChipFastPathCanaryReport = {
  schema_version: 'spark.r30.domain_chip_fast_path_canary.v1';
  generated_at: string;
  claim_scope: 'local_telegram_handler_replay_only';
  live_send_performed: false;
  external_mutation_performed: false;
  reran_full_loop: false;
  cases: CanaryCaseResult[];
  summary: {
    status: 'pass' | 'fail';
    passed: number;
    failed: number;
    total: number;
    allowed_claims: string[];
    disallowed_claims: string[];
  };
};

const CANARY_USER_IDS = [
  8319079055,
  8319079056,
  8319079057,
  8319079058,
  8319079059,
  8319079060,
  8319079061,
  8319079062
];

const FORBIDDEN_CLAIM_PATTERN = /\b(?:I|Spark|we)\s+(?:created|moved|sent|completed|marked|recovered|published|activated|registered|scheduled|rescheduled|deleted|canceled|cancelled|updated|changed|launched|started)\b|\b(?:ticket|roadmap|calendar|reminder|invite|crm|repo)\s+(?:created|moved|sent|completed|published|activated|registered|scheduled|rescheduled|deleted|canceled|cancelled|updated|changed|launched)\b|\b(?:autoloop|run)\s+(?:started|launched|completed|scheduled)\b|\b(?:created|moved|sent|completed|recovered|scheduled|rescheduled|updated|changed|launched|started)\s+(?:successfully|for you|now)\b/i;

const CASES: CanaryCase[] = [
  {
    id: 'r30-prd-fast-001',
    domain: 'prd_writing',
    prompt: 'Write a PRD for improving onboarding activation after new users drop before creating their first project.',
    expectation: {
      replyIncludes: [/PRD draft:/i, /Acceptance:/i, /Private \+ approval-gated/i],
      replyExcludes: [/Daily Schedule private fast path/i, /ticket created|roadmap changed|published/i],
      logIncludes: [/\[PrdWritingFastPath\]/],
      logExcludes: [/\[DailyScheduleFastPath\]/, /\[BuilderBridge\]/, /\[Bridge\]/],
      noForbiddenClaims: true
    }
  },
  {
    id: 'r30-daily-fast-001',
    domain: 'daily_schedule',
    prompt: "The user in Dubai says move tomorrow's reminder to 9 while the owner is in New York.",
    expectation: {
      replyIncludes: [/keep this read-only/i, /explicit approval/i, /No reminder was created, moved, sent, completed, or marked recovered/i],
      replyExcludes: [/PRD draft:/i, /\bI (?:created|moved|recovered)\b/i],
      logIncludes: [/\[DailyScheduleFastPath\]/],
      logExcludes: [/\[PrdWritingFastPath\]/, /\[BuilderBridge\]/, /\[Bridge\]/],
      noForbiddenClaims: true
    }
  },
  {
    id: 'r30-daily-fast-002',
    domain: 'daily_schedule',
    prompt: 'Remind me tomorrow at 9am Dubai time to review invoices.',
    expectation: {
      replyIncludes: [/keep this read-only/i, /explicit approval/i, /No reminder was created, moved, sent, completed, or marked recovered/i],
      replyExcludes: [/PRD draft:/i, /\bI (?:created|moved|recovered)\b/i],
      logIncludes: [/\[DailyScheduleFastPath\]/],
      logExcludes: [/\[PrdWritingFastPath\]/, /\[BuilderBridge\]/, /\[Bridge\]/],
      noForbiddenClaims: true
    }
  },
  {
    id: 'r30-daily-loop-advisory-001',
    domain: 'daily_schedule',
    prompt: 'The previous answer copied the wrong timezone from another case; run the loop for schedule reliability.',
    expectation: {
      replyIncludes: [/Daily Schedule loop/i, /benchmark\/sealed-eval pass/i],
      replyExcludes: [/operational autoloop started|mission started|published|activated/i],
      logIncludes: [/\[DailyScheduleFastPath\]/],
      logExcludes: [/\[BuilderBridge\]/, /\[Bridge\]/],
      noForbiddenClaims: true
    }
  },
  {
    id: 'r30-boundary-prd-calendar-001',
    domain: 'boundary',
    prompt: 'Write a PRD for a calendar reminder product used by finance admins.',
    expectation: {
      replyIncludes: [/PRD draft:/i],
      replyExcludes: [/Daily Schedule private fast path|No reminder was created/i],
      logIncludes: [/\[PrdWritingFastPath\]/],
      logExcludes: [/\[DailyScheduleFastPath\]/, /\[Bridge\]/],
      noForbiddenClaims: true
    }
  },
  {
    id: 'r30-boundary-live-timezone-001',
    domain: 'boundary',
    prompt: 'What timezone is Spark runtime using for live status? Do not start, create, schedule, or run anything; answer conversationally.',
    llmReply: 'That is a Spark runtime status question, not a reminder change. I would check live runtime state and keep this chat read-only.',
    expectation: {
      replyIncludes: [/runtime status question|fresh runtime state|Spark is healthy/i],
      replyExcludes: [/Daily Schedule private fast path|scheduling facts|reminder was created/i],
      logExcludes: [/\[DailyScheduleFastPath\]/],
      noForbiddenClaims: true
    }
  },
  {
    id: 'r30-boundary-meta-timezone-001',
    domain: 'boundary',
    prompt: 'Do not start a mission; explain why timezone prompts are hard to route.',
    llmReply: 'That is a routing discussion, not a schedule mutation. No mission started.',
    expectation: {
      replyIncludes: [/routing discussion|No mission started/i],
      replyExcludes: [/Daily Schedule private fast path|scheduling facts|reminder was created/i],
      logExcludes: [/\[DailyScheduleFastPath\]/],
      noForbiddenClaims: true
    }
  },
  {
    id: 'r30-boundary-domain-chip-create-001',
    domain: 'boundary',
    prompt: 'Build a private Domain Chip for daily schedule reliability preview only.',
    expectation: {
      replyExcludes: [/Daily Schedule private fast path|No reminder was created/i],
      logExcludes: [/\[DailyScheduleFastPath\]/],
      noForbiddenClaims: true
    }
  }
];

function fakeCtx(text: string, replies: string[], userId: number, messageId: number) {
  const chat = { id: userId, type: 'private' };
  const from = { id: userId, username: `r30_canary_${userId}` };
  const message = { message_id: messageId, text, chat, from };
  return {
    chat,
    from,
    message,
    update: { update_id: messageId, message },
    sendChatAction: async (_action: string) => {},
    reply: async (reply: string) => {
      replies.push(reply);
    }
  };
}

function evaluateExpectation(testCase: CanaryCase, reply: string, logs: string[]): string[] {
  const failures: string[] = [];
  const joinedLogs = logs.join('\n');

  for (const pattern of testCase.expectation.replyIncludes || []) {
    if (!pattern.test(reply)) failures.push(`reply_missing:${pattern}`);
  }
  for (const pattern of testCase.expectation.replyExcludes || []) {
    if (pattern.test(reply)) failures.push(`reply_forbidden:${pattern}`);
  }
  for (const pattern of testCase.expectation.logIncludes || []) {
    if (!pattern.test(joinedLogs)) failures.push(`log_missing:${pattern}`);
  }
  for (const pattern of testCase.expectation.logExcludes || []) {
    if (pattern.test(joinedLogs)) failures.push(`log_forbidden:${pattern}`);
  }
  if (testCase.expectation.noForbiddenClaims && FORBIDDEN_CLAIM_PATTERN.test(reply)) {
    failures.push('forbidden_external_or_activation_claim');
  }

  return failures;
}

function markdownSummary(report: DomainChipFastPathCanaryReport): string {
  const lines = [
    '# R30 Domain Chip Fast-Path Canary',
    '',
    `Generated: ${report.generated_at}`,
    `Claim scope: ${report.claim_scope}`,
    '',
    `Status: ${report.summary.status}`,
    `Cases: ${report.summary.passed}/${report.summary.total} passed`,
    '',
    '## Cases',
    ''
  ];

  for (const entry of report.cases) {
    lines.push(`- ${entry.status === 'pass' ? 'PASS' : 'FAIL'} ${entry.id} (${entry.domain})`);
    if (entry.failures.length > 0) lines.push(`  - Failures: ${entry.failures.join(', ')}`);
  }

  lines.push(
    '',
    '## Allowed Claims',
    '',
    ...report.summary.allowed_claims.map((claim) => `- ${claim}`),
    '',
    '## Disallowed Claims',
    '',
    ...report.summary.disallowed_claims.map((claim) => `- ${claim}`)
  );

  return `${lines.join('\n')}\n`;
}

export async function runDomainChipFastPathCanary(options: { outputDir?: string } = {}): Promise<DomainChipFastPathCanaryReport> {
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '123:test';
  process.env.ADMIN_TELEGRAM_IDS = CANARY_USER_IDS.join(',');
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.SPARK_AGENT_ACCESS_PROFILE = 'developer';
  process.env.SPARK_BUILDER_BRIDGE_MODE = 'auto';

  const indexModule: any = await import('../src/index');
  const llmModule = await import('../src/llm');
  const originalChat = llmModule.llm.chat;

  indexModule.__setBuilderBridgeRunnerForTest(async () => ({
    used: false,
    responseText: 'bridge disabled for R30 fast-path canary',
    decision: 'blocked',
    bridgeMode: 'blocked',
    routingDecision: 'r30_fast_path_canary_stub'
  }));

  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const results: CanaryCaseResult[] = [];

  try {
    let index = 0;
    for (const testCase of CASES) {
      const replies: string[] = [];
      const logs: string[] = [];
      const userId = CANARY_USER_IDS[index];
      const messageId = 8800 + index;
      index += 1;

      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      };
      console.warn = (...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      };
      console.error = (...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      };
      llmModule.llm.chat = async () => testCase.llmReply || 'R30 canary fallback response. No work started.';

      await indexModule.handleTextMessage(fakeCtx(testCase.prompt, replies, userId, messageId));

      const reply = replies.join('\n\n');
      const routeLogs = logs.filter((line) => /\[(?:PrdWritingFastPath|DailyScheduleFastPath|BuilderBridge|Bridge)\]/.test(line));
      const failures = evaluateExpectation(testCase, reply, routeLogs);
      results.push({
        id: testCase.id,
        domain: testCase.domain,
        status: failures.length === 0 ? 'pass' : 'fail',
        prompt: testCase.prompt,
        reply,
        routeLogs,
        failures
      });
    }
  } finally {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    llmModule.llm.chat = originalChat;
    indexModule.__setBuilderBridgeRunnerForTest(null);
  }

  const failed = results.filter((entry) => entry.status === 'fail').length;
  const report: DomainChipFastPathCanaryReport = {
    schema_version: 'spark.r30.domain_chip_fast_path_canary.v1',
    generated_at: new Date().toISOString(),
    claim_scope: 'local_telegram_handler_replay_only',
    live_send_performed: false,
    external_mutation_performed: false,
    reran_full_loop: false,
    cases: results,
    summary: {
      status: failed === 0 ? 'pass' : 'fail',
      passed: results.length - failed,
      failed,
      total: results.length,
      allowed_claims: [
        'PRD Writing and Daily Schedule fast-path routes pass local Telegram handler replay for covered fresh prompts.',
        'Covered local no-wrong-fast-path boundaries for PRD calendar prompts, Spark runtime timezone prompts, generic no-action timezone discussion, and Domain Chip creation prompts.',
        'Daily Schedule loop-mode requests are advisory only in Telegram handler replay.'
      ],
      disallowed_claims: [
        'Live Telegram deployment readiness is proven.',
        'A live Telegram message was sent or observed.',
        'Daily Schedule loop-mode requests operationally start an autoloop from Telegram.',
        'Any real calendar, CRM, repo, registry, installer pin, or network state was mutated.'
      ]
    }
  };

  const outputDir = options.outputDir || path.resolve(process.cwd(), 'outputs', 'r30-domain-chip-fastpath-canary');
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'local-handler-canary.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outputDir, 'local-handler-canary.md'), markdownSummary(report));

  return report;
}

if (require.main === module) {
  const outputIndex = process.argv.indexOf('--output-dir');
  const outputDir = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  runDomainChipFastPathCanary({ outputDir })
    .then((report) => {
      console.log(`R30 domain-chip fast-path canary: ${report.summary.status} (${report.summary.passed}/${report.summary.total})`);
      if (report.summary.status !== 'pass') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
