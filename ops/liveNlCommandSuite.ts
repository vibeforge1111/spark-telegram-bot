import { config as loadEnv } from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Telegraf } from 'telegraf';
import { argValue, loadSparkTelegramProfileEnv } from '../src/profileEnv';

loadEnv({ path: path.join(__dirname, '..', '.env'), quiet: true });
loadEnv({ path: path.join(__dirname, '..', '.env.override'), override: true, quiet: true });

interface CommandCase {
  id: string;
  suite: string;
  risk: 'safe' | 'mission' | 'writes_files' | 'external';
  prompt: string;
  expectedRoute: string;
  expectedOutcome: string;
}

const SUITE_ALIASES: Record<string, string[]> = {
  memory_architecture: ['memory', 'self_awareness', 'wiki', 'anti_drift']
};

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function loadCases(): CommandCase[] {
  const file = path.join(__dirname, 'natural-language-live-commands.json');
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as CommandCase[];
}

function selectCases(cases: CommandCase[]): CommandCase[] {
  const caseId = argValue(process.argv, 'case');
  const suite = argValue(process.argv, 'suite');
  const includeRisky = hasFlag('include-risky');
  const suiteNames = suite ? new Set(SUITE_ALIASES[suite] ?? [suite]) : null;

  let selected = cases;
  if (caseId) selected = selected.filter((entry) => entry.id === caseId);
  if (suiteNames) selected = selected.filter((entry) => suiteNames.has(entry.suite));
  if (!includeRisky && !caseId) selected = selected.filter((entry) => entry.risk === 'safe');
  return selected;
}

function renderCase(entry: CommandCase): string {
  return [
    `TEST CARD ${entry.id}`,
    '',
    'Send this as a new message to the bot:',
    entry.prompt,
    '',
    `Suite: ${entry.suite}`,
    `Risk: ${entry.risk}`,
    `Expected route: ${entry.expectedRoute}`,
    `Expected outcome: ${entry.expectedOutcome}`
  ].join('\n');
}

function defaultChatId(): string | null {
  const explicit = process.env.TEST_TELEGRAM_CHAT_ID?.trim();
  if (explicit) return explicit;
  const firstAdmin = process.env.ADMIN_TELEGRAM_IDS?.split(',').map((id) => id.trim()).find(Boolean);
  return firstAdmin || null;
}

async function sendPromptCards(selected: CommandCase[]): Promise<void> {
  const token = process.env.TEST_BOT_TOKEN?.trim() || process.env.BOT_TOKEN?.trim();
  const chatId = argValue(process.argv, 'chat') || defaultChatId();
  const missingProfileToken = process.env.SPARK_PROFILE_TOKEN_MISSING?.trim();
  if (!token && missingProfileToken) {
    throw new Error(
      `Could not load ${missingProfileToken}. Run this from an approved Spark secret session, or set TEST_BOT_TOKEN for prompt-card sending.`
    );
  }
  if (!token) throw new Error('BOT_TOKEN is required to send prompt cards.');
  if (!chatId) throw new Error('Set TEST_TELEGRAM_CHAT_ID, ADMIN_TELEGRAM_IDS, or pass --chat <id>.');

  const bot = new Telegraf(token);
  const delayMs = Number(argValue(process.argv, 'delay-ms') || '1200');
  for (const entry of selected) {
    await bot.telegram.sendMessage(chatId, renderCase(entry));
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function main(): Promise<void> {
  const profile = loadSparkTelegramProfileEnv(process.argv);
  const cases = loadCases();
  const selected = selectCases(cases);

  if (hasFlag('help') || process.argv.length <= 2) {
    console.log([
      'Natural-language Telegram live command suite',
      '',
      'Usage:',
      '  npm run nl:live -- --list',
      '  npm run nl:live -- --case mission-001',
      '  npm run nl:live -- --suite smoke',
      '  npm run nl:live -- --send --case mission-001',
      '  npm run nl:live -- --send --suite smoke',
      '  npm run nl:live -- --profile primary --send --suite smoke',
      '',
      'Notes:',
      '  --send only sends prompt cards. It does not start polling or read updates.',
      '  --profile loads the matching Spark Telegram profile env and bot token.',
      '  Suite alias: memory_architecture expands to memory, self_awareness, wiki, and anti_drift.',
      '  Risky suites are excluded from broad selection unless --include-risky is set.'
    ].join('\n'));
    return;
  }

  if (selected.length === 0) {
    throw new Error('No matching command cases.');
  }

  if (hasFlag('list')) {
    for (const entry of selected) {
      console.log(`${entry.id}\t${entry.suite}\t${entry.risk}\t${entry.expectedRoute}`);
    }
    return;
  }

  if (hasFlag('send')) {
    await sendPromptCards(selected);
    console.log(`Sent ${selected.length} prompt card(s)${profile ? ` via profile ${profile}` : ''}.`);
    return;
  }

  for (const entry of selected) {
    console.log(renderCase(entry));
    console.log('\n---\n');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
