import { queueRouteArbiterShadow } from './routeArbiter';
import { evaluateDeterministicRoute } from './routeFirewall';
import type { DeterministicRouteId } from './routeTypes';

export function routeEvidenceVerdict(input: {
  route: DeterministicRouteId;
  text: string;
}) {
  return evaluateDeterministicRoute(input.route, input.text);
}

export function routeEvidenceAllowed(input: {
  route: DeterministicRouteId;
  text: string;
  profile?: string | null;
}): boolean {
  const verdict = routeEvidenceVerdict(input);
  queueRouteArbiterShadow({
    route: input.route,
    text: input.text,
    verdict,
    profile: input.profile
  });
  if (!verdict.allow) {
    console.log(`[RouteEvidence] blocked route=${input.route} reason=${verdict.reason} textLen=${input.text.length}`);
  }
  return verdict.allow;
}
