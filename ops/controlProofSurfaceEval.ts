#!/usr/bin/env ts-node
import {
  checkSurfaceEval,
  formatSurfaceEvalReport
} from '../src/controlProofSurfaceEval';

const json = process.argv.includes('--json');
const strict = process.argv.includes('--strict');
const observationsIndex = process.argv.indexOf('--observations');
const observationPath = observationsIndex >= 0 ? process.argv[observationsIndex + 1] : undefined;
const result = checkSurfaceEval({ repoRoot: process.cwd(), observationPath });

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatSurfaceEvalReport(result));
}

if (strict && !result.ok) {
  process.exit(1);
}
