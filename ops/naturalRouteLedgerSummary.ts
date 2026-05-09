import {
  formatNaturalRouteLedgerSummary,
  naturalRouteLedgerPath,
  readNaturalRouteExecutionLedger,
  summarizeNaturalRouteExecutionRecords
} from '../src/naturalRouteLedger';

async function main(): Promise<void> {
  const filePath = process.argv[2] || naturalRouteLedgerPath();
  const records = await readNaturalRouteExecutionLedger(filePath);
  console.log(formatNaturalRouteLedgerSummary(summarizeNaturalRouteExecutionRecords(records)));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
