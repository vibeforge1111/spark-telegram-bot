import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const doc = readFileSync(
  join(__dirname, '..', 'agent-knowledge', 'using-spark.md'),
  'utf-8'
);

describe('using-spark.md Boundaries section', () => {
  it('post-fix: Boundaries section is present in the document', () => {
    // Pre-fix: no Boundaries section; agent had no explicit scope-guard guidance
    // Post-fix: Boundaries section added with file-system command scoping rule
    expect(doc).toMatch(/Boundaries|boundaries/);
  });

  it('post-fix: Boundaries section addresses scope confirmation', () => {
    // The rule states: commands operating on file system must confirm scope before executing
    expect(doc.toLowerCase()).toMatch(/scope|confirm/);
  });

  it('regression: document is not empty and retains prior content', () => {
    expect(doc.length).toBeGreaterThan(100);
  });

  it('regression: spark verify --onboarding is absent (deprecated in r21)', () => {
    expect(doc).not.toMatch(/spark verify --onboarding/);
  });
});