#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const tests = [
  'tests/launchMode.test.ts',
  'tests/onboardingBridge.test.ts',
  'tests/buildIntent.test.ts',
  'tests/buildRoutingMatrix.test.ts',
  'tests/buildE2E.test.ts',
  'tests/conversationIntent.test.ts',
  'tests/memoryDoctorBridge.test.ts',
  'tests/routeConfidenceTelegram.test.ts',
  'tests/naturalRouteDecision.test.ts',
  'tests/routeFirewall.test.ts',
  'tests/routeArbiter.test.ts',
  'tests/conversationSmoke.test.ts',
  'tests/naturalRouteTelemetry.test.ts',
  'tests/naturalRouteLedger.test.ts',
  'tests/naturalRouteReplay.test.ts',
  'tests/liveNlVerdict.test.ts',
  'tests/routeBoundaryHandlerHarness.test.ts',
  'tests/harnessContract.test.ts',
  'tests/harnessProofCapsule.test.ts',
  'tests/harnessProofNaturalRequest.test.ts',
  'tests/harnessProofProjection.test.ts',
  'tests/finalAnswerGateAudit.test.ts',
  'tests/freshRuntimeProofContext.test.ts',
  'tests/harnessCoreVNext.test.ts',
  'tests/harnessCoreLedger.test.ts',
  'tests/legacyAuthorityInventory.test.ts',
  'tests/telegramActionAuthority.test.ts',
  'tests/telegramCommandAuthority.test.ts',
  'tests/telegramMediaAuthority.test.ts',
  'tests/telegramMediaEnvelope.test.ts',
  'tests/controlProofTraceAudit.test.ts',
  'tests/outboundTraceRepair.test.ts',
  'tests/routeConfidenceTraceRepair.test.ts',
  'tests/controlProofLiveCanaryPack.test.ts',
  'tests/runtimeFreshness.test.ts',
  'tests/runtimeSyncCompatibility.test.ts',
  'tests/turnIntent350Matrix.test.ts',
  'tests/conversationMemory.test.ts',
  'tests/commandTelemetry.test.ts',
  'tests/accessPolicy.test.ts',
  'tests/authorityStatus.test.ts',
  'tests/operatorActions.test.ts',
  'tests/providerRouting.test.ts',
  'tests/modelSwitch.test.ts',
  'tests/missionRelayFormatting.test.ts',
  'tests/missionRelayHealth.test.ts',
  'tests/outboundSanitize.test.ts',
  'tests/redaction.test.ts',
  'tests/errorExplain.test.ts',
  'tests/spawner.test.ts',
  'tests/spawnerUrl.test.ts',
  'tests/timeoutConfig.test.ts',
  'tests/localWorkspace.test.ts',
  'tests/llmProvider.test.ts',
  'tests/llmStreaming.test.ts',
  'tests/telegramDraft.test.ts',
  'tests/telegramVoiceBridge.test.ts',
  'tests/telegramSurface.test.ts',
  'tests/llmProviderSmoke.test.ts',
  'tests/profileEnv.test.ts',
  'tests/healthPolling.test.ts',
  'tests/diagnose.test.ts',
  'tests/recursive.test.ts',
  'tests/recursiveCommand.test.ts',
  'tests/creatorMissionStatus.test.ts',
  'tests/launchConversationQuality.test.ts',
  'tests/builderBridge.test.ts',
  'tests/telegramVoiceBridge.test.ts',
  'tests/voiceCaption.test.ts',
  'tests/pythonCommand.test.ts',
  'tests/hiddenProcess.test.ts'
];

const requireRealToken = process.argv.includes('--require-real-token');
const token = process.env.BOT_TOKEN || '';
const runIndex = process.argv.indexOf('--run');
const requestedTests = runIndex >= 0
  ? process.argv.slice(runIndex + 1).filter((arg) => arg && !arg.startsWith('--'))
  : [];
const testsToRun = requestedTests.length > 0 ? requestedTests : tests;

if (requireRealToken && (!token || token === '123:test' || token === '0:telegram-smoke-token')) {
  console.error('BOT_TOKEN must be set to a real tester bot token for this test mode.');
  process.exit(1);
}

const env = {
  ...process.env,
  BOT_TOKEN: token || '123:test'
};

const tsNodeBin = path.join(__dirname, '..', 'node_modules', 'ts-node', 'dist', 'bin.js');

for (const testFile of testsToRun) {
  const result = spawnSync(process.execPath, [tsNodeBin, testFile], {
    env,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
