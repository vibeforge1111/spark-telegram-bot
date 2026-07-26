import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import { resolveProjectPreviewBaseUrl } from './spawnerUrl';

export interface PreviewAddress {
  address: string;
  family: 4 | 6;
}

export interface PreviewTargetDecision {
  allowed: boolean;
  reason: string;
  target?: URL;
  address?: PreviewAddress;
  attachUiKey?: boolean;
}

export interface PreviewResponse {
  status: number;
  location?: string;
}

export type PreviewLookup = (hostname: string) => Promise<PreviewAddress[]>;

export type PreviewRequester = (
  target: URL,
  address: PreviewAddress,
  headers: Record<string, string> | undefined,
  signal: AbortSignal
) => Promise<PreviewResponse>;

const BLOCKED_ADDRESSES = new BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv4');
}

BLOCKED_ADDRESSES.addAddress('::', 'ipv6');
BLOCKED_ADDRESSES.addAddress('::1', 'ipv6');
for (const [network, prefix] of [
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fec0::', 10],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv6');
}

function isBlockedAddress(address: PreviewAddress): boolean {
  const mapped = address.address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
  if (mapped) return BLOCKED_ADDRESSES.check(mapped, 'ipv4');
  if (/^::ffff:/i.test(address.address)) return true;
  const type = isIP(address.address);
  if (type !== address.family) return true;
  return BLOCKED_ADDRESSES.check(address.address, address.family === 4 ? 'ipv4' : 'ipv6');
}

function configuredPreviewUrl(env: NodeJS.ProcessEnv): URL | null {
  try {
    const configured = new URL(resolveProjectPreviewBaseUrl(env));
    if (!['http:', 'https:'].includes(configured.protocol)) return null;
    if (configured.username || configured.password) return null;
    return configured;
  } catch {
    return null;
  }
}

function configuredPreviewPathPrefix(configured: URL): string {
  const base = configured.pathname.replace(/\/+$/, '');
  return `${base}/preview/`.replace(/^\/\//, '/');
}

function isConfiguredPreviewPath(target: URL, configured: URL | null): boolean {
  return Boolean(
    configured
    && target.origin === configured.origin
    && target.pathname.startsWith(configuredPreviewPathPrefix(configured))
  );
}

export async function defaultPreviewLookup(hostname: string): Promise<PreviewAddress[]> {
  const normalizedHostname = hostname.replace(/^\[|\]$/g, '');
  const literalFamily = isIP(normalizedHostname);
  if (literalFamily === 4 || literalFamily === 6) {
    return [{ address: normalizedHostname, family: literalFamily }];
  }
  const results = await dnsLookup(normalizedHostname, { all: true, verbatim: true });
  return results
    .filter((entry): entry is PreviewAddress => entry.family === 4 || entry.family === 6)
    .map((entry) => ({ address: entry.address, family: entry.family }));
}

export async function resolvePreviewTarget(
  rawUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  lookup: PreviewLookup = defaultPreviewLookup
): Promise<PreviewTargetDecision> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: 'invalid_url' };
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    return { allowed: false, reason: 'unsupported_protocol' };
  }
  if (target.username || target.password) {
    return { allowed: false, reason: 'embedded_credentials' };
  }

  let addresses: PreviewAddress[];
  try {
    addresses = await lookup(target.hostname);
  } catch {
    return { allowed: false, reason: 'dns_unavailable' };
  }
  if (addresses.length === 0) {
    return { allowed: false, reason: 'dns_empty' };
  }

  const configured = configuredPreviewUrl(env);
  const trustedPreviewPath = isConfiguredPreviewPath(target, configured);
  if (!trustedPreviewPath && addresses.some(isBlockedAddress)) {
    return { allowed: false, reason: 'private_or_reserved_address' };
  }

  const uiKey = env.SPARK_UI_API_KEY?.trim();
  return {
    allowed: true,
    reason: trustedPreviewPath ? 'configured_preview_path' : 'public_preview_target',
    target,
    address: addresses[0],
    attachUiKey: Boolean(trustedPreviewPath && uiKey),
  };
}

export const defaultPreviewRequester: PreviewRequester = (target, address, headers, signal) => (
  new Promise((resolve, reject) => {
    const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = transport(target, {
      method: 'GET',
      headers,
      signal,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
    }, (response) => {
      response.resume();
      resolve({
        status: response.statusCode || 0,
        location: typeof response.headers.location === 'string' ? response.headers.location : undefined,
      });
    });
    request.once('error', reject);
    request.end();
  })
);

export async function probePreviewReachability(
  rawUrl: string,
  options: {
    env?: NodeJS.ProcessEnv;
    lookup?: PreviewLookup;
    request?: PreviewRequester;
    timeoutMs?: number;
    maxRedirects?: number;
  } = {}
): Promise<boolean> {
  const env = options.env || process.env;
  const lookup = options.lookup || defaultPreviewLookup;
  const request = options.request || defaultPreviewRequester;
  const maxRedirects = options.maxRedirects ?? 3;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 2500);
  let current = rawUrl;
  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const decision = await resolvePreviewTarget(current, env, lookup);
      if (!decision.allowed || !decision.target || !decision.address) return false;
      const uiKey = env.SPARK_UI_API_KEY?.trim();
      const headers = decision.attachUiKey && uiKey ? { 'x-spawner-ui-key': uiKey } : undefined;
      const response = await request(decision.target, decision.address, headers, controller.signal);
      if (response.status >= 200 && response.status < 300) return true;
      if (response.status < 300 || response.status >= 400 || !response.location) return false;
      if (redirectCount >= maxRedirects) return false;
      current = new URL(response.location, decision.target).toString();
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
