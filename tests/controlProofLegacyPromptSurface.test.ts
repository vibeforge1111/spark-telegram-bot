import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  LEGACY_PROMPT_SURFACE_BLOCKED_REFS,
  LEGACY_PROMPT_SURFACE_TARGETS,
  checkLegacyPromptSurface,
  formatLegacyPromptSurfaceReport
} from '../src/controlProofLegacyPromptSurface';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('legacy prompt surface is clean for prompt sources and human canary summaries', () => {
  const result = checkLegacyPromptSurface({ repoRoot: process.cwd() });

  assert.equal(result.ok, true);
  assert.equal(result.gaps.length, 0);
  assert.equal(result.missingFiles.length, 0);
  assert.ok(result.checkedFiles >= 10);
  assert.match(formatLegacyPromptSurfaceReport(result), /Status: clean/);
});

test('blocked refs cover classified legacy sources that must not leak into prompts', () => {
  const joinedPatterns = LEGACY_PROMPT_SURFACE_BLOCKED_REFS.flatMap((ref) => ref.patterns).join('\n');

  assert.match(joinedPatterns, /natural-language-live-commands\.json/);
  assert.match(joinedPatterns, /genesis-live-telegram-100\.json/);
  assert.match(joinedPatterns, /routeBoundaryHandlerHarness\.ts/);
  assert.match(joinedPatterns, /liveNlCommandSuite\.ts/);
  assert.match(joinedPatterns, /CONTEXT_WINDOW_LIVE_TEST_PLAN\.md/);
  assert.match(joinedPatterns, /LAUNCH_CONVERSATION_QA_2026-05-08\.md/);
  assert.match(joinedPatterns, /SPARK_QA_STARTUP_BENCH_SHOWCASE_RUNBOOK_2026-05-26\.md/);
  assert.match(joinedPatterns, /Genesis live Telegram 100 benchmark/);
  assert.match(joinedPatterns, /startup bench showcase runbook/);
  assert.match(joinedPatterns, /codex-handoffs\//);
});

test('checker reports legacy refs in prompt-facing files', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'spark-legacy-prompt-surface-'));
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(
    path.join(root, 'src', 'llm.ts'),
    'const prompt = "Use ops/natural-language-live-commands.json as current authority";\n',
    'utf8'
  );

  const result = checkLegacyPromptSurface({
    repoRoot: root,
    targets: [{ path: 'src/llm.ts', kind: 'prompt_source' }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].refId, 'legacy_nl_catalog');
  assert.equal(result.gaps[0].line, 1);
  assert.match(formatLegacyPromptSurfaceReport(result), /legacy_nl_catalog/);
});

test('checker reports legacy source titles without exact file paths', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'spark-legacy-prompt-surface-title-'));
  mkdirSync(path.join(root, 'src'), { recursive: true });
  writeFileSync(
    path.join(root, 'src', 'llm.ts'),
    'const prompt = "Treat the GENESIS LIVE TELEGRAM 100 BENCHMARK as the current release source";\n',
    'utf8'
  );

  const result = checkLegacyPromptSurface({
    repoRoot: root,
    targets: [{ path: 'src/llm.ts', kind: 'prompt_source' }]
  });

  assert.equal(result.ok, false);
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0].refId, 'genesis_telegram_100');
  assert.equal(result.gaps[0].line, 1);
});

test('checker treats missing prompt surface files as gaps', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'spark-legacy-prompt-surface-missing-'));
  const result = checkLegacyPromptSurface({
    repoRoot: root,
    targets: [{ path: 'src/llm.ts', kind: 'prompt_source' }]
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missingFiles, ['src/llm.ts']);
});

test('default targets include prompt sources and markdown UI summaries, not raw evidence json', () => {
  const targetPaths = LEGACY_PROMPT_SURFACE_TARGETS.map((target) => target.path).sort();

  assert.ok(targetPaths.includes('src/llm.ts'));
  assert.ok(targetPaths.includes('src/index.ts'));
  assert.ok(targetPaths.includes('outputs/live-canary-full/live-canary-summary.md'));
  assert.ok(targetPaths.includes('outputs/live-canary-safe-first/live-canary-summary.md'));
  assert.equal(targetPaths.some((targetPath) => targetPath.endsWith('.json')), false);
});
