/**
 * Trust-boundary tests for renderTaskFailureBody (task-failed message fix).
 *
 * Boundary: external relay event (task_failed payload) → renderTaskFailureBody
 *           → Telegram message delivered to user
 *
 * Before fix: task_failed handler clipped raw error string with no recovery
 *             path, exposing internal details and leaving no retry guidance.
 * After fix:  renderTaskFailureBody detects bare unknown errors and substitutes
 *             a safe description; always appends /run retry + /mission status.
 *
 * Security reviewer questions addressed:
 *   1. No internal task IDs, runner addresses, or stack traces in output —
 *      boilerplate stripper removes mission IDs; clipText limits to 500 chars.
 *   2. /mission status <id> uses the caller-supplied missionId (the ID already
 *      known to the user), not an internal identifier.
 *   3. Renderer output for unknown/empty error is fully static — no input
 *      content can inject into the detail line for bare unknown errors.
 */
import { describe, it, expect } from 'vitest';
import { renderTaskFailureBody } from '../src/missionRelay';

describe('renderTaskFailureBody — behavioral boundary tests', () => {
  it('bare unknown-error input emits static safe description (no raw content)', () => {
    const output = renderTaskFailureBody('unknown error', 'mission-abc-123');
    expect(output).toMatch(/did not return a reason|provider timed out|runner exited/i);
    expect(output).not.toContain('unknown error');
  });

  it('empty-error input emits static safe description', () => {
    const output = renderTaskFailureBody('', 'mission-abc-123');
    expect(output).toMatch(/did not return a reason|provider timed out/i);
  });

  it('output always contains /run retry path', () => {
    const output = renderTaskFailureBody('build failed', 'mission-xyz');
    expect(output).toMatch(/\/run/);
  });

  it('output always contains /mission status with caller-supplied missionId', () => {
    const missionId = 'mission-test-id-9999';
    const output = renderTaskFailureBody('build failed', missionId);
    expect(output).toContain(`/mission status ${missionId}`);
  });

  it('detailed error text is clipped — output is bounded even for very long inputs', () => {
    const longStack = 'Error: build failed\n' + '  at Object.<anonymous> (runner.js:1:1)\n'.repeat(100);
    const output = renderTaskFailureBody(longStack, 'mission-stack-test');
    // clipText truncates to 500 chars; total output including recovery is bounded
    expect(output.length).toBeLessThan(800);
  });

  it('internal mission ID patterns are stripped from detailed error text', () => {
    const errWithInternalId = 'spark-dispatch-900123: runner exited with code 1';
    const output = renderTaskFailureBody(errWithInternalId, 'mission-user-id');
    expect(output).not.toContain('spark-dispatch-900123');
  });

  it('missionId in recovery path is the exact string passed in (no transformation)', () => {
    const missionId = 'user-facing-mission-id-42';
    const output = renderTaskFailureBody('step failed', missionId);
    expect(output).toContain(missionId);
    const internalMatch = output.match(/\/mission status ([^\n.]+)/);
    expect(internalMatch?.[1]?.trim()).toBe(missionId);
  });
});
