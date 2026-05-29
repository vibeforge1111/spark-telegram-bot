import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const readme = readFileSync(join(__dirname, '..', 'README.md'), 'utf-8');

describe('README health-polling source-dir requirement', () => {
  it('post-fix: documents the source/ directory requirement', () => {
    // Pre-fix: source/ was missing from the health-polling operator config guidance
    // Post-fix: source/ is explicitly mentioned
    expect(readme).toMatch(/source\//);
  });

  it('post-fix: health-check or health-polling guidance is present', () => {
    expect(readme.toLowerCase()).toMatch(/health[-\s]?poll|health[-\s]?check|verify.*launch|launch.*config/);
  });

  it('regression: operator section does not point to root dir only', () => {
    // The old text pointed to the project root without specifying source/
    // Verify the README now distinguishes the source/ subdirectory
    expect(readme).not.toMatch(/^(spark live start|spark live status)\s*$/m);
    expect(readme).toContain('source/');
  });
});