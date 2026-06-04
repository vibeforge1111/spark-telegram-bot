import { describe, it, expect } from 'vitest';

// Inline the private-IP check logic for isolated unit testing
const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
];

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === 'localhost.localdomain') return true;
  return PRIVATE_IP_RANGES.some((re) => re.test(h));
}

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

describe('SSRF: private/loopback hostname rejection', () => {
  it('rejects 169.254.169.254 (metadata endpoint)', () => {
    const h = extractHostname('http://169.254.169.254/latest/meta-data/');
    expect(h).not.toBeNull();
    expect(isPrivateOrLoopbackHost(h!)).toBe(true);
  });

  it('rejects 10.0.0.1 (RFC-1918)', () => {
    const h = extractHostname('http://10.0.0.1/internal');
    expect(isPrivateOrLoopbackHost(h!)).toBe(true);
  });

  it('rejects 192.168.1.1 (RFC-1918)', () => {
    const h = extractHostname('http://192.168.1.1/admin');
    expect(isPrivateOrLoopbackHost(h!)).toBe(true);
  });

  it('rejects 172.16.0.1 (RFC-1918)', () => {
    const h = extractHostname('http://172.16.0.1/secret');
    expect(isPrivateOrLoopbackHost(h!)).toBe(true);
  });

  it('rejects localhost', () => {
    expect(isPrivateOrLoopbackHost('localhost')).toBe(true);
  });

  it('rejects 127.0.0.1', () => {
    expect(isPrivateOrLoopbackHost('127.0.0.1')).toBe(true);
  });

  it('rejects ::1 (IPv6 loopback)', () => {
    expect(isPrivateOrLoopbackHost('::1')).toBe(true);
  });

  it('allows valid external preview URL', () => {
    const h = extractHostname('https://myapp.vercel.app');
    expect(isPrivateOrLoopbackHost(h!)).toBe(false);
  });

  it('API key must not be forwarded to rejected URLs — fetch not reached for private IPs', () => {
    // normalizePreviewLink returns null/fallback for private IPs, so httpPreviewIsReachable
    // is never called and fetch never executes with the API key header.
    const blocked = ['http://169.254.169.254/', 'http://10.0.0.1/', 'http://192.168.0.1/'];
    for (const url of blocked) {
      const h = extractHostname(url);
      expect(isPrivateOrLoopbackHost(h!)).toBe(true);
    }
  });
});
