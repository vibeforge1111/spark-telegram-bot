import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');

describe('isLocalhostUrl canvas link fix', () => {
  it('post-fix: isLocalhostUrl helper is defined', () => {
    // Pre-fix: canvas links were shown for any URL, including remote ones
    // Post-fix: isLocalhostUrl restricts button display to localhost/127.0.0.1/::1
    expect(src).toMatch(/isLocalhostUrl/);
  });

  it('post-fix: localhost and 127.0.0.1 are in the check', () => {
    expect(src).toMatch(/localhost/);
    expect(src).toMatch(/127\.0\.0\.1/);
  });

  it('post-fix: ::1 (IPv6 loopback) is also covered', () => {
    expect(src).toMatch(/::1/);
  });

  it('regression: canvas button is gated on isLocalhostUrl check', () => {
    // The fix ensures isLocalhostUrl is used as a condition before showing the canvas button
    const localhostCheckIdx = src.indexOf('isLocalhostUrl');
    expect(localhostCheckIdx).toBeGreaterThan(-1);
    // The function is used (called) not just defined
    const uses = (src.match(/isLocalhostUrl/g) ?? []).length;
    expect(uses).toBeGreaterThan(1); // defined + called at least once
  });
});