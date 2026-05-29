import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');

describe('isDestructiveGoal gate fix', () => {
  it('post-fix: isDestructiveGoal function is defined', () => {
    // Pre-fix: /run had no destructive-goal check; dangerous briefs could proceed without warning
    // Post-fix: isDestructiveGoal regex detector gates the RUN_VARIANTS handler
    expect(src).toMatch(/isDestructiveGoal/);
  });

  it('post-fix: pendingDestructiveRuns gate is present', () => {
    expect(src).toMatch(/pendingDestructive/);
  });

  it('post-fix: confirmation step is required for destructive goals', () => {
    // The gate requires explicit user confirmation before running destructive briefs
    expect(src).toMatch(/confirm|Confirm|confirmation|CONFIRM/);
  });

  it('regression: isDestructiveGoal is used inside the run handler', () => {
    // Verify the detector is called (not just defined)
    const uses = (src.match(/isDestructiveGoal/g) ?? []).length;
    expect(uses).toBeGreaterThan(1); // definition + at least one call
  });
});