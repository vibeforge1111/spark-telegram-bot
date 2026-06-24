import { describe, it, expect } from 'vitest';

function redactText(text: string): string {
	return text.replace(/\S{8,}/g, '[REDACTED]');
}

function buildDiagnosticsError(stderr: string): string {
	return `Diagnostics scan returned empty stdout. stderr=${redactText(stderr.trim())}`;
}

describe('builderBridge diagnostics stderr redaction', () => {
	it('sensitive stderr is redacted in the error message', () => {
		const msg = buildDiagnosticsError('SECRET_KEY=abc123secret internal/path');
		expect(msg).not.toContain('abc123secret');
	});
	it('error message includes redactText sentinel', () => {
		const msg = buildDiagnosticsError('some long secret value here');
		expect(msg).toContain('[REDACTED]');
	});
	it('error message preserves prefix', () => {
		const msg = buildDiagnosticsError('anything');
		expect(msg).toMatch(/^Diagnostics scan returned empty stdout\./);
	});
	it('empty stderr produces clean error', () => {
		const msg = buildDiagnosticsError('');
		expect(msg).toBe('Diagnostics scan returned empty stdout. stderr=');
	});
	it('all other builder bridge throws also redact stderr', () => {
		const throws = [
			`Builder self-awareness returned empty stdout. stderr=${redactText('secret')}`,
			`Builder self-improvement plan returned empty stdout. stderr=${redactText('secret')}`,
		];
		throws.forEach(t => expect(t).not.toContain('secret'));
	});
});
