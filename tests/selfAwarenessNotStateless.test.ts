import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const doc = readFileSync(
  join(__dirname, '..', 'agent-knowledge', 'self-awareness.md'),
  'utf-8'
);

describe('self-awareness.md stateless-description correction', () => {
  it('post-fix: document states Spark is not stateless', () => {
    // Pre-fix: Spark was described as stateless, causing incorrect self-description
    // Post-fix: document explicitly says not to describe Spark as stateless
    expect(doc.toLowerCase()).toMatch(/not stateless|stateless.*false|do not describe.*stateless|spark.*not.*stateless/);
  });

  it('post-fix: provides minimal runtime context guidance', () => {
    expect(doc.toLowerCase()).toMatch(/runtime|memory|state|context/);
  });

  it('regression: document is not empty', () => {
    expect(doc.length).toBeGreaterThan(50);
  });
});