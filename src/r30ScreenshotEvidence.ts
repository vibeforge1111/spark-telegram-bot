import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export interface R30ScreenshotManifestEntry {
  ref: string;
  file_path: string;
  sha256: string;
  captured_for_case_id?: string;
}

export interface R30ScreenshotManifest {
  schema_version?: string;
  generated_at?: string;
  entries?: R30ScreenshotManifestEntry[];
}

export interface ScreenshotManifestValidation {
  passed: boolean;
  failures: string[];
  refs: Set<string>;
  entriesByRef: Map<string, R30ScreenshotManifestEntry[]>;
}

export function screenshotDigestForFile(filePath: string): R30ScreenshotManifestEntry {
  const bytes = readFileSync(filePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  return {
    ref: `screenshot:sha256:${sha256}`,
    file_path: filePath,
    sha256
  };
}

export function validateScreenshotManifest(value: unknown): ScreenshotManifestValidation {
  const manifest = (value && typeof value === 'object' ? value : {}) as R30ScreenshotManifest;
  const failures: string[] = [];
  const refs = new Set<string>();
  const entriesByRef = new Map<string, R30ScreenshotManifestEntry[]>();

  if (manifest.schema_version !== 'spark.r30.screenshot_manifest.v1') {
    failures.push('screenshot manifest schema_version must be spark.r30.screenshot_manifest.v1');
  }

  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  if (entries.length === 0) failures.push('screenshot manifest entries must not be empty');

  for (const [index, entry] of entries.entries()) {
    const label = `screenshot manifest entry ${index}`;
    if (!entry || typeof entry !== 'object') {
      failures.push(`${label} must be an object`);
      continue;
    }
    if (!/^screenshot:sha256:[a-f0-9]{64}$/i.test(String(entry.ref || ''))) failures.push(`${label} ref must be screenshot:sha256:<64 hex>`);
    if (!/^[a-f0-9]{64}$/i.test(String(entry.sha256 || ''))) failures.push(`${label} sha256 must be 64 hex`);
    if (entry.ref !== `screenshot:sha256:${entry.sha256}`) failures.push(`${label} ref must match sha256`);
    if (typeof entry.file_path !== 'string' || !entry.file_path.startsWith('/')) {
      failures.push(`${label} file_path must be absolute`);
      continue;
    }
    if (!existsSync(entry.file_path)) {
      failures.push(`${label} file_path must exist`);
      continue;
    }
    const actual = screenshotDigestForFile(entry.file_path).sha256;
    if (actual !== entry.sha256) failures.push(`${label} sha256 does not match file bytes`);
    refs.add(entry.ref);
    const existing = entriesByRef.get(entry.ref) || [];
    existing.push(entry);
    entriesByRef.set(entry.ref, existing);
  }

  return { passed: failures.length === 0, failures, refs, entriesByRef };
}
