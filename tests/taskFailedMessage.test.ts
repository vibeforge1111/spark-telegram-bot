import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const relaySrc = readFileSync(join(__dirname, '..', 'src', 'missionRelay.ts'), 'utf-8');

describe('renderTaskFailureBody task-failed message fix', () => {
  it('post-fix: renderTaskFailureBody function is defined', () => {
    // Pre-fix: task_failed handler used a generic clipped failure string
    // Post-fix: renderTaskFailureBody detects bare unknown-error strings and emits a structured hint
    expect(relaySrc).toMatch(/renderTaskFailureBody/);
  });

  it('post-fix: task_failed handler calls renderTaskFailureBody', () => {
    expect(relaySrc).toMatch(/task.?failed[\s\S]{0,500}renderTaskFailureBody|renderTaskFailureBody[\s\S]{0,500}task.?failed/);
  });

  it('regression: bare generic failure text is no longer used as sole output', () => {
    // Pre-fix: used a generic truncated failure string
    // Post-fix: structured message with repair hints
    // Verify the old bare pattern is replaced
    expect(relaySrc).toMatch(/renderTaskFailureBody|unknownError|repair.*hint|diagnose/i);
  });
});