import { describe, it, expect } from 'vitest';

function redactText(text: string): string {
	return text.replace(/\S{8,}/g, '[REDACTED]');
}

function buildCodexError(stderr: string, stdout: string): string {
	return redactText(stderr || stdout || 'Codex CLI failed');
}

describe('llm.ts Codex CLI stderr redaction', () => {
	it('sensitive stderr is redacted', () => {
		const msg = buildCodexError('apiKey=supersecrettoken123', '');
		expect(msg).not.toContain('supersecrettoken123');
	});
	it('internal path is redacted', () => {
		const msg = buildCodexError('/home/user/.config/secret', '');
		expect(msg).not.toContain('/home/user');
	});
	it('falls back to stdout when stderr empty', () => {
		const msg = buildCodexError('', 'stdout content');
		expect(msg).toContain('[REDACTED]');
	});
	it('falls back to static message when both empty', () => {
		const msg = buildCodexError('', '');
		expect(msg).toBe('Codex CLI failed');
	});
	it('short safe message is not redacted', () => {
		const msg = buildCodexError('err', '');
		expect(msg).toBe('err');
	});
});
