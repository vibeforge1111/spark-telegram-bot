import { config as loadEnv } from 'dotenv';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Telegraf } from 'telegraf';
import {
  formatLiveNlHarnessCoreMap,
  formatLiveNlCopyPastePrompts,
  liveNlCaseTurns,
  parseLiveNlCommandCases,
  selectLiveNlCommandCases,
  type LiveNlCommandCase
} from '../src/liveNlVerdict';
import { argValue, loadSparkTelegramProfileEnv } from '../src/profileEnv';

loadEnv({ path: path.join(__dirname, '..', '.env'), quiet: true });
loadEnv({ path: path.join(__dirname, '..', '.env.override'), override: true, quiet: true });

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argList(name: string): string[] {
  const value = argValue(process.argv, name);
  if (!value) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function catalogFileName(): string {
  const catalog = (argValue(process.argv, 'catalog') || 'standard').trim().toLowerCase();
  if (catalog === 'standard' || catalog === 'default' || catalog === 'natural-language') {
    return 'natural-language-live-commands.json';
  }
  if (catalog === 'genesis' || catalog === 'genesis100' || catalog === 'genesis-100') {
    return 'genesis-live-telegram-100.json';
  }
  if (/^[a-z0-9_.-]+\.json$/i.test(catalog) && !catalog.includes('/') && !catalog.includes('\\')) {
    return catalog;
  }
  throw new Error(`Unsupported live NL catalog: ${catalog}`);
}

function loadCases(): LiveNlCommandCase[] {
  const file = path.join(__dirname, catalogFileName());
  return parseLiveNlCommandCases(JSON.parse(fs.readFileSync(file, 'utf-8')));
}

function renderCase(entry: LiveNlCommandCase): string {
  const turns = liveNlCaseTurns(entry);
  return [
    `TEST CARD ${entry.id}`,
    '',
    turns.length === 1
      ? 'Send this as a new message to the bot:'
      : 'Send these messages to the bot, one at a time:',
    turns.length === 1
      ? turns[0]
      : turns.map((turn, index) => `Turn ${index + 1}:\n${turn}`).join('\n\n'),
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

async function sendPromptCards(selected: LiveNlCommandCase[]): Promise<void> {
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
  const selected = selectLiveNlCommandCases(cases, {
    caseId: argValue(process.argv, 'case'),
    caseIds: argList('cases'),
    suite: argValue(process.argv, 'suite'),
    includeRisky: hasFlag('include-risky')
  });

  if (hasFlag('help') || process.argv.length <= 2) {
    console.log([
      'Natural-language Telegram live command suite',
      '',
      'Usage:',
      '  npm run nl:live -- --list',
      '  npm run nl:live -- --harness-map',
      '  npm run nl:live -- --catalog genesis100 --list --include-risky',
      '  npx ts-node ops/runtimeFreshnessCheck.ts --warn-only',
      '  npm run nl:live -- --copy-paste --cases guard-006,guard-007,build-004,domain-chip-003',
      '  npm run nl:live -- --catalog genesis100 --copy-paste --include-risky',
      '  npm run nl:live -- --case mission-001',
      '  npm run nl:live -- --cases guard-006,domain-chip-003',
      '  npm run nl:live -- --suite smoke',
      '  npm run nl:live -- --send --case mission-001',
      '  npm run nl:live -- --send --cases guard-006,domain-chip-003',
      '  npm run nl:live -- --send --suite smoke',
      '  npm run nl:live -- --profile primary --send --suite smoke',
      '',
      'Notes:',
      '  Run runtimeFreshnessCheck before trusting live Telegram pasteback.',
      '  --send only sends prompt cards. It does not start polling or read updates.',
      '  --harness-map classifies selected old cases into Harness Core authority and mutation fields.',
      '  --copy-paste prints natural user messages only, plus reply-capture blocks for Codex.',
      '  --profile loads the matching Spark Telegram profile env and bot token.',
      '  --catalog genesis100 loads the Spark Genesis 100-prompt live QA catalog.',
      '  Suite alias: memory_architecture expands to memory, self_awareness, wiki, and anti_drift.',
      '  Risky suites are excluded from broad selection unless --include-risky is set.'
    ].join('\n'));
    return;
  }

  if (selected.length === 0) {
    throw new Error('No matching command cases.');
  }

  if (hasFlag('harness-map')) {
    console.log(formatLiveNlHarnessCoreMap(selected, { catalog: catalogFileName() }));
    return;
  }

  if (hasFlag('list')) {
    for (const entry of selected) {
      console.log(`${entry.id}\t${entry.suite}\t${entry.risk}\t${entry.expectedRoute}`);
    }
    return;
  }

  if (hasFlag('copy-paste')) {
    console.log(formatLiveNlCopyPastePrompts(selected));
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
