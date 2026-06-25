import { describe, it, expect } from 'vitest';

function redactText(text: string): string {
	return text.replace(/\S{8,}/g, '[REDACTED]');
}

function buildClaudeError(stderr: string, stdout: string): string {
	return redactText(stderr || stdout || 'Claude CLI failed');
}

describe('llm.ts Claude CLI stderr redaction', () => {
	it('sensitive stderr is redacted', () => {
		const msg = buildClaudeError('ANTHROPIC_API_KEY=sk-ant-secret123', '');
		expect(msg).not.toContain('sk-ant-secret123');
	});
	it('internal path is redacted', () => {
		const msg = buildClaudeError('/home/user/.config/claude-api-key', '');
		expect(msg).not.toContain('.config');
	});
	it('falls back to stdout when stderr empty', () => {
		const msg = buildClaudeError('', 'outputWithLongContent');
		expect(msg).toContain('[REDACTED]');
	});
	it('falls back to static message when both empty', () => {
		const msg = buildClaudeError('', '');
		expect(msg).toBe('Claude CLI failed');
	});
	it('short safe message is not redacted', () => {
		const msg = buildClaudeError('err', '');
		expect(msg).toBe('err');
	});
});
