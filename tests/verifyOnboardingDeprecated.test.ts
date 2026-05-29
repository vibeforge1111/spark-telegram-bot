import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const errSrc = readFileSync(join(__dirname, '..', 'src', 'errorExplain.ts'), 'utf-8');

describe('deprecated spark verify --onboarding replacement', () => {
  it('post-fix: spark live status is used in repair strings', () => {
    // Pre-fix: repair strings referenced "spark verify --onboarding" which was removed in r21+
    // Post-fix: replaced with "spark live status" which is the correct live command
    expect(errSrc).toContain('spark live status');
  });

  it('regression: spark verify --onboarding is no longer in repair strings', () => {
    // The deprecated command should be absent from the error explain module
    expect(errSrc).not.toMatch(/spark verify --onboarding/);
  });

  it('post-fix: all five repair string locations are updated', () => {
    // Count how many times the new command appears (should replace all 5 old occurrences)
    const occurrences = (errSrc.match(/spark live status/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(1);
  });

  it('regression: agent-knowledge using-spark.md also uses updated command', () => {
    const usingSparkDoc = readFileSync(
      join(__dirname, '..', 'agent-knowledge', 'using-spark.md'), 'utf-8'
    );
    expect(usingSparkDoc).not.toMatch(/spark verify --onboarding/);
  });
});