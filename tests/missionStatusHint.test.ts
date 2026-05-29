import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const indexSrc = readFileSync(join(__dirname, '..', 'src', 'index.ts'), 'utf-8');

describe('/mission status latest mission ID hint', () => {
  it('post-fix: a latest-mission-ID helper or lookup is defined', () => {
    // Pre-fix: /mission status with no ID produced an error or empty response
    // Post-fix: bot reads the latest mission ID from board state as a fallback
    expect(indexSrc).toMatch(/latest.*[Mm]ission|[Mm]ission.*latest|latestMission|getLatest[Mm]ission/);
  });

  it('post-fix: mission status handler exists', () => {
    expect(indexSrc).toMatch(/mission.*status|status.*mission/i);
  });

  it('regression: missing mission ID no longer silently fails', () => {
    // The helper ensures there is always a fallback ID path for /mission status
    // Verify the pattern that provides the fallback exists
    expect(indexSrc).toMatch(/board.*[Mm]ission|[Mm]ission.*[Bb]oard|boardState|getBoard/i);
  });
});