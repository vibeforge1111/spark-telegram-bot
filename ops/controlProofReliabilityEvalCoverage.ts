#!/usr/bin/env ts-node
import {
  checkReliabilityEvalCoverage,
  formatReliabilityEvalCoverageReport
} from '../src/controlProofReliabilityEvalCoverage';

const json = process.argv.includes('--json');
const strict = process.argv.includes('--strict');
const result = checkReliabilityEvalCoverage();

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatReliabilityEvalCoverageReport(result));
}

if (strict && !result.ok) {
  process.exit(1);
}
