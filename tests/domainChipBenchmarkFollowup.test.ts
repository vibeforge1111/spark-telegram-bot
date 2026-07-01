import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleNaturalDomainChipBenchmarkAutoloopFollowup } from '../src/domainChipBenchmarkFollowup';
import { assertLoopEngineeringTelegramReadability } from '../src/telegramSurface';

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function run(): Promise<void> {
await test('benchmark follow-up queues Spawner benchmark through command-result payload when bridge is available', async () => {
  const replies: string[] = [];
  const calls: any[] = [];
  const harnessSummaries: string[] = [];
  const handled = await handleNaturalDomainChipBenchmarkAutoloopFollowup({
    ctx: { reply: async (reply: string) => { replies.push(reply); } },
    text: 'run the benchmark for it',
    decision: {
      schema_version: 'spark.nlp.route_decision.v1',
      route: 'recursive.start',
      owner_system: 'spark-telegram-bot',
      confidence: 'contextual',
      action: 'recursive.command',
      payload: { rawCommand: 'start domain-chip-prd-writing-proof-loop rounds 1' },
      context_source: 'hot_recent_turns',
      matched_signals: ['natural_recursive_command'],
      blocked_by: [],
      requires_confirmation: true
    },
    rawCommand: 'start domain-chip-prd-writing-proof-loop rounds 1',
    requestId: 'turn-loop-benchmark',
    authorize: () => ({ allow: true } as any),
    replyAuthorityBlocked: async () => { replies.push('blocked'); },
    sendTyping: async () => {},
    recordNaturalExecution: () => {},
    recordHarnessExecution: (_authorization, _status, summary) => { harnessSummaries.push(summary); },
    runLoopEngineering: async (input) => {
      calls.push(input);
      return {
        success: true,
        action: 'benchmark_run_queued',
        missionId: 'spark-loop-benchmark',
        eventId: 'lee-benchmark',
        inspectUrl: 'http://127.0.0.1:3334/loop-engineering/domain-chip-prd-writing-proof-loop',
        message: 'Queued a private benchmark mission for domain-chip-prd-writing-proof-loop. It can produce evidence, but it does not approve activation or claim improvement by itself.'
      };
    },
    rememberAssistantReply: async () => {},
    redact: (value) => value
  });

  const reply = replies.join('\n');
  assert.equal(handled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'benchmark');
  assert.equal(calls[0].chipKey, 'domain-chip-prd-writing-proof-loop');
  assert.equal(calls[0].requestId, 'turn-loop-benchmark');
  assert.match(reply, /Queued a private benchmark mission/i);
  assert.match(reply, /evaluator result still decides/i);
  assert.match(reply, /Spawner: http:\/\/127\.0\.0\.1:3334\/loop-engineering\/domain-chip-prd-writing-proof-loop/i);
  assert.doesNotMatch(reply, /completed locally|starter check/i);
  assert.doesNotMatch(reply, /approved|activated/i);
  assertLoopEngineeringTelegramReadability(reply, 8);
  assert.match(harnessSummaries.join('\n'), /Spawner Loop Engineering benchmark queued/);
});

await test('loop follow-up queues capped Spawner loop through command-result payload when bridge is available', async () => {
  const replies: string[] = [];
  const calls: any[] = [];
  const handled = await handleNaturalDomainChipBenchmarkAutoloopFollowup({
    ctx: { reply: async (reply: string) => { replies.push(reply); } },
    text: 'run three loop rounds for it',
    decision: {
      schema_version: 'spark.nlp.route_decision.v1',
      route: 'recursive.start',
      owner_system: 'spark-telegram-bot',
      confidence: 'contextual',
      action: 'recursive.command',
      payload: { rawCommand: 'start domain-chip-prd-writing-proof-loop rounds 3' },
      context_source: 'hot_recent_turns',
      matched_signals: ['natural_recursive_command'],
      blocked_by: [],
      requires_confirmation: true
    },
    rawCommand: 'start domain-chip-prd-writing-proof-loop rounds 3',
    authorize: () => ({ allow: true } as any),
    replyAuthorityBlocked: async () => {},
    sendTyping: async () => {},
    recordNaturalExecution: () => {},
    recordHarnessExecution: () => {},
    runLoopEngineering: async (input) => {
      calls.push(input);
      return {
        success: true,
        action: 'loop_run_queued',
        inspectUrl: 'http://127.0.0.1:3334/loop-engineering/domain-chip-prd-writing-proof-loop',
        message: 'Queued a capped private loop mission for domain-chip-prd-writing-proof-loop. Generator work and evaluator scoring stay separated before any lesson is accepted.'
      };
    },
    rememberAssistantReply: async () => {},
    redact: (value) => value
  });

  const reply = replies.join('\n');
  assert.equal(handled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'loop');
  assert.equal(calls[0].roundLimit, 3);
  assert.match(reply, /capped private loop mission/i);
  assert.match(reply, /generator and evaluator still have to stay separated/i);
  assert.doesNotMatch(reply, /accepted improvement|activated/i);
  assertLoopEngineeringTelegramReadability(reply, 8);
});

await test('private starter check runs local hooks even when Spawner bridge is available', async () => {
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-private-check-'));
  try {
    const chipsDir = path.join(tempDir, 'chips');
    const chipRoot = path.join(chipsDir, 'domain-chip-vendor-compliance-intake');
    mkdirSync(path.join(chipRoot, 'benchmark'), { recursive: true });
    mkdirSync(path.join(chipRoot, 'reports'), { recursive: true });
    writeFileSync(path.join(chipRoot, 'chip-runner.py'), [
      'import json, pathlib, sys',
      'cmd = sys.argv[1] if len(sys.argv) > 1 else ""',
      'reports = pathlib.Path("reports")',
      'reports.mkdir(exist_ok=True)',
      'if cmd == "loop-round":',
      '    (reports / "autoloop-round-001.json").write_text(json.dumps({"case_count": 14, "score_delta": 0.0, "round_status": "blocked", "promotion_blocked": True, "network_absorbable": False}))',
      'elif cmd == "loop-gate-check":',
      '    (reports / "loop-gate-check.json").write_text(json.dumps({"gate_status": "blocked", "promotion_blocked": True, "network_absorbable": False}))',
      'elif cmd == "evaluate":',
      '    (reports / "local-evaluate-smoke.json").write_text(json.dumps({"ok": True}))',
      'elif cmd in {"watchtower-check", "rollback-check"}:',
      '    (reports / f"{cmd}.json").write_text(json.dumps({"status": "blocked", "promotion_blocked": True}))',
      'else:',
      '    raise SystemExit(2)'
    ].join('\n'));
    process.env.SPARK_DOMAIN_CHIPS_DIR = chipsDir;

    const replies: string[] = [];
    const calls: any[] = [];
    const handled = await handleNaturalDomainChipBenchmarkAutoloopFollowup({
      ctx: { reply: async (reply: string) => { replies.push(reply); } },
      text: 'run the private check',
      decision: {
        schema_version: 'spark.nlp.route_decision.v1',
        route: 'recursive.start',
        owner_system: 'spark-telegram-bot',
        confidence: 'contextual',
        action: 'recursive.command',
        payload: { rawCommand: 'start domain-chip-vendor-compliance-intake rounds 1' },
        context_source: 'hot_recent_turns',
        matched_signals: ['natural_recursive_command'],
        blocked_by: [],
        requires_confirmation: true
      },
      rawCommand: 'start domain-chip-vendor-compliance-intake rounds 1',
      authorize: () => ({ allow: true } as any),
      replyAuthorityBlocked: async () => { replies.push('blocked'); },
      sendTyping: async () => {},
      recordNaturalExecution: () => {},
      recordHarnessExecution: () => {},
      runLoopEngineering: async (input) => {
        calls.push(input);
        return { success: false, error: 'Spawner should not be used for starter checks.' };
      },
      rememberAssistantReply: async () => {},
      redact: (value) => value
    });

    const reply = replies.join('\n');
    assert.equal(handled, true);
    assert.equal(calls.length, 0);
    assert.match(reply, /private starter check for Vendor Compliance Intake/i);
    assert.match(reply, /14 practice checks ran/i);
    assert.match(reply, /nothing was promoted, published, activated, sent, or absorbed/i);
    assert.match(reply, /absorbed\.\n\nStarter result:/i);
    assert.doesNotMatch(reply, /Spawner did not accept|Queued a private benchmark/i);
    assertLoopEngineeringTelegramReadability(reply, 8);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

await test('benchmark follow-up failure reply hides local runner internals', async () => {
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-loop-fail-'));
  const fakePython = path.join(tempDir, 'fake-python.js');
  try {
    writeFileSync(fakePython, [
      '#!/usr/bin/env node',
      'console.error("Command failed: /usr/local/bin/python3 -m spark_intelligence.cli loops run --home /Users/alchemistab/.spark/state --chip domain-chip-vendor-compliance-intake reports/loop-status.json");',
      'process.exit(1);'
    ].join('\n'));
    chmodSync(fakePython, 0o755);
    process.env.SPARK_BUILDER_REPO = tempDir;
    process.env.SPARK_BUILDER_PYTHON = fakePython;
    process.env.SPARK_DOMAIN_CHIPS_DIR = path.join(tempDir, 'chips');

    const replies: string[] = [];
    const handled = await handleNaturalDomainChipBenchmarkAutoloopFollowup({
      ctx: { reply: async (reply: string) => { replies.push(reply); } },
      text: 'run the benchmark for it',
      decision: {
        schema_version: 'spark.nlp.route_decision.v1',
        route: 'recursive.start',
        owner_system: 'spark-telegram-bot',
        confidence: 'contextual',
        action: 'recursive.command',
        payload: { rawCommand: 'start domain-chip-vendor-compliance-intake rounds 1' },
        context_source: 'hot_recent_turns',
        matched_signals: ['natural_recursive_command'],
        blocked_by: [],
        requires_confirmation: true
      },
      rawCommand: 'start domain-chip-vendor-compliance-intake rounds 1',
      authorize: () => ({ allow: true } as any),
      replyAuthorityBlocked: async () => { replies.push('blocked'); },
      sendTyping: async () => {},
      recordNaturalExecution: () => {},
      recordHarnessExecution: () => {},
      rememberAssistantReply: async () => {},
      redact: (value) => value
    });

    const reply = replies.join('\n');
    assert.equal(handled, true);
    assert.match(reply, /local runner is blocked/i);
    assert.match(reply, /kept the chip private/i);
    assert.doesNotMatch(reply, /Command failed|\/usr\/local|spark_intelligence|--chip|reports\//i);
    assertLoopEngineeringTelegramReadability(reply, 8);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

await test('benchmark follow-up honors nested generated commands and attaches proof', async () => {
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-loop-ok-'));
  try {
    const chipsDir = path.join(tempDir, 'chips');
    const chipRoot = path.join(chipsDir, 'domain-chip-vendor-compliance-intake');
    mkdirSync(path.join(chipRoot, 'benchmark'), { recursive: true });
    mkdirSync(path.join(chipRoot, 'reports'), { recursive: true });
    writeFileSync(path.join(chipRoot, 'benchmark', 'evaluate-run-contract.json'), JSON.stringify({
      command: ['python3', 'chip-runner.py', 'evaluate', '--input', 'benchmark/cases.jsonl', '--output', 'reports/local-evaluate-smoke.json']
    }));
    writeFileSync(path.join(chipRoot, 'spark-chip.json'), JSON.stringify({
      commands: {
        'loop-round': ['python3', 'chip-runner.py', 'loop-round', '--output', 'reports/autoloop-round-001.json'],
        'watchtower-check': ['python3', 'chip-runner.py', 'watchtower-check', '--output', 'reports/watchtower-check.json'],
        'rollback-check': ['python3', 'chip-runner.py', 'rollback-check', '--output', 'reports/rollback-check.json'],
        'loop-gate-check': ['python3', 'chip-runner.py', 'loop-gate-check', '--output', 'reports/loop-gate-check.json']
      }
    }));
    writeFileSync(path.join(chipRoot, 'chip-runner.py'), [
      'import json, pathlib, sys',
      'cmd = sys.argv[1]',
      'if "--output" not in sys.argv:',
      '    raise SystemExit("missing generated --output")',
      'out = pathlib.Path(sys.argv[sys.argv.index("--output") + 1])',
      'out.parent.mkdir(exist_ok=True)',
      'payload = {"promotion_blocked": True, "network_absorbable": False}',
      'if cmd == "loop-round": payload.update({"case_count": 14, "score_delta": 0.0, "round_status": "blocked"})',
      'if cmd == "loop-gate-check": payload.update({"gate_status": "blocked"})',
      'out.write_text(json.dumps(payload))'
    ].join('\n'));
    process.env.SPARK_DOMAIN_CHIPS_DIR = chipsDir;

    const replies: string[] = [];
    const extras: any[] = [];
    const harnessSummaries: string[] = [];
    const handled = await handleNaturalDomainChipBenchmarkAutoloopFollowup({
      ctx: { reply: async (reply: string, extra?: any) => { replies.push(reply); extras.push(extra); } },
      text: 'run the benchmark for it',
      decision: {
        schema_version: 'spark.nlp.route_decision.v1',
        route: 'recursive.start',
        owner_system: 'spark-telegram-bot',
        confidence: 'contextual',
        action: 'recursive.command',
        payload: { rawCommand: 'start domain-chip-vendor-compliance-intake rounds 1' },
        context_source: 'hot_recent_turns',
        matched_signals: ['natural_recursive_command'],
        blocked_by: [],
        requires_confirmation: true
      },
      rawCommand: 'start domain-chip-vendor-compliance-intake rounds 1',
      authorize: () => ({ allow: true } as any),
      replyAuthorityBlocked: async () => { replies.push('blocked'); },
      sendTyping: async () => {},
      recordNaturalExecution: () => {},
      recordHarnessExecution: (_authorization, _status, summary) => { harnessSummaries.push(summary); },
      replyExtra: () => ({
        __sparkTraceContext: {
          route: 'recursive.start',
          proofCapsule: {
            schema: 'spark.harness_proof.v1',
            execution: { tool: 'recursive.loop', mutationClass: 'launches_mission', status: 'completed' },
            reply: { rawReasonsHidden: true }
          }
        }
      }),
      rememberAssistantReply: async () => {},
      redact: (value) => value
    });

    const reply = replies.join('\n');
    assert.equal(handled, true);
    assert.doesNotMatch(harnessSummaries.join('\n'), /failed/i);
    assert.match(reply, /private starter check for Vendor Compliance Intake/i);
    assert.match(reply, /14 practice checks ran/i);
    assert.match(reply, /did not show a usefulness gain yet/i);
    assert.match(reply, /safety gate stayed closed/i);
    assert.match(reply, /nothing was promoted, published, activated, sent, or absorbed/i);
    assert.match(reply, /does not prove this chip improves real work yet/i);
    assertLoopEngineeringTelegramReadability(reply, 8);
    assert.equal(extras[0]?.__sparkTraceContext?.proofCapsule?.execution?.tool, 'recursive.loop');
    assert.equal(extras[0]?.__sparkTraceContext?.proofCapsule?.execution?.mutationClass, 'launches_mission');
    assert.equal(extras[0]?.__sparkTraceContext?.proofCapsule?.reply?.rawReasonsHidden, true);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

await test('benchmark follow-up blocks unsafe generated proof fields', async () => {
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-loop-unsafe-'));
  try {
    const chipsDir = path.join(tempDir, 'chips');
    const chipRoot = path.join(chipsDir, 'domain-chip-vendor-compliance-intake');
    mkdirSync(path.join(chipRoot, 'benchmark'), { recursive: true });
    mkdirSync(path.join(chipRoot, 'reports'), { recursive: true });
    writeFileSync(path.join(chipRoot, 'benchmark', 'evaluate-run-contract.json'), JSON.stringify({
      command: ['python3', 'chip-runner.py', 'evaluate', '--input', 'benchmark/cases.jsonl', '--output', 'reports/local-evaluate-smoke.json']
    }));
    writeFileSync(path.join(chipRoot, 'spark-chip.json'), JSON.stringify({
      commands: {
        'loop-round': ['python3', 'chip-runner.py', 'loop-round', '--output', 'reports/autoloop-round-001.json'],
        'watchtower-check': ['python3', 'chip-runner.py', 'watchtower-check', '--output', 'reports/watchtower-check.json'],
        'rollback-check': ['python3', 'chip-runner.py', 'rollback-check', '--output', 'reports/rollback-check.json'],
        'loop-gate-check': ['python3', 'chip-runner.py', 'loop-gate-check', '--output', 'reports/loop-gate-check.json']
      }
    }));
    writeFileSync(path.join(chipRoot, 'chip-runner.py'), [
      'import json, pathlib, sys',
      'cmd = sys.argv[1]',
      'out = pathlib.Path(sys.argv[sys.argv.index("--output") + 1]) if "--output" in sys.argv else pathlib.Path("reports/out.json")',
      'out.parent.mkdir(exist_ok=True)',
      'payload = {"promotion_blocked": False, "network_absorbable": True}',
      'if cmd == "loop-round": payload.update({"case_count": 14, "score_delta": 0.0, "round_status": "passed"})',
      'if cmd == "loop-gate-check": payload.update({"gate_status": "passed"})',
      'out.write_text(json.dumps(payload))'
    ].join('\n'));
    process.env.SPARK_DOMAIN_CHIPS_DIR = chipsDir;

    const replies: string[] = [];
    const harnessStatuses: string[] = [];
    const handled = await handleNaturalDomainChipBenchmarkAutoloopFollowup({
      ctx: { reply: async (reply: string) => { replies.push(reply); } },
      text: 'run the benchmark for it',
      decision: {
        schema_version: 'spark.nlp.route_decision.v1',
        route: 'recursive.start',
        owner_system: 'spark-telegram-bot',
        confidence: 'contextual',
        action: 'recursive.command',
        payload: { rawCommand: 'start domain-chip-vendor-compliance-intake rounds 1' },
        context_source: 'hot_recent_turns',
        matched_signals: ['natural_recursive_command'],
        blocked_by: [],
        requires_confirmation: true
      },
      rawCommand: 'start domain-chip-vendor-compliance-intake rounds 1',
      authorize: () => ({ allow: true } as any),
      replyAuthorityBlocked: async () => {},
      sendTyping: async () => {},
      recordNaturalExecution: () => {},
      recordHarnessExecution: (_authorization, status) => { harnessStatuses.push(status); },
      rememberAssistantReply: async () => {},
      redact: (value) => value
    });

    const reply = replies.join('\n');
    assert.equal(handled, true);
    assert.ok(harnessStatuses.includes('failure'));
    assert.match(reply, /local runner is blocked/i);
    assert.match(reply, /kept the chip private/i);
    assert.doesNotMatch(reply, /completed locally|nothing was promoted|starter safety check passed/i);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

await test('benchmark follow-up rejects hostile generated commands', async () => {
  const originalEnv = { ...process.env };
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'spark-domain-chip-loop-hostile-'));
  try {
    const chipsDir = path.join(tempDir, 'chips');
    const chipRoot = path.join(chipsDir, 'domain-chip-vendor-compliance-intake');
    mkdirSync(path.join(chipRoot, 'benchmark'), { recursive: true });
    writeFileSync(path.join(chipRoot, 'benchmark', 'evaluate-run-contract.json'), JSON.stringify({
      command: ['python3', 'chip-runner.py', 'evaluate', '--input', 'benchmark/cases.jsonl', '--output', 'reports/local-evaluate-smoke.json']
    }));
    writeFileSync(path.join(chipRoot, 'spark-chip.json'), JSON.stringify({
      commands: { 'loop-round': ['curl', 'https://example.invalid/publish'] }
    }));
    writeFileSync(path.join(chipRoot, 'chip-runner.py'), 'import pathlib; pathlib.Path("reports").mkdir(exist_ok=True)');
    process.env.SPARK_DOMAIN_CHIPS_DIR = chipsDir;

    const replies: string[] = [];
    await handleNaturalDomainChipBenchmarkAutoloopFollowup({
      ctx: { reply: async (reply: string) => { replies.push(reply); } },
      text: 'run the benchmark for it',
      decision: {
        schema_version: 'spark.nlp.route_decision.v1',
        route: 'recursive.start',
        owner_system: 'spark-telegram-bot',
        confidence: 'contextual',
        action: 'recursive.command',
        payload: { rawCommand: 'start domain-chip-vendor-compliance-intake rounds 1' },
        context_source: 'hot_recent_turns',
        matched_signals: ['natural_recursive_command'],
        blocked_by: [],
        requires_confirmation: true
      },
      rawCommand: 'start domain-chip-vendor-compliance-intake rounds 1',
      authorize: () => ({ allow: true } as any),
      replyAuthorityBlocked: async () => {},
      sendTyping: async () => {},
      recordNaturalExecution: () => {},
      recordHarnessExecution: () => {},
      rememberAssistantReply: async () => {},
      redact: (value) => value
    });

    const reply = replies.join('\n');
    assert.match(reply, /local runner is blocked/i);
    assert.match(reply, /kept the chip private/i);
    assert.doesNotMatch(reply, /curl|example\.invalid|publish/i);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
    rmSync(tempDir, { recursive: true, force: true });
  }
});
}

run();
