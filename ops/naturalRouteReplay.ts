import fs from 'node:fs';
import path from 'node:path';
import {
  formatNaturalRouteReplaySummary,
  parseNaturalRouteReplayCases,
  runNaturalRouteReplayCases
} from '../src/naturalRouteReplay';

async function main(): Promise<void> {
  const fixturePath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, '..', 'tests', 'fixtures', 'natural-route-replay-cases.jsonl');
  const jsonl = fs.readFileSync(fixturePath, 'utf8');
  const cases = parseNaturalRouteReplayCases(jsonl);
  const summary = runNaturalRouteReplayCases(cases);
  console.log(formatNaturalRouteReplaySummary(summary));
  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
