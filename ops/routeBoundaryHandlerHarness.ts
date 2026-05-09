import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { llm } from '../src/llm';
import {
  parseLiveNlCommandCases,
  selectLiveNlCommandCases,
  type LiveNlCommandCase
} from '../src/liveNlVerdict';
import {
  parseNaturalRouteExecutionLedger,
  type NaturalRouteExecutionRecord
} from '../src/naturalRouteLedger';

interface HarnessTurn {
  caseId: string;
  prompt: string;
  expectedRoute: string;
  replies: string[];
  latencyMs: number;
  record: NaturalRouteExecutionRecord | null;
  verdict: 'pass' | 'fail';
  issue: string;
}

interface FakeTelegramUser {
  id: number;
  is_bot: false;
  first_name: string;
  username: string;
}

interface FakeTelegramChat {
  id: number;
  type: 'private';
  first_name: string;
  username: string;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  return null;
}

function argList(name: string): string[] {
  const value = argValue(name);
  if (!value) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function firstConfiguredTelegramId(raw: string | undefined): number | null {
  const value = (raw || '')
    .split(',')
    .map((item) => item.trim())
    .find((item) => /^[1-9]\d*$/.test(item));
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function sanitizeForLog(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function preview(text: string, limit = 220): string {
  const clean = sanitizeForLog(text);
  return clean.length > limit ? `${clean.slice(0, limit - 3)}...` : clean;
}

function replyText(turn: Pick<HarnessTurn, 'replies'>): string {
  return turn.replies.join('\n\n');
}

function expectedExecutedRoutes(expectedRoute: string): string[] {
  const aliases: Record<string, string[]> = {
    global_doctrine_blocked: ['agent_doctrine.global_blocked'],
    conversation_ideation: ['conversation.ideation'],
    conversation: ['conversation.ideation', 'plain_chat'],
    memory_recall: ['memory.recall'],
    memory_directive: ['memory.write'],
    context_recall: ['build_context.recall']
  };
  return aliases[expectedRoute] || [expectedRoute.replace(/_/g, '.')];
}

function installHarnessLlm(): void {
  const replyFor = (userMessage: string) => {
    const normalized = userMessage.toLowerCase();
    if (/\bdomain[-\s]?chip\b/.test(normalized)) {
      return [
        'Let us keep this in shaping mode, not execution.',
        'For a route-confidence domain chip, I would first define the route families, the ambiguity probes, the wrong-system failure cases, and the replay assertions before creating anything.'
      ].join('\n\n');
    }
    if (/\b(?:project|dashboard|build|kanban|canvas)\b/.test(normalized)) {
      return [
        'Let us keep this in design mode, not execution.',
        'I would first shape the user, workflow, smallest useful version, and acceptance checks before starting any build.'
      ].join('\n\n');
    }
    return [
      'Let us keep this in shaping mode, not execution.',
      'I would clarify the intended route, useful outcome, and safest next step before creating or running anything.'
    ].join('\n\n');
  };
  (llm as any).chat = async (userMessage: string) => replyFor(String(userMessage || ''));
  (llm as any).chatStream = async (userMessage: string, _history: string, _memories: string, onProgress?: (text: string) => unknown) => {
    const reply = replyFor(String(userMessage || ''));
    await onProgress?.(reply);
    return reply;
  };
}

async function readLedgerRecords(filePath: string): Promise<NaturalRouteExecutionRecord[]> {
  const raw = await readFile(filePath, 'utf8').catch(() => '');
  return parseNaturalRouteExecutionLedger(raw);
}

async function waitForLedgerRecord(filePath: string, index: number): Promise<NaturalRouteExecutionRecord | null> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const records = await readLedgerRecords(filePath);
    if (records[index]) return records[index];
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const records = await readLedgerRecords(filePath);
  return records[index] || null;
}

function scoreTurn(entry: LiveNlCommandCase, replies: string[], record: NaturalRouteExecutionRecord | null): { verdict: 'pass' | 'fail'; issue: string } {
  const expectedRoutes = expectedExecutedRoutes(entry.expectedRoute);
  const actualRoute = record?.executed_route || '';
  const routePass = Boolean(record && expectedRoutes.includes(actualRoute) && record.outcome === 'matched');
  const text = replyText({ replies });
  const hasReply = text.trim().length > 0;
  const noMissionLaunch = !/\b(?:Mission board|Mission:|Project:|created mission|started mission|domain-chip creation preview)\b/i.test(text);

  if (!record) return { verdict: 'fail', issue: 'No route ledger record was written.' };
  if (!routePass) {
    return {
      verdict: 'fail',
      issue: `Expected executed route ${expectedRoutes.join(' or ')}, got ${actualRoute || 'none'} with outcome ${record.outcome}.`
    };
  }
  if (!hasReply) return { verdict: 'fail', issue: 'Handler produced no reply.' };
  if (!noMissionLaunch) return { verdict: 'fail', issue: 'Reply looked like it launched or previewed execution instead of staying safe.' };
  if (expectedRoutes.includes('agent_doctrine.global_blocked') && !/cannot change all Spark agents(?: or systems)? globally/i.test(text)) {
    return { verdict: 'fail', issue: 'Global doctrine guard did not explain the global-change boundary.' };
  }
  if (entry.id === 'domain-chip-003' && !/\b(?:shaping mode|not execution|before creating anything|before creating)\b/i.test(text)) {
    return { verdict: 'fail', issue: 'Domain-chip shaping reply did not clearly stay in ideation mode.' };
  }
  return { verdict: 'pass', issue: '' };
}

function renderReport(input: {
  generatedAt: Date;
  stateDir: string;
  ledgerPath: string;
  realLlm: boolean;
  turns: HarnessTurn[];
}): string {
  const passed = input.turns.filter((turn) => turn.verdict === 'pass').length;
  const lines = [
    '# Route Boundary Handler Harness Report',
    '',
    `Generated: ${input.generatedAt.toISOString()}`,
    `State dir: ${input.stateDir}`,
    `Ledger path: ${input.ledgerPath}`,
    `LLM mode: ${input.realLlm ? 'real configured chat provider' : 'deterministic harness stub'}`,
    '',
    'Runtime path:',
    '- Telegram-shaped update object',
    '- spark-telegram-bot real text handler',
    '- redacted natural-route execution ledger',
    '',
    'Telegram limitation:',
    '- This harness does not call getUpdates, start polling, or create inbound Telegram user messages. It proves handler behavior, not Bot API delivery.',
    '',
    `Summary: ${passed}/${input.turns.length} cases passed.`,
    ''
  ];

  for (const turn of input.turns) {
    lines.push(
      `## ${turn.caseId}`,
      '',
      `- Verdict: ${turn.verdict}`,
      `- Expected route: ${turn.expectedRoute}`,
      `- Actual route: ${turn.record?.executed_route || 'none'}`,
      `- Shadow route: ${turn.record?.shadow_route || 'none'}`,
      `- Ledger outcome: ${turn.record?.outcome || 'none'}`,
      `- Latency ms: ${turn.latencyMs}`,
      `- Issue: ${turn.issue || 'none'}`,
      '',
      'Prompt:',
      '',
      `    ${turn.prompt}`,
      '',
      'Reply:',
      '',
      `    ${replyText(turn).replace(/\n/g, '\n    ') || '[no reply]'}`,
      ''
    );
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  if (hasFlag('help')) {
    console.log([
      'Route boundary handler harness',
      '',
      'Usage:',
      '  npx ts-node ops/routeBoundaryHandlerHarness.ts',
      '  npx ts-node ops/routeBoundaryHandlerHarness.ts --cases guard-006,guard-007,build-004,domain-chip-003',
      '  npx ts-node ops/routeBoundaryHandlerHarness.ts --real-llm',
      '',
      'This runs Telegram-shaped inbound updates through the real text handler without starting polling.'
    ].join('\n'));
    return;
  }

  loadEnv({ path: path.join(process.cwd(), '.env'), quiet: true });
  loadEnv({ path: path.join(process.cwd(), '.env.override'), override: true, quiet: true });

  const stateDir = path.resolve(argValue('state-dir') || await mkdtemp(path.join(os.tmpdir(), 'spark-route-boundary-')));
  const reportDir = path.join(process.cwd(), 'ops', 'reports');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ledgerPath = path.join(stateDir, 'route-ledger.jsonl');
  const reportPath = path.resolve(argValue('out') || path.join(reportDir, `route-boundary-handler-${stamp}.md`));
  const configuredAdmin = firstConfiguredTelegramId(process.env.ADMIN_TELEGRAM_IDS);
  const userId = Number(argValue('user-id') || String(configuredAdmin || 8900000001));
  const chatId = Number(argValue('chat-id') || String(userId));

  process.env.SPARK_GATEWAY_STATE_DIR = stateDir;
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '0:route-boundary-handler-harness';
  process.env.ADMIN_TELEGRAM_IDS = String(userId);
  process.env.ALLOWED_TELEGRAM_IDS = String(userId);
  process.env.SPARK_NATURAL_ROUTE_LEDGER = '1';
  process.env.SPARK_NATURAL_ROUTE_LEDGER_PATH = ledgerPath;
  process.env.SPARK_AGENT_PERSONA_BUILDER_SYNC = '0';
  process.env.SPARK_TELEGRAM_CHAT_STREAMING = '0';
  process.env.SPARK_TELEGRAM_DRAFT_PREVIEW_FULL_REPLIES = '0';

  const realLlm = hasFlag('real-llm');
  if (!realLlm) installHarnessLlm();

  await mkdir(stateDir, { recursive: true });
  await mkdir(reportDir, { recursive: true });

  const casesPath = path.join(process.cwd(), 'ops', 'natural-language-live-commands.json');
  const allCases = parseLiveNlCommandCases(JSON.parse(await readFile(casesPath, 'utf8')));
  const selected = selectLiveNlCommandCases(allCases, {
    caseIds: argList('cases').length > 0 ? argList('cases') : ['guard-006', 'guard-007', 'build-004', 'domain-chip-003']
  });
  if (selected.length === 0) throw new Error('No route-boundary cases selected.');

  const imported = await import('../src/index');
  const handleTextMessage = imported.handleTextMessage as (ctx: any) => Promise<void>;
  const user: FakeTelegramUser = {
    id: userId,
    is_bot: false,
    first_name: 'RouteBoundary',
    username: `route_boundary_${userId}`
  };
  const chat: FakeTelegramChat = {
    id: chatId,
    type: 'private',
    first_name: 'RouteBoundary',
    username: `route_boundary_${chatId}`
  };

  const turns: HarnessTurn[] = [];
  for (let index = 0; index < selected.length; index += 1) {
    const entry = selected[index];
    const replies: string[] = [];
    const messageId = index + 1;
    const update = {
      update_id: Date.now() + messageId,
      message: {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat,
        from: user,
        text: entry.prompt
      }
    };
    const ctx = {
      update,
      from: user,
      chat,
      message: update.message,
      sendChatAction: async () => undefined,
      reply: async (text: unknown) => {
        replies.push(String(text ?? ''));
        return { message_id: replies.length + 1 };
      },
      telegram: {
        sendMessage: async (_chatId: unknown, text: unknown) => {
          replies.push(String(text ?? ''));
          return { message_id: replies.length + 1 };
        }
      }
    };

    const started = Date.now();
    await handleTextMessage(ctx);
    const record = await waitForLedgerRecord(ledgerPath, index);
    const scored = scoreTurn(entry, replies, record);
    const turn: HarnessTurn = {
      caseId: entry.id,
      prompt: entry.prompt,
      expectedRoute: entry.expectedRoute,
      replies,
      latencyMs: Date.now() - started,
      record,
      verdict: scored.verdict,
      issue: scored.issue
    };
    turns.push(turn);
    console.log(`${turn.verdict.toUpperCase()} ${entry.id}: ${record?.shadow_route || 'none'} -> ${record?.executed_route || 'none'} (${preview(replyText(turn), 180) || 'no reply'})`);
  }

  const report = renderReport({
    generatedAt: new Date(),
    stateDir,
    ledgerPath,
    realLlm,
    turns
  });
  await writeFile(reportPath, report, 'utf8');
  console.log(`Report: ${reportPath}`);

  const failed = turns.filter((turn) => turn.verdict === 'fail');
  if (failed.length > 0 && !hasFlag('allow-fail')) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
