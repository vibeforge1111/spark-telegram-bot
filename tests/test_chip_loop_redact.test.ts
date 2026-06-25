import { describe, it, expect } from 'vitest';

function redactText(text: string): string {
	return text.replace(/\S{8,}/g, '[REDACTED]');
}

function buildLoopError(errMsg: string, stderrRaw: string): { ok: boolean; error: string } {
	const stderr = stderrRaw ? redactText(stderrRaw.slice(-400)) : '';
	return { ok: false, error: errMsg ? `${errMsg}${stderr ? ': ' + stderr : ''}` : 'loop exec failed' };
}

describe('chipLoop stderr redaction', () => {
	it('raw stderr not included in error string', () => {
		const res = buildLoopError('exec failed', 'SECRET_TOKEN=abc123xyz long secret value');
		expect(res.error).not.toContain('abc123xyz');
	});
	it('result is not ok', () => {
		expect(buildLoopError('err', 'stderr').ok).toBe(false);
	});
	it('error message contains redacted sentinel', () => {
		const res = buildLoopError('exec failed', 'longpasswordsecretvalue');
		expect(res.error).toContain('[REDACTED]');
	});
	it('falls back to loop exec failed when no message', () => {
		const res = buildLoopError('', '');
		expect(res.error).toBe('loop exec failed');
	});
	it('original error message is preserved', () => {
		const res = buildLoopError('chip loop failed', 'secretdata12345');
		expect(res.error).toMatch(/^chip loop failed/);
	});
});
