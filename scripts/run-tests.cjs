#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const tests = [
  'tests/launchMode.test.ts',
  'tests/buildIntent.test.ts',
  'tests/buildRoutingMatrix.test.ts',
  'tests/buildE2E.test.ts',
  'tests/conversationIntent.test.ts',
  'tests/conversationMemory.test.ts',
  'tests/accessPolicy.test.ts',
  'tests/providerRouting.test.ts',
  'tests/modelSwitch.test.ts',
  'tests/missionRelayFormatting.test.ts',
  'tests/outboundSanitize.test.ts',
  'tests/redaction.test.ts',
  'tests/errorExplain.test.ts',
  'tests/spawner.test.ts',
  'tests/timeoutConfig.test.ts',
  'tests/localWorkspace.test.ts',
  'tests/llmProvider.test.ts',
  'tests/llmProviderSmoke.test.ts',
  'tests/healthPolling.test.ts',
  'tests/diagnose.test.ts',
  'tests/creatorMissionStatus.test.ts',
  'tests/builderBridge.test.ts',
  'tests/telegramMemoryGauntlet.test.ts',
  'tests/naturalLanguageLiveCommands.test.ts',
  'tests/pythonCommand.test.ts',
  'tests/hiddenProcess.test.ts'
];

const requireRealToken = process.argv.includes('--require-real-token');
const token = process.env.BOT_TOKEN || '';

if (requireRealToken && (!token || token === '123:test' || token === '0:telegram-smoke-token')) {
  console.error('BOT_TOKEN must be set to a real tester bot token for this test mode.');
  process.exit(1);
}

const env = {
  ...process.env,
  BOT_TOKEN: token || '123:test'
};

const tsNodeBin = path.join(__dirname, '..', 'node_modules', 'ts-node', 'dist', 'bin.js');

for (const testFile of tests) {
  const result = spawnSync(process.execPath, [tsNodeBin, testFile], {
    env,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
