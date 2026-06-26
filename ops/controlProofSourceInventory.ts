#!/usr/bin/env ts-node
import {
  checkSourceInventory,
  formatSourceInventoryReport
} from '../src/controlProofSourceInventory';

const json = process.argv.includes('--json');
const strict = process.argv.includes('--strict');
const result = checkSourceInventory({ repoRoot: process.cwd() });

if (json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(formatSourceInventoryReport(result));
}

if (strict && !result.ok) {
  process.exit(1);
}
