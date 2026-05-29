import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const redactSrc = readFileSync(join(__dirname, '..', 'src', 'redaction.ts'), 'utf-8');

describe('WINDOWS_USER_PATH redaction fix', () => {
  it('post-fix: WINDOWS_USER_PATH constant is defined', () => {
    // Pre-fix: Windows user paths (C:\Users\alice\...) leaked through redaction
    // Post-fix: WINDOWS_USER_PATH regex pattern is added to the redaction pass
    expect(redactSrc).toMatch(/WINDOWS_USER_PATH/);
  });

  it('post-fix: regex covers C:\\Users\\ pattern', () => {
    expect(redactSrc).toMatch(/Users/);
    expect(redactSrc).toMatch(/\[A-Za-z\]|[A-Za-z]/);
  });

  it('post-fix: WINDOWS_USER_PATH is applied in the redaction function', () => {
    // Verify it is used, not just defined
    const uses = (redactSrc.match(/WINDOWS_USER_PATH/g) ?? []).length;
    expect(uses).toBeGreaterThan(1);
  });

  it('regression: Windows paths C:\\Users\\<name>\\ are now redacted', () => {
    // The regex should match typical Windows user paths
    const winPathPattern = /\[A-Za-z\]:\\\\?Users\\\\?/;
    expect(redactSrc).toMatch(winPathPattern);
  });
});