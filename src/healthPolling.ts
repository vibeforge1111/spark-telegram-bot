import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { buildSparkChatSystemPrompt } from './llm';
import { requireRelaySecret, resolveTelegramLaunchConfig } from './launchMode';

loadEnv({ path: path.join(__dirname, '..', '.env.override'), override: true, quiet: true });

function main(): void {
  const launch = resolveTelegramLaunchConfig();
  requireRelaySecret();

  if (!process.env.BOT_TOKEN?.trim()) {
    throw new Error('BOT_TOKEN is required for Telegram long polling.');
  }

  const primer = buildSparkChatSystemPrompt();
  for (const required of ['Builder', 'domain-chip-memory', 'Spark Researcher', 'Spawner UI', '/remember <text>', '/run <goal>']) {
    if (!primer.includes(required)) {
      throw new Error(`Spark self-knowledge primer is missing ${required}.`);
    }
  }

  console.log('Telegram health: OK');
  console.log(`Ingress mode: ${launch.mode}`);
  console.log('Webhook ingress: disabled for this launch build');
  console.log('Relay auth: configured');
}

try {
  main();
} catch (error) {
  console.error(`Telegram health: FAILED - ${(error as Error).message}`);
  process.exit(1);
}
