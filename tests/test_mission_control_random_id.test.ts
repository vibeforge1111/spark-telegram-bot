import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';

function randomId(): string {
	return randomBytes(4).toString('hex');
}

describe('missionControl randomId', () => {
	it('produces an 8-character hex string', () => {
		expect(randomId()).toMatch(/^[0-9a-f]{8}$/);
	});
	it('does not use Math.random', () => {
		const src = randomId.toString();
		expect(src).not.toContain('Math.random');
	});
	it('generates 1000 unique IDs', () => {
		const ids = Array.from({ length: 1000 }, () => randomId());
		expect(new Set(ids).size).toBeGreaterThan(990);
	});
	it('returns a string', () => {
		expect(typeof randomId()).toBe('string');
	});
	it('has correct length', () => {
		expect(randomId()).toHaveLength(8);
	});
});
