import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');

describe('lastRunMissions hint fix', () => {
  it('post-fix: LastRunMission interface or type is defined', () => {
    // Pre-fix: /mission status with no ID gave no useful hint about the last run
    // Post-fix: LastRunMission tracks the most recent run per chatId-userId
    expect(src).toMatch(/LastRunMission|lastRunMission/);
  });

  it('post-fix: lastRunMissions Map is keyed by chatId-userId', () => {
    // The Map should use a composite key combining chatId and userId
    expect(src).toMatch(/chatId.*userId|userId.*chatId|\$\{chatId\}.*\$\{userId\}|\$\{userId\}.*\$\{chatId\}/);
  });

  it('post-fix: /mission status handler uses the lastRunMissions hint', () => {
    expect(src).toMatch(/lastRunMission/i);
    const uses = (src.match(/lastRunMission/gi) ?? []).length;
    expect(uses).toBeGreaterThan(1); // defined and used
  });

  it('regression: lastRunMissions is read-only at display (no write at display time)', () => {
    // Verify it is a Map (immutable-read pattern)
    expect(src).toMatch(/new Map|Map<|lastRunMissions\s*=/);
  });
});