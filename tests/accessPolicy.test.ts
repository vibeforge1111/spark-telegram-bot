import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  describeSparkAccessProfile,
  getConfiguredSparkAccessProfile,
  getSparkAccessProfile,
  normalizeSparkAccessProfile,
  renderSparkAccessBriefStatus,
  renderSparkAccessChangeSummary,
  renderSparkAccessCapabilityStatus,
  renderSparkAccessChangeConfirmation,
  renderSparkAccessConversationHelp,
  renderSparkAccessDenial,
  renderSparkAccessLevel5ConfirmationPrompt,
  renderSparkAccessLevelGuide,
  renderSparkAccessOnboarding,
  renderSparkAccessRuntimeHint,
  renderSparkAccessStatus,
  setSparkAccessProfile,
  sparkAccessAllows,
  sparkAccessLabel,
  sparkAccessLevel,
  sparkAccessAllowsExternalResearch,
  sparkAccessAllowsOperatingSystemWork,
  sparkAccessAllowsSpawnerBuilds,
  sparkMissionNeedsOperatingSystemAccess,
  sparkAccessAllowsWorkspaceBuilds,
  sparkHostedFullAccessAllowed,
  sparkHighAgencyWorkersAllowed,
  sparkLevel5TelegramPermissionProofError,
  sparkLevel5RuntimeGuardrailsActive,
  sparkLevel5TelegramTransitionProvesFullPermission,
  sparkIsHostedRuntime,
  validateSparkAccessProfileForRuntime
} from '../src/accessPolicy';
import { resetJsonStateForTests } from '../src/jsonState';

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main(): Promise<void> {
  await test('normalizes Spark access aliases', () => {
    assert.equal(normalizeSparkAccessProfile('1'), 'chat');
    assert.equal(normalizeSparkAccessProfile('access 1'), 'chat');
    assert.equal(normalizeSparkAccessProfile('level 2'), 'builder');
    assert.equal(normalizeSparkAccessProfile('access level 2'), 'builder');
    assert.equal(normalizeSparkAccessProfile('L3'), 'agent');
    assert.equal(normalizeSparkAccessProfile('access 3'), 'agent');
    assert.equal(normalizeSparkAccessProfile('level-4'), 'developer');
    assert.equal(normalizeSparkAccessProfile('access 4'), 'developer');
    assert.equal(normalizeSparkAccessProfile('chat'), 'chat');
    assert.equal(normalizeSparkAccessProfile('chat only'), 'chat');
    assert.equal(normalizeSparkAccessProfile('mission'), 'builder');
    assert.equal(normalizeSparkAccessProfile('build'), null);
    assert.equal(normalizeSparkAccessProfile('build when asked'), 'builder');
    assert.equal(normalizeSparkAccessProfile('github'), 'agent');
    assert.equal(normalizeSparkAccessProfile('research + build'), 'agent');
    assert.equal(normalizeSparkAccessProfile('research & build'), 'agent');
    assert.equal(normalizeSparkAccessProfile('workspace'), null);
    assert.equal(normalizeSparkAccessProfile('workspace access'), 'developer');
    assert.equal(normalizeSparkAccessProfile('local workspace access'), 'developer');
    assert.equal(normalizeSparkAccessProfile('sandbox'), 'developer');
    assert.equal(normalizeSparkAccessProfile('sandboxed local access'), 'developer');
    assert.equal(normalizeSparkAccessProfile('full'), null);
    assert.equal(normalizeSparkAccessProfile('full access'), 'operator');
    assert.equal(normalizeSparkAccessProfile('operating system'), 'operator');
    assert.equal(normalizeSparkAccessProfile('OS'), 'operator');
    assert.equal(normalizeSparkAccessProfile('level 5'), 'operator');
    assert.equal(normalizeSparkAccessProfile('operator'), 'operator');
    assert.equal(normalizeSparkAccessProfile('whole computer'), 'operator');
    assert.equal(normalizeSparkAccessProfile('local project'), 'developer');
    assert.equal(normalizeSparkAccessProfile('local repo'), 'developer');
    assert.equal(normalizeSparkAccessProfile('unknown'), null);
  });

  await test('stores access profile per chat', async () => {
    resetJsonStateForTests();
    process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-access-test-'));

    assert.equal(await getConfiguredSparkAccessProfile(123), null);
    assert.equal(await getSparkAccessProfile(123), 'developer');
    await setSparkAccessProfile(123, 'agent');

    assert.equal(await getConfiguredSparkAccessProfile(123), 'agent');
    assert.equal(await getSparkAccessProfile(123), 'agent');
    assert.equal(await getSparkAccessProfile(456), 'developer');
  });

  await test('allows environment override of default access profile', async () => {
    resetJsonStateForTests();
    process.env.SPARK_GATEWAY_STATE_DIR = await mkdtemp(path.join(os.tmpdir(), 'spark-access-env-test-'));
    const originalDefault = process.env.SPARK_AGENT_ACCESS_PROFILE;
    process.env.SPARK_AGENT_ACCESS_PROFILE = 'chat only';
    try {
      assert.equal(await getSparkAccessProfile(789), 'chat');
    } finally {
      if (originalDefault === undefined) {
        delete process.env.SPARK_AGENT_ACCESS_PROFILE;
      } else {
        process.env.SPARK_AGENT_ACCESS_PROFILE = originalDefault;
      }
    }
  });

  await test('describes tool boundaries by access profile', () => {
    const matrix = [
      { profile: 'chat', spawnerBuild: false, externalResearch: false, operatingSystem: false },
      { profile: 'builder', spawnerBuild: true, externalResearch: false, operatingSystem: false },
      { profile: 'agent', spawnerBuild: true, externalResearch: true, operatingSystem: false },
      { profile: 'developer', spawnerBuild: true, externalResearch: true, operatingSystem: true },
      { profile: 'operator', spawnerBuild: true, externalResearch: true, operatingSystem: true }
    ] as const;

    for (const row of matrix) {
      assert.equal(sparkAccessAllowsSpawnerBuilds(row.profile), row.spawnerBuild, `${row.profile} spawner`);
      assert.equal(sparkAccessAllowsExternalResearch(row.profile), row.externalResearch, `${row.profile} research`);
      assert.equal(sparkAccessAllowsOperatingSystemWork(row.profile), row.operatingSystem, `${row.profile} os`);
      assert.equal(sparkAccessAllows(row.profile, 'spawner_build'), row.spawnerBuild, `${row.profile} generic spawner`);
      assert.equal(sparkAccessAllows(row.profile, 'external_research'), row.externalResearch, `${row.profile} generic research`);
      assert.equal(sparkAccessAllows(row.profile, 'operating_system'), row.operatingSystem, `${row.profile} generic os`);
    }

    assert.equal(sparkAccessAllowsWorkspaceBuilds('agent'), false);
    assert.equal(sparkAccessAllowsWorkspaceBuilds('developer'), true);
    assert.equal(sparkAccessAllowsWorkspaceBuilds('operator'), true);
    assert.equal(sparkAccessLevel('developer'), 4);
    assert.equal(sparkAccessLevel('operator'), 5);
    assert.equal(sparkAccessLabel('agent'), 'Access level 3');
    assert.equal(sparkAccessLabel('developer'), 'Access level 4');
    assert.equal(sparkAccessLabel('operator'), 'Access level 5');
    assert.match(describeSparkAccessProfile('developer'), /Sandboxed local work/);
    assert.match(describeSparkAccessProfile('developer'), /\/access_setup/);
    assert.doesNotMatch(describeSparkAccessProfile('developer'), /prove it is writable/);
    assert.match(describeSparkAccessProfile('operator'), /Whole-computer operator work/);
    assert.match(describeSparkAccessProfile('agent'), /No local files/);
    assert.match(renderSparkAccessStatus('agent'), /Spark access: Access level 3/);
    assert.match(renderSparkAccessStatus('agent'), /Levels:/);
    assert.match(renderSparkAccessStatus('agent'), /4 - Workspace files and local debugging/);
    assert.match(renderSparkAccessStatus('agent'), /5 - Whole-computer operator mode/);
    assert.match(renderSparkAccessStatus('builder'), /Requested Spawner builds and missions/);
    assert.match(renderSparkAccessStatus('agent'), /\/access 4/);
    assert.match(renderSparkAccessLevelGuide(), /Chat, memory, recall, diagnostics/);
    assert.match(renderSparkAccessLevelGuide(), /Requested builds and missions/);
    assert.match(renderSparkAccessLevelGuide(), /Public research plus requested builds/);
    assert.match(renderSparkAccessLevelGuide(), /Recommended/);
    assert.match(renderSparkAccessLevelGuide(), /\/access_setup/);
    assert.match(renderSparkAccessLevelGuide(), /Whole-computer operator mode/);
    assert.match(renderSparkAccessLevelGuide(), /Safety stays on/);
    assert.ok(renderSparkAccessStatus('operator').length < 760);
    assert.ok(renderSparkAccessStatus('operator').split('\n').length <= 16);
    assert.match(renderSparkAccessOnboarding(), /Default right now: Access level 4/);
    assert.match(renderSparkAccessOnboarding('agent'), /Choose how much access this Telegram chat has/);
    assert.match(renderSparkAccessOnboarding('agent'), /Levels:/);
    assert.match(renderSparkAccessOnboarding('agent'), /4 - Workspace files and local debugging/);
    assert.match(renderSparkAccessOnboarding('agent'), /5 - Whole-computer operator mode/);
    assert.match(renderSparkAccessOnboarding('agent'), /Default right now: Access level 3/);
    assert.match(renderSparkAccessOnboarding('developer'), /Default right now: Access level 4/);
    assert.match(renderSparkAccessOnboarding('agent'), /Change it anytime/);
  });

  await test('renders compact conversational access replies', () => {
    const status = renderSparkAccessBriefStatus('developer');
    assert.match(status, /You are on Access level 4/);
    assert.match(status, /approved Spark workspaces/);
    assert.match(status, /\/access_setup/);
    assert.match(status, /\/access 3/);
    assert.doesNotMatch(status, /What each access level allows/);

    const writableStatus = renderSparkAccessBriefStatus('developer', {
      runnerWritable: 'yes',
      runnerLabel: 'test runner writable'
    });
    assert.match(writableStatus, /Runner: writable here/);

    const mismatchStatus = renderSparkAccessCapabilityStatus('developer', {
      runnerWritable: 'no',
      runnerLabel: 'test runner read-only',
      failureReason: 'EROFS'
    });
    assert.match(mismatchStatus, /Access: Access level 4/);
    assert.match(mismatchStatus, /Runner: read-only \(EROFS\)/);
    assert.doesNotMatch(mismatchStatus, /Important distinction/);
    assert.doesNotMatch(mismatchStatus, /AOC should show/);

    const operatorStatus = renderSparkAccessBriefStatus('operator', { runnerWritable: 'yes' });
    assert.match(operatorStatus, /You are already on Access level 5/);
    assert.match(operatorStatus, /needs live guardrail and effective-sandbox proof/i);
    assert.match(operatorStatus, /Runner: writable here/);
    assert.match(operatorStatus, /Use `\/access 4`/);

    const operatorChange = renderSparkAccessChangeSummary('operator', { runnerWritable: 'yes' });
    assert.match(operatorChange, /Done - I changed this chat setting to Access level 5/);
    assert.match(operatorChange, /verify live guardrails and the effective Codex sandbox/);
    assert.match(operatorChange, /still ask before deleting important files/);
    assert.doesNotMatch(operatorChange, /Important distinction/);

    const developerChange = renderSparkAccessChangeSummary('developer', { runnerWritable: 'yes' });
    assert.match(developerChange, /safe Spark workspace/);
    assert.doesNotMatch(developerChange, /Current runner: writable preflight/);

    const confirmations = [
      ['chat', 'Done - I changed this chat setting to Access level 1.'],
      ['builder', 'Done - I changed this chat setting to Access level 2.'],
      ['agent', 'Done - I changed this chat setting to Access level 3.'],
      ['developer', 'Done - I changed this chat setting to Access level 4.'],
      ['operator', 'Done - I changed this chat setting to Access level 5.']
    ] as const;
    for (const [profile, expected] of confirmations) {
      const changed = renderSparkAccessChangeConfirmation(profile);
      assert.equal(changed, expected);
      assert.doesNotMatch(changed, /What each level means/);
      assert.doesNotMatch(changed, /Change it with/);
      assert.doesNotMatch(changed, /Default/);
    }

    const help = renderSparkAccessConversationHelp('builder');
    assert.match(help, /This chat is on Access level 2/);
    assert.match(help, /4 - Workspace files and local debugging/);
    assert.match(help, /5 - Whole-computer operator mode/);
    assert.match(help, /writable runner/);
    assert.match(help, /\/access 1/);
    assert.doesNotMatch(renderSparkAccessLevelGuide(), /\/level5_setup/);
    assert.match(renderSparkAccessLevelGuide(), /\/access 5/);

    const level5Prompt = renderSparkAccessLevel5ConfirmationPrompt();
    assert.match(level5Prompt, /trusted local machine/);
    assert.match(level5Prompt, /Tap Confirm/);
    assert.doesNotMatch(level5Prompt, /Restart Spark/);
  });

  await test('Level 5 Telegram transition requires full sandbox proof and writable runner', () => {
    const fullPayload = {
      effective_access_level: 5,
      level5: {
        service_enabled: true,
        effective_codex_sandbox: 'danger-full-access'
      },
      state_machine: {
        service_can_operate_whole_computer: true,
        can_operate_whole_computer: true
      }
    };

    assert.equal(
      sparkLevel5TelegramTransitionProvesFullPermission(fullPayload, { runnerWritable: 'yes' }),
      true
    );
    for (const runnerWritable of ['no', 'unknown'] as const) {
      assert.equal(
        sparkLevel5TelegramTransitionProvesFullPermission(fullPayload, {
          runnerWritable,
          failureReason: runnerWritable === 'no' ? 'EROFS' : undefined
        }),
        false,
        `runner ${runnerWritable} must not become Telegram Level 5 full permission`
      );
    }
    assert.equal(
      sparkLevel5TelegramTransitionProvesFullPermission({
        ...fullPayload,
        level5: {
          service_enabled: true,
          effective_codex_sandbox: 'read-only'
        }
      }, { runnerWritable: 'yes' }),
      false
    );
    assert.equal(sparkLevel5TelegramPermissionProofError(fullPayload, { runnerWritable: 'yes' }), null);
    assert.match(
      sparkLevel5TelegramPermissionProofError(fullPayload, { runnerWritable: 'no', failureReason: 'EROFS' }) || '',
      /read-only \(EROFS\)/
    );
  });

  await test('slash access setter uses authoritative status and compact confirmation', async () => {
    const indexSource = await readFile(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    const accessPolicySource = await readFile(path.join(__dirname, '..', 'src', 'accessPolicy.ts'), 'utf8');
    const accessCommand = indexSource.match(/bot\.command\('access', async \(ctx\) => \{[\s\S]*?\n\}\);/);
    assert.ok(accessCommand, 'expected /access command handler to exist');
    assert.match(accessCommand[0], /renderAuthoritativeSparkAccessStatus\(ctx\.chat\.id\)/);
    assert.match(accessCommand[0], /applySparkAccessProfileChange\(ctx, next\)/);
    assert.match(accessCommand[0], /current === 'operator'/);
    assert.match(indexSource, /renderLevel5ActivationAnswer\(ctx\.chat\.id\)/);
    assert.doesNotMatch(accessCommand[0], /ctx\.reply\(renderSparkAccessStatus\(next\)\)/);
    assert.match(indexSource, /renderSparkAccessChangeConfirmation\(profile\)/);
    assert.match(indexSource, /renderSparkAccessChangeSummary\(profile, await probeTelegramRunnerWritability\(\)\)/);
    assert.match(indexSource, /renderSparkAccessLevel5ConfirmationPrompt\(\), buildSparkAccessLevel5ConfirmKeyboard\(\)/);
    assert.match(indexSource, /bot\.action\(\/\^spark_access_level:operator:confirm/);
    assert.match(indexSource, /Access Level 5 guardrails were prepared\./);
    assert.match(indexSource, /sparkLevel5PayloadProvesFullAccess/);
    assert.match(indexSource, /sparkLevel5TelegramPermissionProofError/);
    assert.match(indexSource, /level5FullAccessProofAvailable/);
    assert.match(accessPolicySource, /function sparkLevel5PayloadProvesFullAccess/);
    assert.match(accessPolicySource, /function sparkLevel5TelegramPermissionProofError/);
    assert.match(indexSource, /await readLevel5FullAccessProof\(\)/);
    assert.match(indexSource, /const level5ProofReady = next === 'operator' \? await level5FullAccessProofAvailable\(\) : false/);
    assert.match(indexSource, /level5ProofReady \? \{ ok: true as const \} : validateSparkAccessProfileForRuntime\(next\)/);
    assert.match(indexSource, /I did not switch this chat to Access Level 5 yet/);
    assert.match(accessPolicySource, /effectiveAccess === 5/);
    assert.match(accessPolicySource, /serviceEnabled/);
    assert.match(accessPolicySource, /canOperateWholeComputer/);
    assert.match(accessPolicySource, /effective_codex_sandbox \|\| ''\) === 'danger-full-access'/);
    assert.match(indexSource, /Access Level 5 setup did not prove danger-full-access effective sandbox/);
    assert.match(indexSource, /const fullAccessSandbox = effectiveCodexSandbox === 'danger-full-access'/);
    assert.match(indexSource, /serviceEnabled && chatProfile === 'operator' && stateMachineWholeComputer && fullAccessSandbox/);
    assert.match(indexSource, /I will not claim full operator access until the effective Codex sandbox is danger-full-access/);
    assert.match(indexSource, /isLevel5ServiceEnabled/);
    assert.match(indexSource, /runSparkAccessActionDetailed\(actionId\)/);
    assert.match(indexSource, /level5_disable/);
    assert.match(indexSource, /authorizeAccessChangeCommand/);
    assert.match(indexSource, /authorizeSparkAccessActionCommand/);
    assert.match(indexSource, /bot\.command\('access_setup'/);
    assert.match(indexSource, /bot\.command\('docker_doctor'/);
    assert.match(indexSource, /bot\.command\('docker_smoke'/);
    assert.match(indexSource, /bot\.command\('level5_setup'/);
    assert.match(indexSource, /bot\.command\('level5_disable'/);
    assert.match(indexSource, /\/access 5 - Approve Level 5 setup from Telegram/);
    assert.doesNotMatch(indexSource, /\/level5_setup confirm - Prepare/);
    assert.match(indexSource, /bot\.action\(\/\^spark_access:/);
  });

  await test('normal guidance keeps level5 setup as a legacy alias only', async () => {
    const llmSource = await readFile(path.join(__dirname, '..', 'src', 'llm.ts'), 'utf8');
    assert.match(llmSource, /activated from \/access 5 with one Confirm button/);
    assert.match(llmSource, /legacy\/admin alias/);
    assert.doesNotMatch(renderSparkAccessStatus('operator'), /\/level5_setup/);
  });

  await test('natural state-sensitive chat is grounded by fresh runtime truth', async () => {
    const indexSource = await readFile(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    const liveSurfaceSource = await readFile(path.join(__dirname, '..', 'src', 'sparkLiveStatusSurface.ts'), 'utf8');
    assert.match(indexSource, /function runtimeTruthSignals/);
    assert.match(indexSource, /shouldAnswerAuthoritativeRuntimeStatus/);
    assert.match(indexSource, /renderAuthoritativeSparkLiveStateAnswer/);
    assert.match(indexSource, /shouldAnswerAuthoritativeAccessCapability/);
    assert.match(indexSource, /renderAuthoritativeSparkEditCapabilityAnswer/);
    assert.match(indexSource, /const fullAccessSandbox = accessState\.effectiveCodexSandbox === 'danger-full-access'/);
    assert.match(indexSource, /effective full-access sandbox/);
    assert.match(indexSource, /shouldAnswerRuntimeTruthPriority/);
    assert.match(indexSource, /renderRuntimeTruthPriorityAnswer/);
    assert.match(indexSource, /shouldAnswerSparkRiskProfile/);
    assert.match(indexSource, /renderAuthoritativeSparkRiskProfileAnswer/);
    assert.match(indexSource, /shouldAnswerRestartSurvivalQuestion/);
    assert.match(indexSource, /renderRestartSurvivalAnswer/);
    assert.match(indexSource, /shouldAnswerRestartNeededQuestion/);
    assert.match(indexSource, /renderRestartNeededAnswer/);
    assert.match(indexSource, /shouldAnswerMissionProvenanceQuestion/);
    assert.match(indexSource, /renderMissionProvenanceAnswer/);
    assert.match(indexSource, /shouldAnswerMemoryRuntimeSeparation/);
    assert.match(indexSource, /renderMemoryRuntimeSeparationAnswer/);
    assert.match(indexSource, /buildFreshRuntimeTruthContext\(text, ctx\.chat\.id\)/);
    assert.match(indexSource, /recordTelegramSourceUsedEvidence/);
    assert.match(indexSource, /runtimeTruthSourceEvidence/);
    assert.match(indexSource, /runBuilderSourceUsed/);
    assert.match(indexSource, /selectedRoute/);
    assert.match(indexSource, /telegram_live_state_answer/);
    assert.match(indexSource, /telegram_fresh_runtime_context/);
    assert.match(indexSource, /source: 'current_diagnostics'/);
    assert.match(indexSource, /source: 'runner_preflight'/);
    assert.match(indexSource, /source: 'mission_trace'/);
    assert.match(indexSource, /current\\s\+\(\?:live\\s\+\)\?\(\?:state\|status\)\\s\+of\\s\+spark/);
    assert.match(indexSource, /runSparkCli\(\['live', 'status'\]/);
    assert.match(indexSource, /runSparkCli\(\['providers', 'status'\]/);
    assert.match(indexSource, /runSparkCli\(\['verify', '--deep'\]/);
    assert.match(indexSource, /ephemeral, not memory/);
    assert.match(indexSource, /higher priority than older memory, persona, or generic access doctrine/);
    assert.match(indexSource, /const hasFreshRuntimeTruth = Boolean\(freshRuntimeTruthContext\)/);
    assert.match(indexSource, /if \(!hasFreshRuntimeTruth && !bypassBuilderBridge\) \{[\s\S]*?builderBridgeRunner/);
    assert.match(indexSource, /shouldBypassBuilderBridgeForTurnIntent/);
    assert.match(indexSource, /Authoritative current-state context for this answer/);
    assert.match(indexSource, /highest-priority source for current state/);
    assert.match(indexSource, /const reply = await renderAuthoritativeSparkLiveStateAnswer\(\{ rawDetails: shouldShowRawSparkLiveDetails\(text\) \}\);[\s\S]*?await ctx\.reply\(reply\);/);
    assert.match(liveSurfaceSource, /Live loop/);
    assert.match(liveSurfaceSource, /Spawner: \$\{summary\.spawnerOk \? 'reachable' : 'needs attention'\}/);
    assert.match(liveSurfaceSource, /Telegram: \$\{summary\.telegramOk \? 'polling' : 'needs attention'\}/);
    assert.match(liveSurfaceSource, /Mission Control: \$\{summary\.liveReady \? 'ready' : 'not fully ready'\}/);
    assert.match(liveSurfaceSource, /Raw proof/);
    assert.match(indexSource, /shouldShowRawSparkLiveDetails/);
    assert.match(liveSurfaceSource, /replace\(\/\\n\{3,\}\/g, '\\n\\n'\)\.trim\(\)/);
    assert.doesNotMatch(indexSource, /System Status\\n\\n/);
    const liveSummaryFn = liveSurfaceSource.match(/function renderSparkLiveSummary[\s\S]*?\r?\n}\r?\n\r?\nexport function shouldShowRawSparkLiveDetails/);
    assert.ok(liveSummaryFn, 'expected live summary formatter to exist');
    assert.doesNotMatch(liveSummaryFn[0], /Fresh check:/);
    assert.match(indexSource, /const reply = await renderAuthoritativeSparkEditCapabilityAnswer\(ctx\.chat\.id\);[\s\S]*?await ctx\.reply\(reply\);/);
    assert.match(indexSource, /fresh `spark live status` says Spawner is up/);
    assert.match(indexSource, /Current Spark risk profile:/);
    assert.match(liveSurfaceSource, /No restart needed\. Restarting now would mostly add churn\./);
    assert.match(indexSource, /Memory can change recall\/history/);
    assert.match(indexSource, /A plain chat answer would not have a Spawner mission id/);
    assert.match(indexSource, /failed to record \$\{item\.source\} for \$\{selectedRoute\}/);
    assert.doesNotMatch(indexSource, /isLevel5ActivationStatusQuestion/);
    assert.doesNotMatch(indexSource, /if \(!earlyBuildIntent && isAccessStatusQuestion\(text\)[\s\S]{0,180}return;/);
  });

  await test('Telegram fresh runtime answers record Builder source-used evidence', async () => {
    const bridgeSource = await readFile(path.join(__dirname, '..', 'src', 'builderBridge.ts'), 'utf8');
    const indexSource = await readFile(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');

    assert.match(bridgeSource, /export interface BuilderSourceUsedInput/);
    assert.match(bridgeSource, /export async function runBuilderSourceUsed/);
    assert.match(bridgeSource, /'self',\s*'source-used'/);
    assert.match(bridgeSource, /liveState\?: Record<string, unknown>/);
    assert.match(bridgeSource, /--live-state-json/);
    assert.match(bridgeSource, /--freshness/);
    assert.match(bridgeSource, /--source-ref/);
    assert.match(bridgeSource, /--selected-route/);
    assert.match(bridgeSource, /function sourceLedgerLabel/);
    assert.match(bridgeSource, /sourceLedgerLabel\(input\.userIntent \|\| input\.selectedRoute, 'telegram_source_used_evidence'\)/);
    assert.match(bridgeSource, /'session:telegram:redacted'/);
    assert.match(bridgeSource, /'human:telegram:redacted'/);
    assert.doesNotMatch(bridgeSource, /source-used'[\s\S]{0,900}session:telegram:\$\{String\(input\.chatId\)/);
    assert.match(bridgeSource, /eventId: String\(payload\.event_id \|\| ''\)/);

    assert.match(indexSource, /runBuilderSourceUsed\(\{/);
    assert.match(indexSource, /currentMessage: selectedRoute/);
    assert.match(indexSource, /userIntent: selectedRoute/);
    assert.doesNotMatch(indexSource, /runBuilderSourceUsed\(\{[\s\S]{0,500}userIntent: currentMessage/);
    assert.match(indexSource, /selectedRoute,\r?\n\s*confidence/);
    assert.match(indexSource, /telegram_status_command/);
    assert.match(indexSource, /telegram_spark_risk_profile_answer/);
    assert.match(indexSource, /telegram_restart_survival_answer/);
    assert.match(indexSource, /telegram_mission_provenance_answer/);
    assert.match(indexSource, /async function buildAocLiveState/);
    assert.match(indexSource, /source: 'telegram_runtime_probe'/);
    assert.match(indexSource, /liveState,/);
  });

  await test('no-edit Spawner probes honor the requested exact reply', async () => {
    const indexSource = await readFile(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    assert.match(indexSource, /function extractNoEditMissionReplyPhrase/);
    assert.match(indexSource, /const replyPhrase = extractNoEditMissionReplyPhrase\(text\)/);
    assert.match(indexSource, /Reply with exactly: \$\{replyPhrase\}/);
    assert.doesNotMatch(indexSource, /Reply with exactly: GOLDEN_PATH_OK\. Do not edit files/);
    assert.match(indexSource, /requested exact reply: \$\{replyPhrase\}/);
  });

  await test('gates Spawner command side doors by access level', async () => {
    const indexSource = await readFile(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');

    const pendingCreatorControl = indexSource.match(/async function handlePendingCreatorMissionControl[\s\S]*?\nfunction isBareExecutionStart/);
    assert.ok(pendingCreatorControl, 'expected pending creator mission control handler to exist');
    assert.match(pendingCreatorControl[0], /sparkAccessAllows\(accessProfile, 'spawner_build'\)/);
    assert.match(pendingCreatorControl[0], /renderSparkAccessDenial\(accessProfile, 'spawner_build'\)/);

    const boardCommand = indexSource.match(/bot\.command\('board', async \(ctx\) => \{[\s\S]*?\n\}\);/);
    assert.ok(boardCommand, 'expected /board command handler to exist');
    assert.match(boardCommand[0], /sparkAccessAllows\(accessProfile, 'spawner_build'\)/);

    const missionCommand = indexSource.match(/bot\.command\('mission', async \(ctx\) => \{[\s\S]*?\n\}\);/);
    assert.ok(missionCommand, 'expected /mission command handler to exist');
    assert.match(missionCommand[0], /sparkAccessAllows\(accessProfile, 'spawner_build'\)/);

    const naturalBoardRoute = indexSource.match(/const spawnerBoardIntent = parseContextualSpawnerBoardNaturalIntent\(text, contextualTurns\);[\s\S]*?\n    if \(isLocalSparkServiceRequest/);
    assert.ok(naturalBoardRoute, 'expected natural Spawner board route to exist');
    assert.match(naturalBoardRoute[0], /sparkAccessAllows\(accessProfile, 'spawner_build'\)/);
    assert.match(naturalBoardRoute[0], /renderSparkAccessDenial\(accessProfile, 'spawner_build'\)/);
  });

  await test('validates mixed access change and build intents before mutating access', async () => {
    const indexSource = await readFile(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    const buildIntentRoute = indexSource.match(/if \(buildIntent\) \{\s*console\.log\(`\[BuildIntent\][\s\S]*?await handleBuildIntent\(/);
    assert.ok(buildIntentRoute, 'expected main build intent route to exist');
    assert.match(buildIntentRoute[0], /validateSparkAccessProfileForRuntime\(normalizedAccessPreference\)/);
    assert.match(buildIntentRoute[0], /normalizedAccessPreference === 'operator' && await level5FullAccessProofAvailable\(\)/);
    assert.match(buildIntentRoute[0], /await ctx\.reply\(runtimeGate\.message\)/);
    assert.match(buildIntentRoute[0], /await setSparkAccessProfile\(ctx\.chat\.id, normalizedAccessPreference\)/);
  });

  await test('agent operating context uses Telegram-safe command aliases', async () => {
    const indexSource = await readFile(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    const distIndexSource = await readFile(path.join(__dirname, '..', 'dist', 'index.js'), 'utf8');
    assert.match(indexSource, /bot\.command\('context', handleAgentOperatingContextCommand\)/);
    assert.match(indexSource, /bot\.command\('operating_context', handleAgentOperatingContextCommand\)/);
    assert.match(indexSource, /bot\.command\('agent_context', handleAgentOperatingContextCommand\)/);
    assert.match(indexSource, /bot\.command\('black_box', handleAgentBlackBoxCommand\)/);
    assert.match(indexSource, /bot\.command\('blackbox', handleAgentBlackBoxCommand\)/);
    assert.match(indexSource, /bot\.hears\(\/\^\\\/black-box/);
    assert.match(indexSource, /bot\.command\('probe', handleAgentRouteProbeCommand\)/);
    assert.match(indexSource, /bot\.command\('route_probe', handleAgentRouteProbeCommand\)/);
    assert.match(indexSource, /authorizeRouteProbeCommand/);
    assert.match(indexSource, /route: 'route\.probe'/);
    assert.match(indexSource, /recordTelegramHarnessCoreExecution\(authorization, \{[\s\S]{0,260}toolName: 'route\.probe'/);
    assert.match(indexSource, /bot\.command\('nl_route', handleNaturalRouteProbeCommand\)/);
    assert.match(indexSource, /bot\.command\('natural_route', handleNaturalRouteProbeCommand\)/);
    assert.match(indexSource, /bot\.command\('ledger', handleCapabilityLedgerReviewCommand\)/);
    assert.match(indexSource, /bot\.command\('capabilities', handleCapabilityGardenCommand\)/);
    assert.match(indexSource, /bot\.command\('authority', handleAuthorityStatusCommand\)/);
    assert.match(indexSource, /bot\.command\('trace_repair', handleTraceRepairCommand\)/);
    assert.match(indexSource, /bot\.command\('proof', handleHarnessProofCommand\)/);
    assert.match(indexSource, /bot\.command\('harness_proof', handleHarnessProofCommand\)/);
    assert.match(indexSource, /bot\.command\('memory_movement', handleMemoryMovementCommand\)/);
    assert.match(indexSource, /bot\.command\('voice', async \(ctx\) => \{/);
    assert.match(indexSource, /telegramCommandActionAuthorityDecision\(ctx, \{[\s\S]{0,500}route: 'voice\.command'/);
    assert.match(indexSource, /replyViaBuilder\(ctx, voiceText, authorization\.legacyEnvelope\)/);
    assert.doesNotMatch(indexSource, /spark\.getVoice\(\)/);
    const sparkSource = await readFile(path.join(__dirname, '..', 'src', 'spark.ts'), 'utf8');
    const distSparkSource = await readFile(path.join(__dirname, '..', 'dist', 'spark.js'), 'utf8');
    assert.doesNotMatch(sparkSource, /getVoice/);
    assert.doesNotMatch(distSparkSource, /getVoice/);
    assert.match(distIndexSource, /bot\.command\('voice', async \(ctx\) => \{/);
    assert.match(distIndexSource, /telegramCommandActionAuthorityDecision\(ctx, \{[\s\S]{0,500}route: 'voice\.command'/);
    assert.match(distIndexSource, /replyViaBuilder\(ctx, voiceText, authorization\.legacyEnvelope\)/);
    assert.doesNotMatch(distIndexSource, /spark_1\.spark\.getVoice\(\)/);
    assert.match(indexSource, /AOC_CORE_ROUTE_KEYS/);
    assert.match(indexSource, /firstArg === 'core'/);
    assert.match(indexSource, /firstArg === 'all'/);
    assert.match(indexSource, /bot\.command\('conversation_context'/);
    assert.doesNotMatch(indexSource, /bot\.command\('operating-context'/);
    assert.doesNotMatch(indexSource, /bot\.command\('agent-context'/);
    assert.doesNotMatch(indexSource, /bot\.command\('route-probe'/);
  });

  await test('renders runtime access hints that prevent filesystem access contradictions', () => {
    assert.match(renderSparkAccessRuntimeHint('developer'), /Current Spark access: Access level 4/);
    assert.match(renderSparkAccessRuntimeHint('developer'), /check runner writability/);
    assert.match(renderSparkAccessRuntimeHint('developer'), /\/access_setup/);
    assert.match(renderSparkAccessRuntimeHint('developer'), /Spawner\/Codex/);
    assert.match(renderSparkAccessRuntimeHint('operator'), /Current Spark access: Access level 5/);
    assert.match(renderSparkAccessRuntimeHint('operator'), /Whole-computer operator mode/);
    assert.match(renderSparkAccessRuntimeHint('agent'), /Current Spark access: Access level 3/);
    assert.match(renderSparkAccessRuntimeHint('agent'), /Use \/access 4/);
    assert.match(renderSparkAccessRuntimeHint('chat'), /Do not claim local filesystem access/);
  });

  await test('classifies operating-system work and renders denial copy', () => {
    assert.equal(sparkMissionNeedsOperatingSystemAccess('say exactly OK'), false);
    assert.equal(sparkMissionNeedsOperatingSystemAccess('build this at C:\\Users\\USER\\Desktop\\probe'), true);
    assert.equal(sparkMissionNeedsOperatingSystemAccess('debug my local project'), true);
    assert.equal(sparkMissionNeedsOperatingSystemAccess('create a small browser app', '/Users/me/app'), true);

    assert.match(renderSparkAccessDenial('chat', 'spawner_build'), /Access level 2/);
    assert.match(renderSparkAccessDenial('chat', 'spawner_build'), /change my access level to 2/);
    assert.match(renderSparkAccessDenial('chat', 'spawner_build'), /\/access 2/);
    assert.match(renderSparkAccessDenial('builder', 'external_research'), /Access level 3/);
    assert.match(renderSparkAccessDenial('builder', 'external_research'), /change my access level to 3/);
    assert.match(renderSparkAccessDenial('builder', 'external_research'), /change my access level to 4/);
    assert.match(renderSparkAccessDenial('agent', 'operating_system'), /operating system/);
    assert.match(renderSparkAccessDenial('agent', 'operating_system'), /change my access level to 4/);
    assert.match(renderSparkAccessDenial('agent', 'operating_system'), /\/access 5/);
    assert.match(renderSparkAccessDenial('agent', 'operating_system'), /\/access 4/);
  });

  await test('gates access level 4 on hosted Spark Live unless explicitly enabled', () => {
    assert.equal(sparkIsHostedRuntime({}), false);
    assert.equal(sparkIsHostedRuntime({ SPARK_LIVE_CONTAINER: '1' }), true);
    assert.equal(sparkIsHostedRuntime({ SPARK_SPAWNER_HOST: '0.0.0.0' }), true);
    assert.equal(sparkIsHostedRuntime({ SPARK_SPAWNER_HOST: '::' }), true);
    assert.equal(sparkIsHostedRuntime({ SPARK_ALLOWED_HOSTS: 'agent.example.com' }), true);

    assert.equal(sparkHostedFullAccessAllowed({}), false);
    assert.equal(sparkHostedFullAccessAllowed({ SPARK_ALLOW_HOSTED_FULL_ACCESS: 'true' }), true);
    assert.equal(sparkHighAgencyWorkersAllowed({}), false);
    assert.equal(sparkHighAgencyWorkersAllowed({ SPARK_ALLOW_HIGH_AGENCY_WORKERS: '1' }), true);
    assert.equal(sparkLevel5RuntimeGuardrailsActive({}), false);
    assert.equal(sparkLevel5RuntimeGuardrailsActive({ SPARK_ALLOW_HIGH_AGENCY_WORKERS: '1' }), false);
    assert.equal(sparkLevel5RuntimeGuardrailsActive({
      SPARK_ALLOW_HIGH_AGENCY_WORKERS: '1',
      SPARK_ALLOW_EXTERNAL_PROJECT_PATHS: '1',
      SPARK_CODEX_SANDBOX: 'danger-full-access'
    }), true);

    assert.deepEqual(validateSparkAccessProfileForRuntime('developer', {}), { ok: true });
    assert.deepEqual(validateSparkAccessProfileForRuntime('agent', { SPARK_LIVE_CONTAINER: '1' }), { ok: true });
    assert.deepEqual(
      validateSparkAccessProfileForRuntime('developer', {
        SPARK_LIVE_CONTAINER: '1',
        SPARK_ALLOW_HOSTED_FULL_ACCESS: '1'
      }),
      { ok: true }
    );
    assert.deepEqual(
      validateSparkAccessProfileForRuntime('operator', {
        SPARK_ALLOW_HIGH_AGENCY_WORKERS: '1',
        SPARK_ALLOW_EXTERNAL_PROJECT_PATHS: '1',
        SPARK_CODEX_SANDBOX: 'danger-full-access'
      }),
      { ok: true }
    );

    const partialOperatorDenied = validateSparkAccessProfileForRuntime('operator', {
      SPARK_ALLOW_HIGH_AGENCY_WORKERS: '1'
    });
    assert.equal(partialOperatorDenied.ok, false);
    if (!partialOperatorDenied.ok) {
      assert.match(partialOperatorDenied.message, /\/access 5/);
      assert.match(partialOperatorDenied.message, /Tap Confirm/);
      assert.match(partialOperatorDenied.message, /restart itself if needed/);
      assert.doesNotMatch(partialOperatorDenied.message, /\/level5_setup/);
    }

    const operatorDenied = validateSparkAccessProfileForRuntime('operator', {});
    assert.equal(operatorDenied.ok, false);
    if (!operatorDenied.ok) {
      assert.match(operatorDenied.message, /Access level 5 needs one clear confirmation/);
      assert.match(operatorDenied.message, /\/access 5/);
      assert.doesNotMatch(operatorDenied.message, /\/level5_setup/);
    }

    const denied = validateSparkAccessProfileForRuntime('developer', { SPARK_SPAWNER_HOST: '0.0.0.0' });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.match(denied.message, /Access level 4 is locked/);
      assert.match(denied.message, /\/access 3/);
      assert.match(denied.message, /SPARK_ALLOW_HOSTED_FULL_ACCESS=1/);
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
