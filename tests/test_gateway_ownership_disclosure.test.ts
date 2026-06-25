import { describe, it, expect } from 'vitest';

function buildOwnershipError(ownerId: string, hostname: string, pid: number): string {
	return `Gateway ownership already held by another instance (id: ${ownerId}). Stop that instance or wait for lease expiry.`;
}

describe('gatewayOwnership error message', () => {
	it('does not include hostname in error', () => {
		const msg = buildOwnershipError('host123:12345', 'host123', 12345);
		expect(msg).not.toContain('host123');
	});
	it('does not include PID in error', () => {
		const msg = buildOwnershipError('myhost:9999', 'myhost', 9999);
		expect(msg).not.toMatch(/\bpid\b/i);
		expect(msg).not.toContain('9999');
	});
	it('includes ownerId opaquely', () => {
		const msg = buildOwnershipError('abc:1234', 'abc', 1234);
		expect(msg).toContain('abc:1234');
	});
	it('includes lease expiry guidance', () => {
		const msg = buildOwnershipError('x:1', 'x', 1);
		expect(msg).toContain('lease expiry');
	});
	it('error message is a plain string', () => {
		const msg = buildOwnershipError('a:1', 'a', 1);
		expect(typeof msg).toBe('string');
	});
});
