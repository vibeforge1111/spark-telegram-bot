import { config as loadEnv } from 'dotenv';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Telegraf } from 'telegraf';

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

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    process.env[match[1]] = match[2];
  }
}

function readSparkSecret(secretId: string): string | null {
  try {
    const output = execFileSync('spark', ['secrets', 'get', '--reveal', secretId], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

function loadSparkProfileEnv(): string | null {
  const profile = argValue('profile');
  if (!profile) return null;

  const configDir = path.join(os.homedir(), '.spark', 'config', 'modules');
  loadEnvFile(path.join(configDir, 'spark-telegram-bot.env'));
  loadEnvFile(path.join(configDir, `spark-telegram-bot.${profile}.env`));

  const profileSecretId = `telegram.profiles.${profile}.bot_token`;
  const profileToken = readSparkSecret(profileSecretId) || (profile === 'default' ? readSparkSecret('telegram.bot_token') : null);
  if (profileToken) {
    process.env.BOT_TOKEN = profileToken;
    delete process.env.SPARK_PROFILE_TOKEN_MISSING;
  } else {
    process.env.SPARK_PROFILE_TOKEN_MISSING = profileSecretId;
    if (!process.env.TEST_BOT_TOKEN) delete process.env.BOT_TOKEN;
  }
  return profile;
}

function loadCases(): CommandCase[] {
  const file = path.join(__dirname, 'natural-language-live-commands.json');
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as CommandCase[];
}

function selectCases(cases: CommandCase[]): CommandCase[] {
  const caseId = argValue('case');
  const suite = argValue('suite');
  const includeRisky = hasFlag('include-risky');

  let selected = cases;
  if (caseId) selected = selected.filter((entry) => entry.id === caseId);
  if (suite) selected = selected.filter((entry) => entry.suite === suite);
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
  const chatId = argValue('chat') || defaultChatId();
  const missingProfileToken = process.env.SPARK_PROFILE_TOKEN_MISSING?.trim();
  if (!token && missingProfileToken) {
    throw new Error(
      `Could not load ${missingProfileToken}. Run this from an approved Spark secret session, or set TEST_BOT_TOKEN for prompt-card sending.`
    );
  }
  if (!token) throw new Error('BOT_TOKEN is required to send prompt cards.');
  if (!chatId) throw new Error('Set TEST_TELEGRAM_CHAT_ID, ADMIN_TELEGRAM_IDS, or pass --chat <id>.');

  const bot = new Telegraf(token);
  const delayMs = Number(argValue('delay-ms') || '1200');
  for (const entry of selected) {
    await bot.telegram.sendMessage(chatId, renderCase(entry));
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function main(): Promise<void> {
  const profile = loadSparkProfileEnv();
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
