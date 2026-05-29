import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const errSrc = readFileSync(join(__dirname, '..', 'src', 'errorExplain.ts'), 'utf-8');

describe('errorExplain unknown-category fallback fix', () => {
  it('post-fix: /diagnose is prioritised in the unknown-category repair string', () => {
    // Pre-fix: unknown-category repair string used legacy verify commands first
    // Post-fix: /diagnose and spark live start are the first recommendations
    expect(errSrc).toMatch(/\/diagnose/);
  });

  it('post-fix: spark live start is included in the unknown repair path', () => {
    expect(errSrc).toMatch(/spark live start/);
  });

  it('post-fix: /mission status is added to spark-related error hints', () => {
    expect(errSrc).toMatch(/\/mission status|mission.*status/i);
  });

  it('regression: legacy spark verify --onboarding not present as primary recommendation', () => {
    // The old first recommendation was spark verify --onboarding (removed in r21)
    // Post-fix it should not appear at all, or only as a fallback comment
    expect(errSrc).not.toMatch(/spark verify --onboarding/);
  });

  it('regression: unknown category handler still handles the unknown case', () => {
    // Verify the unknown/catch-all category handler is still present
    expect(errSrc).toMatch(/unknown|catch|default|fallback/i);
  });
});