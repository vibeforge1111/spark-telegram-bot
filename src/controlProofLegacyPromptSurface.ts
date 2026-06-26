import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  LEGACY_PROMPT_SURFACE_BLOCKED_REFS,
  type LegacyPromptSurfaceRef
} from './legacyPromptRefs';

export { LEGACY_PROMPT_SURFACE_BLOCKED_REFS, type LegacyPromptSurfaceRef } from './legacyPromptRefs';

export interface LegacyPromptSurfaceTarget {
  path: string;
  kind: 'prompt_source' | 'ui_summary';
}

export interface LegacyPromptSurfaceGap {
  file: string;
  kind: LegacyPromptSurfaceTarget['kind'];
  refId: string;
  label: string;
  pattern: string;
  line: number;
}

export interface LegacyPromptSurfaceResult {
  ok: boolean;
  checkedFiles: number;
  blockedRefs: number;
  gaps: LegacyPromptSurfaceGap[];
  missingFiles: string[];
}

export const LEGACY_PROMPT_SURFACE_TARGETS: LegacyPromptSurfaceTarget[] = [
  { path: 'src/llm.ts', kind: 'prompt_source' },
  { path: 'src/index.ts', kind: 'prompt_source' },
  { path: 'src/conversationIntent.ts', kind: 'prompt_source' },
  { path: 'src/builderBridge.ts', kind: 'prompt_source' },
  { path: 'src/missionRelay.ts', kind: 'prompt_source' },
  { path: 'src/sparkLiveStatusSurface.ts', kind: 'prompt_source' },
  { path: 'src/telegramSurface.ts', kind: 'prompt_source' },
  { path: 'src/authorityStatus.ts', kind: 'prompt_source' },
  { path: 'outputs/live-canary-full/live-canary-summary.md', kind: 'ui_summary' },
  { path: 'outputs/live-canary-safe-first/live-canary-summary.md', kind: 'ui_summary' }
];

function lineNumberForIndex(contents: string, index: number): number {
  return contents.slice(0, index).split('\n').length;
}

function findPattern(contents: string, pattern: string): number {
  return contents.toLocaleLowerCase().indexOf(pattern.toLocaleLowerCase());
}

export function checkLegacyPromptSurface(input: {
  repoRoot?: string;
  targets?: LegacyPromptSurfaceTarget[];
  blockedRefs?: LegacyPromptSurfaceRef[];
} = {}): LegacyPromptSurfaceResult {
  const repoRoot = input.repoRoot || process.cwd();
  const targets = input.targets || LEGACY_PROMPT_SURFACE_TARGETS;
  const blockedRefs = input.blockedRefs || LEGACY_PROMPT_SURFACE_BLOCKED_REFS;
  const gaps: LegacyPromptSurfaceGap[] = [];
  const missingFiles: string[] = [];
  let checkedFiles = 0;

  for (const target of targets) {
    const fullPath = path.join(repoRoot, target.path);
    if (!existsSync(fullPath)) {
      missingFiles.push(target.path);
      continue;
    }
    checkedFiles += 1;
    const contents = readFileSync(fullPath, 'utf8');

    for (const ref of blockedRefs) {
      for (const pattern of ref.patterns) {
        const index = findPattern(contents, pattern);
        if (index >= 0) {
          gaps.push({
            file: target.path,
            kind: target.kind,
            refId: ref.id,
            label: ref.label,
            pattern,
            line: lineNumberForIndex(contents, index)
          });
          break;
        }
      }
    }
  }

  return {
    ok: gaps.length === 0 && missingFiles.length === 0,
    checkedFiles,
    blockedRefs: blockedRefs.length,
    gaps,
    missingFiles
  };
}

export function formatLegacyPromptSurfaceReport(result: LegacyPromptSurfaceResult): string {
  const lines = [
    'Control-proof legacy prompt surface',
    `Status: ${result.ok ? 'clean' : 'gaps found'}`,
    `Prompt/UI files checked: ${result.checkedFiles}`,
    `Blocked legacy refs: ${result.blockedRefs}`,
    `Gaps: ${result.gaps.length}`,
    `Missing files: ${result.missingFiles.length}`
  ];

  if (result.gaps.length) {
    lines.push('', 'Gap samples:');
    for (const gap of result.gaps.slice(0, 12)) {
      lines.push(`- ${gap.file}:${gap.line} ${gap.refId} (${gap.kind}) | ${gap.label}`);
    }
  }

  if (result.missingFiles.length) {
    lines.push('', 'Missing files:');
    for (const file of result.missingFiles.slice(0, 12)) {
      lines.push(`- ${file}`);
    }
  }

  return lines.join('\n');
}
