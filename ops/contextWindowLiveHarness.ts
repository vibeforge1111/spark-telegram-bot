import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { config as loadEnv } from 'dotenv';

interface HarnessTurn {
  input: string;
  replies: string[];
  latencyMs: number;
}

interface HarnessCheck {
  name: string;
  passed: boolean;
  detail: string;
}

interface HarnessScenarioResult {
  id: string;
  title: string;
  turns: HarnessTurn[];
  checks: HarnessCheck[];
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

type ScenarioRunner = (driver: TelegramDriver) => Promise<HarnessScenarioResult>;

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

function sanitizeForLog(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function preview(text: string, limit = 180): string {
  const clean = sanitizeForLog(text);
  return clean.length > limit ? `${clean.slice(0, limit - 3)}...` : clean;
}

function replyText(turn: HarnessTurn): string {
  return turn.replies.join('\n\n');
}

function checkContains(turn: HarnessTurn, name: string, pattern: RegExp, detail: string): HarnessCheck {
  const text = replyText(turn);
  return {
    name,
    passed: pattern.test(text),
    detail: pattern.test(text) ? detail : `${detail}; got: ${preview(text, 260)}`
  };
}

function checkNotContains(turn: HarnessTurn, name: string, pattern: RegExp, detail: string): HarnessCheck {
  const text = replyText(turn);
  return {
    name,
    passed: !pattern.test(text),
    detail: !pattern.test(text) ? detail : `${detail}; got: ${preview(text, 260)}`
  };
}

function checkHasReply(turn: HarnessTurn): HarnessCheck {
  return {
    name: 'has_reply',
    passed: turn.replies.length > 0 && replyText(turn).trim().length > 0,
    detail: turn.replies.length > 0 ? 'Bot produced a reply.' : 'Bot produced no reply.'
  };
}

class TelegramDriver {
  private messageId = 1;
  readonly turns: HarnessTurn[] = [];
  readonly user: FakeTelegramUser;
  readonly chat: FakeTelegramChat;

  constructor(
    private readonly handleTextMessage: (ctx: any) => Promise<void>,
    scenarioIndex: number,
    userId: number,
    chatSeed: number
  ) {
    const id = chatSeed + scenarioIndex;
    this.user = {
      id: userId,
      is_bot: false,
      first_name: 'Context',
      username: `context_window_${userId}`
    };
    this.chat = {
      id: userId,
      type: 'private',
      first_name: 'Context',
      username: `context_window_${id}`
    };
  }

  async send(input: string): Promise<HarnessTurn> {
    const replies: string[] = [];
    const messageId = this.messageId;
    this.messageId += 1;
    const update = {
      update_id: Date.now() + messageId,
      message: {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat: this.chat,
        from: this.user,
        text: input
      }
    };
    const ctx = {
      update,
      from: this.user,
      chat: this.chat,
      message: update.message,
      sendChatAction: async () => undefined,
      reply: async (text: unknown) => {
        replies.push(String(text ?? ''));
        return { message_id: this.messageId++ };
      },
      replyWithDocument: async (document: unknown) => {
        replies.push(`[document:${JSON.stringify(document)}]`);
        return { message_id: this.messageId++ };
      },
      telegram: {
        sendMessage: async (_chatId: unknown, text: unknown) => {
          replies.push(String(text ?? ''));
          return { message_id: this.messageId++ };
        }
      }
    };

    const started = Date.now();
    await this.handleTextMessage(ctx);
    const turn = {
      input,
      replies,
      latencyMs: Date.now() - started
    };
    this.turns.push(turn);
    console.log(`  user: ${preview(input)}`);
    console.log(`  bot:  ${preview(replyText(turn) || '[no reply]')}`);
    console.log(`  ms:   ${turn.latencyMs}`);
    return turn;
  }
}

async function accessListCollision(driver: TelegramDriver): Promise<HarnessScenarioResult> {
  console.log('\n[context-access-list-collision]');
  const t1 = await driver.send('Change my access level to three please');
  const t2 = await driver.send('Change it to 4');
  const t3 = await driver.send('Give me three build ideas for a memory dashboard');
  const t4 = await driver.send("Let's do the second one");
  const checks = [
    checkHasReply(t1),
    checkContains(t1, 'sets_level_3', /Level\s+3|Research\s+\+\s+Build/i, 'Natural access change should set Level 3.'),
    checkContains(t2, 'contextual_sets_level_4', /Level\s+4|Full\s+Access/i, 'Short access follow-up should set Level 4.'),
    checkContains(t3, 'idea_list_present', /\b1[\).:-]\s+|\b2[\).:-]\s+|\bthree\b/i, 'Bot should produce a list-like ideation answer.'),
    checkNotContains(t4, 'second_one_not_access_level_2', /changed this chat to Level\s+2|Level\s+2\s+-\s+Build/i, 'Second list option must not become access level 2.'),
    checkContains(t4, 'second_one_uses_list_context', /second|timeline|explorer|memory|dashboard|chronolog|filter/i, 'Reply should use the recent list context.')
  ];
  return { id: 'context-access-list-collision', title: 'Access changes do not steal later list references', turns: driver.turns, checks };
}

async function shorthandAfterDistractors(driver: TelegramDriver): Promise<HarnessScenarioResult> {
  console.log('\n[context-shorthand-after-distractors]');
  await driver.send('Here are three directions for a team ritual: 1. async demos 2. Friday notes 3. launch retro');
  await driver.send('Before we choose, give me one sentence about why rituals can help remote teams.');
  await driver.send('Also keep it calm and not corporate.');
  const finalTurn = await driver.send("Let's do two");
  const checks = [
    checkHasReply(finalTurn),
    checkNotContains(finalTurn, 'does_not_route_to_access', /changed this chat to Level|Spark access:/i, 'Short option follow-up should not route to access.'),
    checkContains(finalTurn, 'resolves_friday_notes', /Friday|notes|ritual|team/i, 'Reply should resolve option two from the earlier list.')
  ];
  return { id: 'context-shorthand-after-distractors', title: 'Short option references survive small distractors', turns: driver.turns, checks };
}

async function accessDenialSteer(driver: TelegramDriver): Promise<HarnessScenarioResult> {
  console.log('\n[context-access-denial-steer]');
  await driver.send('Change my access level to one please');
  const denied = await driver.send('inspect https://github.com/warpdotdev/warp and tell me how their agent harness handles context');
  const checks = [
    checkHasReply(denied),
    checkContains(denied, 'denial_names_access', /access|Level\s+3|Level\s+4|Research\s+\+\s+Build|Full\s+Access/i, 'Denied capability should steer toward the needed access level.'),
    checkNotContains(denied, 'no_generic_visibility_blob', /I don't have visibility into your account|what platform or dashboard/i, 'Reply should not be the old generic access blob.')
  ];
  return { id: 'context-access-denial-steer', title: 'Capability denial explains access upgrade path', turns: driver.turns, checks };
}

async function memoryCodeword(driver: TelegramDriver): Promise<HarnessScenarioResult> {
  console.log('\n[context-memory-codeword]');
  await driver.send('Please remember this session test code word: aurora mango.');
  await driver.send('Now give me one calm sentence about context windows.');
  const recall = await driver.send('What is the session test code word I asked you to remember?');
  const checks = [
    checkHasReply(recall),
    checkContains(recall, 'recalls_codeword', /aurora\s+mango|aurora|mango/i, 'Same-session memory should recall the code word.')
  ];
  return { id: 'context-memory-codeword', title: 'Same-session memory recalls explicit code word', turns: driver.turns, checks };
}

async function latestContextWins(driver: TelegramDriver): Promise<HarnessScenarioResult> {
  console.log('\n[context-latest-context-wins]');
  await driver.send('Change my access level to three please');
  await driver.send('Give me three naming ideas for a context tester');
  const accessTurn = await driver.send('Actually change it to 4');
  const listTurn = await driver.send("Let's do the second one");
  const checks = [
    checkContains(accessTurn, 'explicit_change_still_access', /Level\s+4|Full\s+Access/i, 'Explicit access change should still work after a list.'),
    checkNotContains(listTurn, 'second_one_not_access_level_2', /changed this chat to Level\s+2|Level\s+2\s+-\s+Build/i, 'Later list reference should not be mistaken for access Level 2.'),
    checkContains(listTurn, 'second_one_mentions_name_context', /name|tester|context|second/i, 'Reply should stay in the naming/list context.')
  ];
  return { id: 'context-latest-context-wins', title: 'Explicit changes and list follow-ups both work', turns: driver.turns, checks };
}

async function longWarmContext(driver: TelegramDriver): Promise<HarnessScenarioResult> {
  console.log('\n[context-long-warm-context]');
  await driver.send('I am choosing between: 1. recall audit board 2. memory timeline explorer 3. live stress-test panel');
  for (let index = 1; index <= 8; index += 1) {
    await driver.send(`Distractor ${index}: answer with one short sentence about keeping context useful.`);
  }
  const finalTurn = await driver.send('Choose option 2 from the earlier memory dashboard list and describe the next step.');
  const checks = [
    checkHasReply(finalTurn),
    checkContains(finalTurn, 'long_context_recovers_option_2', /timeline|explorer|chronolog|memory/i, 'Older list artifact should survive several turns.'),
    checkNotContains(finalTurn, 'long_context_not_access', /changed this chat to Level|Spark access:/i, 'Longer context reference should not route to access.')
  ];
  return { id: 'context-long-warm-context', title: 'List artifact survives a longer live loop', turns: driver.turns, checks };
}

function renderMarkdownReport(results: HarnessScenarioResult[], stateDir: string): string {
  const checks = results.flatMap((result) => result.checks);
  const passed = checks.filter((check) => check.passed).length;
  const failed = checks.length - passed;
  const lines = [
    '# Context Window Live Harness Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `State dir: ${stateDir}`,
    '',
    'Runtime path:',
    '- Telegram-shaped update object',
    '- spark-telegram-bot text handler',
    '- real Builder bridge when available',
    '- real chat LLM fallback when Builder does not answer',
    '',
    'Telegram limitation:',
    '- This harness does not call getUpdates and does not create inbound Telegram user messages. Bot API cannot safely do that while the live bot owns polling. True inbound coverage is handled by the prompt-card suite.',
    '',
    `Summary: ${passed}/${checks.length} checks passed, ${failed} failed.`,
    ''
  ];

  for (const result of results) {
    const resultPassed = result.checks.every((check) => check.passed);
    lines.push(`## ${result.id}`, '', `${resultPassed ? 'PASS' : 'FAIL'} - ${result.title}`, '');
    for (const check of result.checks) {
      lines.push(`- ${check.passed ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`);
    }
    lines.push('', 'Turns:');
    for (const turn of result.turns) {
      lines.push(`- user: ${preview(turn.input, 220)}`);
      lines.push(`  bot: ${preview(replyText(turn), 320)}`);
      lines.push(`  latency_ms: ${turn.latencyMs}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  if (hasFlag('help')) {
    console.log([
      'Context window live harness',
      '',
      'Usage:',
      '  npm run context:live',
      '  npm run context:live -- --stress',
      '  npm run context:live -- --allow-fail',
      '  npm run context:live -- --state-dir C:\\\\temp\\\\spark-context-test',
      '',
      'This runs Telegram-shaped inbound updates through the real text handler without starting polling.'
    ].join('\n'));
    return;
  }

  const stateDir = path.resolve(argValue('state-dir') || await mkdtemp(path.join(os.tmpdir(), 'spark-context-window-live-')));
  loadEnv({ path: path.join(process.cwd(), '.env'), quiet: true });
  loadEnv({ path: path.join(process.cwd(), '.env.override'), override: true, quiet: true });
  const configuredAdmin = firstConfiguredTelegramId(process.env.ADMIN_TELEGRAM_IDS);
  const runSeed = Number(argValue('user-seed') || String(8800000000 + Math.floor(Math.random() * 100000)));
  const userId = Number(argValue('user-id') || String(configuredAdmin || runSeed));
  const chatSeed = Number(argValue('chat-seed') || String(runSeed));
  process.env.SPARK_GATEWAY_STATE_DIR = stateDir;
  process.env.SPARK_BOT_TEST_MODE = '1';
  process.env.BOT_TOKEN = process.env.BOT_TOKEN || '0:telegram-context-window-harness';
  process.env.ADMIN_TELEGRAM_IDS = process.env.ADMIN_TELEGRAM_IDS || String(userId);
  process.env.ALLOWED_TELEGRAM_IDS = process.env.ALLOWED_TELEGRAM_IDS || String(userId);
  process.env.SPARK_BUILDER_REPO = process.env.SPARK_BUILDER_REPO || path.resolve(process.cwd(), '..', 'spark-intelligence-builder');
  process.env.SPARK_BUILDER_BRIDGE_MODE = process.env.SPARK_BUILDER_BRIDGE_MODE || 'auto';
  process.env.SPARK_CONTEXT_BRIDGE_TIMEOUT_MS = process.env.SPARK_CONTEXT_BRIDGE_TIMEOUT_MS || '12000';

  await mkdir(stateDir, { recursive: true });
  const imported = await import('../src/index');
  const handleTextMessage = imported.handleTextMessage as (ctx: any) => Promise<void>;

  const scenarios: ScenarioRunner[] = [
    accessListCollision,
    shorthandAfterDistractors,
    accessDenialSteer,
    memoryCodeword,
    latestContextWins,
  ];
  if (hasFlag('stress')) {
    scenarios.push(longWarmContext);
  }

  const results: HarnessScenarioResult[] = [];
  for (let index = 0; index < scenarios.length; index += 1) {
    const driver = new TelegramDriver(handleTextMessage, index + 1, userId, chatSeed);
    results.push(await scenarios[index](driver));
  }

  const reportDir = path.join(process.cwd(), 'ops', 'reports');
  await mkdir(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(reportDir, `context-window-live-${stamp}.json`);
  const mdPath = path.join(reportDir, `context-window-live-${stamp}.md`);
  await writeFile(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), stateDir, results }, null, 2), 'utf-8');
  await writeFile(mdPath, renderMarkdownReport(results, stateDir), 'utf-8');

  const checks = results.flatMap((result) => result.checks);
  const failed = checks.filter((check) => !check.passed);
  console.log(`\nReport: ${mdPath}`);
  console.log(`Checks: ${checks.length - failed.length}/${checks.length} passed.`);
  if (failed.length > 0) {
    console.log('Failures:');
    for (const check of failed) {
      console.log(`- ${check.name}: ${check.detail}`);
    }
    if (!hasFlag('allow-fail')) {
      process.exitCode = 1;
    }
  }
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
