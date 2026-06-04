import { describe, it, expect } from 'vitest';

// Isolated unit tests for the unconditional relay-secret enforcement.
// The fixed code rejects all /spawner-events requests when TELEGRAM_RELAY_SECRET
// is not configured (fail-closed) instead of silently allowing them through.

function relaySecretMatches(
	header: string | string[] | undefined,
	secret: string
): boolean {
	if (!header || !secret) return false;
	const value = Array.isArray(header) ? header[0] : header;
	return value === secret;
}

function getRelaySecret(env: Record<string, string | undefined>): string | undefined {
	return env.TELEGRAM_RELAY_SECRET?.trim() || undefined;
}

function simulateRelaySecretCheck(
	headers: Record<string, string | undefined>,
	env: Record<string, string | undefined>
): { status: number; error: string } | null {
	const relaySecret = getRelaySecret(env);
	if (!relaySecret) {
		return { status: 401, error: 'relay_secret_not_configured' };
	}
	const secretHeader = headers['x-spark-telegram-relay-secret'];
	if (!relaySecretMatches(secretHeader, relaySecret)) {
		return { status: 401, error: 'invalid_relay_secret' };
	}
	return null; // auth passed
}

describe('Relay secret — unconditional enforcement', () => {
	it('rejects requests when TELEGRAM_RELAY_SECRET is not set', () => {
		const result = simulateRelaySecretCheck(
			{ 'x-spark-telegram-relay-secret': 'anything' },
			{}
		);
		expect(result).not.toBeNull();
		expect(result!.status).toBe(401);
		expect(result!.error).toBe('relay_secret_not_configured');
	});

	it('rejects requests when TELEGRAM_RELAY_SECRET is empty string', () => {
		const result = simulateRelaySecretCheck(
			{ 'x-spark-telegram-relay-secret': 'anything' },
			{ TELEGRAM_RELAY_SECRET: '' }
		);
		expect(result).not.toBeNull();
		expect(result!.error).toBe('relay_secret_not_configured');
	});

	it('rejects requests with wrong secret', () => {
		const result = simulateRelaySecretCheck(
			{ 'x-spark-telegram-relay-secret': 'wrong-secret' },
			{ TELEGRAM_RELAY_SECRET: 'correct-secret' }
		);
		expect(result).not.toBeNull();
		expect(result!.status).toBe(401);
		expect(result!.error).toBe('invalid_relay_secret');
	});

	it('rejects requests with no secret header when secret is configured', () => {
		const result = simulateRelaySecretCheck(
			{},
			{ TELEGRAM_RELAY_SECRET: 'correct-secret' }
		);
		expect(result).not.toBeNull();
		expect(result!.error).toBe('invalid_relay_secret');
	});

	it('allows requests with correct secret header', () => {
		const result = simulateRelaySecretCheck(
			{ 'x-spark-telegram-relay-secret': 'correct-secret' },
			{ TELEGRAM_RELAY_SECRET: 'correct-secret' }
		);
		expect(result).toBeNull();
	});

	it('old conditional behavior (if relaySecret) would have allowed through with no secret configured', () => {
		// This test documents the PREVIOUS vulnerable behavior — the fix removes it.
		function oldCheck(
			headers: Record<string, string | undefined>,
			env: Record<string, string | undefined>
		): { status: number } | null {
			const relaySecret = getRelaySecret(env);
			if (relaySecret) {
				const secretHeader = headers['x-spark-telegram-relay-secret'];
				if (!relaySecretMatches(secretHeader, relaySecret)) {
					return { status: 401 };
				}
			}
			return null; // old code: passed through when relaySecret was falsy
		}
		// Old code would return null (allow) when no secret configured
		expect(oldCheck({}, {})).toBeNull();
		// New code correctly rejects
		expect(simulateRelaySecretCheck({}, {})).not.toBeNull();
	});
});
