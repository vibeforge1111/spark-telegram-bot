#!/usr/bin/env ts-node
import {
  checkProofCapsuleCoverage,
  formatProofCapsuleCoverageReport
} from '../src/controlProofCapsuleCoverage';

const json = process.argv.includes('--json');
const strict = process.argv.includes('--strict');
const result = checkProofCapsuleCoverage({ repoRoot: process.cwd() });

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatProofCapsuleCoverageReport(result));
}

if (strict && !result.ok) {
  process.exit(1);
}
