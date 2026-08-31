import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('healthcheck timeout config', () => {
	it('has timeout_seconds >= 30 to accommodate slow polling starts', () => {
		const toml = readFileSync(join(import.meta.dirname, '..', 'spark.toml'), 'utf-8');
		const match = toml.match(/\[healthcheck\][\s\S]*?timeout_seconds\s*=\s*(\d+)/);
		expect(match).not.toBeNull();
		const timeout = Number(match![1]);
		expect(timeout).toBeGreaterThanOrEqual(30);
	});

	it('healthcheck section includes command and hints', () => {
		const toml = readFileSync(join(import.meta.dirname, '..', 'spark.toml'), 'utf-8');
		expect(toml).toContain('[healthcheck]');
		expect(toml).toContain('command =');
		expect(toml).toContain('success_hint =');
		expect(toml).toContain('failure_hint =');
	});
});
