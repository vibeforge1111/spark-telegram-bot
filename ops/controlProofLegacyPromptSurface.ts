#!/usr/bin/env ts-node
import {
  checkLegacyPromptSurface,
  formatLegacyPromptSurfaceReport
} from '../src/controlProofLegacyPromptSurface';

const json = process.argv.includes('--json');
const strict = process.argv.includes('--strict');
const result = checkLegacyPromptSurface({ repoRoot: process.cwd() });

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatLegacyPromptSurfaceReport(result));
}

if (strict && !result.ok) {
  process.exit(1);
}
