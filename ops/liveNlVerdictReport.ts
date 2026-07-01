import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  buildObservedLiveNlEvidencePacket,
  buildLiveNlEvidencePacket,
  buildLiveNlObservationTemplate,
  formatLiveNlVerdictReport,
  parseLiveNlCommandCases,
  parseLiveNlObservationFile,
  selectLiveNlCommandCases
} from '../src/liveNlVerdict';

function argValue(args: string[], name: string): string | null {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function argList(args: string[], name: string): string[] {
  const value = argValue(args, name);
  if (!value) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function catalogFileName(args: string[]): string {
  const catalog = (argValue(args, 'catalog') || 'standard').trim().toLowerCase();
  if (catalog === 'standard' || catalog === 'default' || catalog === 'natural-language') {
    return 'natural-language-live-commands.json';
  }
  if (catalog === 'genesis' || catalog === 'genesis100' || catalog === 'genesis-100') {
    return 'genesis-live-telegram-100.json';
  }
  if (/^[a-z0-9_.-]+\.json$/i.test(catalog) && !catalog.includes('/') && !catalog.includes('\\')) {
    return catalog;
  }
  throw new Error(`Unsupported live NL catalog: ${catalog}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const catalogName = catalogFileName(args);
  const casesPath = path.join(__dirname, catalogName);
  const allCases = parseLiveNlCommandCases(JSON.parse(fs.readFileSync(casesPath, 'utf8')));
  const suite = argValue(args, 'suite');
  const includeRisky = hasFlag(args, 'include-risky');
  const selected = selectLiveNlCommandCases(allCases, {
    caseId: argValue(args, 'case'),
    caseIds: argList(args, 'cases'),
    suite,
    includeRisky
  });

  if (selected.length === 0) {
    throw new Error('No matching command cases.');
  }

  const observationsPath = argValue(args, 'observations');
  const observationTemplate = hasFlag(args, 'observation-template') || hasFlag(args, 'observations-template');
  if (observationsPath && observationTemplate) {
    throw new Error('Use either --observations or --observation-template, not both.');
  }
  const observations = observationsPath
    ? parseLiveNlObservationFile(JSON.parse(fs.readFileSync(path.resolve(observationsPath), 'utf8')))
    : null;
  const outputJson = hasFlag(args, 'json') || Boolean(observations) || observationTemplate;
  const packetTitle = catalogName === 'genesis-live-telegram-100.json'
    ? 'Spark Genesis Telegram Live QA Evidence Packet'
    : 'Spark Telegram Live QA Evidence Packet';
  const observationTitle = catalogName === 'genesis-live-telegram-100.json'
    ? 'Spark Genesis Telegram Live QA Observation Template'
    : 'Spark Telegram Live QA Observation Template';
  const report = outputJson
    ? `${JSON.stringify(
      observationTemplate
        ? buildLiveNlObservationTemplate(selected, {
          catalog: catalogName,
          suite,
          includeRisky,
          title: observationTitle
        })
        : observations
        ? buildObservedLiveNlEvidencePacket(selected, observations, {
          catalog: catalogName,
          suite,
          includeRisky,
          title: packetTitle
        })
        : buildLiveNlEvidencePacket(selected, {
          catalog: catalogName,
          suite,
          includeRisky,
          title: packetTitle
        }),
      null,
      2
    )}\n`
    : formatLiveNlVerdictReport(selected, { suite });
  if (hasFlag(args, 'stdout')) {
    console.log(report);
    return;
  }

  const defaultName = outputJson
    ? observationTemplate
      ? `telegram-live-observation-template-${timestampForFile()}.json`
      : `telegram-live-evidence-${timestampForFile()}.json`
    : `natural-language-live-verdict-${timestampForFile()}.md`;
  const outPath = path.resolve(
    argValue(args, 'out') || path.join(__dirname, 'reports', defaultName)
  );
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, report, 'utf8');
  console.log(`Wrote ${selected.length} ${observationTemplate ? 'observation template' : 'verdict'} case(s) to ${outPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
