// MODEL-AS-ROUTER dispatcher - the table that the regex cascade collapses into. The model picks a
// route (src/modelRouter.ts decideModelRoute), and this maps that route id to the handler that runs
// it. Each entry keeps its own deterministic authority + ledger chain (the kernel still disposes); the
// table only chooses WHICH entry runs. Routes not yet in the table return false so the caller falls
// through to the legacy cascade (strangler-fig: routes migrate in one at a time, the cascade shrinks).

import type { ModelRouteDecision } from './modelRouter';

// The per-turn handler scope a dispatch entry needs. Kept loose (any) to mirror the existing handler's
// ctx; entries close over module-level helpers in index.ts for everything else.
export interface DispatchContext {
  ctx: any;
  text: string;
  user: any;
  turnIntentEnvelope: any;
  naturalRouteShadow: any;
}

export interface DispatchEntry {
  routeId: string;
  // Runs the route. Returns true if handled (caller returns), false to fall through to the cascade.
  run(d: DispatchContext): Promise<boolean>;
}

export type DispatchTable = Map<string, DispatchEntry>;

export function buildDispatchTable(entries: DispatchEntry[]): DispatchTable {
  const table = new Map<string, DispatchEntry>();
  for (const entry of entries) table.set(entry.routeId, entry);
  return table;
}

// Dispatch the model-router-selected route through the table. Only acts on mode 'dispatch'; any other
// mode, an unknown route, or a thrown entry returns false -> the caller falls through to the cascade.
// Fail-safe by construction: a table miss or error can never block a turn, only defer to the old path.
export async function runModelDispatch(
  table: DispatchTable,
  decision: ModelRouteDecision,
  d: DispatchContext
): Promise<boolean> {
  if (decision.mode !== 'dispatch' || !decision.route) return false;
  const entry = table.get(decision.route);
  if (!entry) return false;
  try {
    return await entry.run(d);
  } catch (err) {
    console.warn(`[ModelDispatch] entry ${decision.route} threw, falling through to cascade:`, err);
    return false;
  }
}
