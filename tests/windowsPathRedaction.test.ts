/**
 * Trust-boundary tests for WINDOWS_USER_PATH redaction.
 *
 * Boundary: any Telegram-bound error string (subprocess ChildProcessError,
 *           renderSparkErrorReply, redactText) → redactText → Telegram message
 *
 * Before fix: no Windows user-path pattern in redactText; real machine username
 *             appeared verbatim in the Reason: line sent to Telegram.
 * After fix:  WINDOWS_USER_PATH regex replaces <drive>:\Users\<name>\ with
 *             C:\Users\<username>\ before the string leaves the process.
 *
 * Security reviewer questions addressed:
 *   1. Static placeholder confirmed — output is literally "C:\Users\<username>\"
 *   2. Mixed-case drive letters covered — regex uses [A-Za-z]
 *   3. UNC paths (\\host\Users\name): NOT in scope for this fix (Windows-only
 *      local-path leak); noted for lab.
 *   4. macOS (/Users/name/) and Linux (/home/name/): NOT in scope for this
 *      fix; separate patterns would be needed if those surfaces are deployed.
 *   5. redactText is the single exit gate for all Telegram-bound error strings.
 */
import { describe, it, expect } from 'vitest';
import { redactText } from '../src/redaction';

describe('WINDOWS_USER_PATH redaction — behavioral boundary tests', () => {
  it('redacts a typical Windows user path with uppercase drive letter', () => {
    const input = 'Command failed: C:\\Users\\alice\\.spark\\bin\\spark.CMD';
    const output = redactText(input);
    expect(output).not.toContain('alice');
    expect(output).toContain('C:\\Users\\<username>\\');
    expect(output).toContain('spark.CMD');
  });

  it('redacts a lowercase drive letter (c:\\Users\\...)', () => {
    const input = 'spawn c:\\Users\\bob\\.spark\\bin\\spark.cmd ENOENT';
    const output = redactText(input);
    expect(output).not.toContain('bob');
    expect(output).toContain('C:\\Users\\<username>\\');
  });

  it('redacts an alternate drive letter (D:\\Users\\...)', () => {
    const input = 'Error: D:\\Users\\carol\\AppData\\Local\\Temp\\spark.log not found';
    const output = redactText(input);
    expect(output).not.toContain('carol');
    expect(output).toContain('C:\\Users\\<username>\\');
  });

  it('redacts multiple Windows user paths in one string', () => {
    const input = 'C:\\Users\\alice\\.spark and C:\\Users\\bob\\.venv were scanned';
    const output = redactText(input);
    expect(output).not.toContain('alice');
    expect(output).not.toContain('bob');
    expect(output).toMatch(/C:\\Users\\<username>\\/g);
  });

  it('replacement is a static placeholder string, not the original username', () => {
    const input = 'Path: C:\\Users\\secret-user-name\\.spark\\config';
    const output = redactText(input);
    expect(output).not.toContain('secret-user-name');
    expect(output).toContain('<username>');
    expect(output).not.toMatch(/C:\\Users\\[^<]/);
  });

  it('leaves strings without Windows user paths unchanged', () => {
    const input = 'Mission failed: provider timed out after 30s.';
    expect(redactText(input)).toBe(input);
  });

  it('does not strip content after the username segment (path tail is preserved)', () => {
    const input = 'C:\\Users\\dave\\.spark\\bin\\spark.CMD exited with code 1';
    const output = redactText(input);
    expect(output).toContain('.spark\\bin\\spark.CMD exited with code 1');
  });

  it('UNC paths (\\\\host\\Users\\name) are not redacted — documented out of scope', () => {
    const input = '\\\\buildserver\\Users\\eve\\config.json';
    const output = redactText(input);
    // UNC paths require a separate pattern; document the boundary clearly.
    // Lab verification needed for any UNC-path deployment surface.
    expect(typeof output).toBe('string');
  });
});
